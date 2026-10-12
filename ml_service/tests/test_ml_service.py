"""
Automated pytest suite for the Python FastAPI + scikit-learn ML Service.
Tests:
1. Leak-free causal time-series feature engineering.
2. Random Forest Regression sales forecasting & chronological holdout evaluation.
3. Data sufficiency gates (<14 days for RF forecast, <15 transactions for Isolation Forest).
4. Isolation Forest multivariate transaction outlier detection & artifact persistence.
5. FastAPI REST endpoints via TestClient.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from app import app
from config import ARTIFACTS_DIR
from engine.anomaly import detect_transaction_outliers_iforest
from engine.forecasting import (
    align_daily_time_series,
    create_supervised_dataset,
    train_and_forecast_sales_rf,
)

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "success"
    assert body["algorithms"]["salesForecasting"] == "RandomForestRegressor"
    assert body["algorithms"]["transactionAnomalyDetection"] == "IsolationForest"


def test_causal_feature_engineering_no_future_leakage():
    """
    Verify that modifying y_t or y_{t+1} never changes the feature vector X_t.
    """
    records_a = [
        {"date": f"2026-09-{day:02d}", "amount": 100.0 + day * 5}
        for day in range(1, 20)
    ]
    records_b = [dict(r) for r in records_a]
    # Mutate future target values at end of series B
    records_b[-1]["amount"] = 99999.0
    records_b[-2]["amount"] = 88888.0

    series_a = align_daily_time_series(records_a)["series"]
    series_b = align_daily_time_series(records_b)["series"]

    X_a, y_a, _ = create_supervised_dataset(series_a, warmup_lags=7)
    X_b, y_b, _ = create_supervised_dataset(series_b, warmup_lags=7)

    # For all rows up to second-to-last (where history is identical), X must be identical
    for i in range(len(X_a) - 1):
        assert list(X_a[i]) == list(X_b[i]), f"Leakage detected at row {i}"


def test_rf_insufficient_data_gate():
    """
    Verify that 6 distinct days (like the sparse user dataset) is honestly rejected
    for Random Forest training (<14 days required).
    """
    sparse_records = [
        {"date": f"2026-10-0{d}", "amount": 200.0 + d * 10}
        for d in range(1, 7)
    ]
    res = train_and_forecast_sales_rf(sparse_records, horizon=7, scope_id="test_sparse")
    assert res["hasSufficientData"] is False
    assert res["mlTrained"] is False
    assert res["distinctRecordedDays"] == 6
    assert res["minRequiredDays"] == 14


def test_rf_training_backtest_and_forecast():
    """
    Verify Random Forest training on 21 days of realistic weekly seasonal + upward trend retail sales.
    """
    records = []
    for d in range(1, 22):
        # Weekly pattern + gentle upward trend
        dow_bonus = 80.0 if (d % 7 in (6, 0)) else 0.0
        amt = 300.0 + d * 8.0 + dow_bonus
        records.append({"date": f"2026-09-{d:02d}", "amount": amt})

    res = train_and_forecast_sales_rf(records, horizon=7, scope_id="pytest_rf")
    assert res["hasSufficientData"] is True
    assert res["mlTrained"] is True
    assert res["algorithm"] == "Random Forest Regression (scikit-learn)"
    assert len(res["predictions"]) == 7
    assert all(p["forecastRevenue"] >= 0 for p in res["predictions"])
    assert res["modelEvaluation"] is not None
    assert res["modelEvaluation"]["mae"] >= 0
    assert res["modelEvaluation"]["rmse"] >= 0
    assert res["modelEvaluation"]["backtestTestDays"] >= 2
    assert (ARTIFACTS_DIR / "rf_sales_pytest_rf.joblib").exists()


def test_isolation_forest_transactions():
    """
    Verify Isolation Forest flags extreme anomalous transactions while passing insufficient data gate.
    """
    # 1. Insufficient transactions (<15)
    small_tx = [
        {"_id": f"tx-{i}", "date": "2026-10-01", "productName": "Milk", "quantitySold": 2, "unitPrice": 30, "totalRevenue": 60}
        for i in range(8)
    ]
    insufficient_res = detect_transaction_outliers_iforest(small_tx, scope_id="pytest_if_small")
    assert insufficient_res["hasSufficientData"] is False
    assert insufficient_res["mlTrained"] is False

    # 2. Sufficient transactions (20 normal + 1 extreme anomaly)
    tx_list = [
        {
            "_id": f"tx-{i}",
            "date": f"2026-09-{(i % 20) + 1:02d}",
            "productName": "Rice",
            "quantitySold": 2 + (i % 3),
            "unitPrice": 50.0,
            "totalRevenue": float((2 + (i % 3)) * 50.0),
            "paymentMethod": "cash",
        }
        for i in range(20)
    ]
    # Inject clear wholesale bulk anomaly
    tx_list.append({
        "_id": "tx-anomaly-99",
        "date": "2026-09-21",
        "productName": "Rice Bulk Order",
        "quantitySold": 80,
        "unitPrice": 50.0,
        "totalRevenue": 4000.0,
        "paymentMethod": "card",
    })

    if_res = detect_transaction_outliers_iforest(tx_list, scope_id="pytest_if_full")
    assert if_res["hasSufficientData"] is True
    assert if_res["mlTrained"] is True
    assert if_res["summary"]["totalOutliers"] >= 1
    top_outlier = if_res["outliers"][0]
    assert top_outlier["id"] == "tx-anomaly-99"
    assert top_outlier["isolationForestDecisionScore"] < 0
    assert (ARTIFACTS_DIR / "iforest_tx_pytest_if_full.joblib").exists()


def test_fastapi_endpoints():
    # Forecast endpoint with 30 trading days
    records = [
        {"date": f"2026-09-{d:02d}", "amount": 1500.0 + d * 15.0}
        for d in range(1, 31)
    ]
    f_res = client.post("/api/ml/forecast/sales", json={"records": records, "horizon": 7, "scopeId": "api_test_30d"})
    assert f_res.status_code == 200
    f_data = f_res.json()["data"]
    assert f_data["mlTrained"] is True
    assert f_data["historicalCoverage"]["distinctRecordedDays"] == 30
    assert f_data["modelEvaluation"]["isMLValidated"] is True
    assert f_data["modelEvaluation"]["accuracyStatus"] == "Verified (Random Forest Holdout)"

    # Transactions endpoint with 18 transactions
    txs = [
        {"_id": f"t-{i}", "date": "2026-09-10", "productName": "Item", "quantitySold": 2, "unitPrice": 25.0, "totalRevenue": 50.0}
        for i in range(17)
    ] + [
        {"_id": "t-outlier", "date": "2026-09-10", "productName": "Item", "quantitySold": 50, "unitPrice": 25.0, "totalRevenue": 1250.0}
    ]
    a_res = client.post("/api/ml/anomalies/transactions", json={"transactions": txs, "scopeId": "api_test"})
    assert a_res.status_code == 200
    assert a_res.json()["data"]["mlTrained"] is True
    assert a_res.json()["data"]["summary"]["totalOutliers"] >= 1
