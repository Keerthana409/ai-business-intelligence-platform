"""
Offline Training & Chronological Evaluation Script
AI-Powered Business Intelligence & Decision Intelligence Platform

Evaluates:
1. Real database state (read-only) via provided series from retail_bi_db (6 trading days)
   -> Verifies honest insufficiency gate (< 14 days for Random Forest, < 15 transactions for Isolation Forest)
2. Leak-free chronological train/test evaluation of RandomForestRegressor (scikit-learn)
   on a 30-day retail sales series (24 train days -> 6 holdout test days)
3. Multivariate IsolationForest (scikit-learn) evaluation on a 22-receipt transaction set
   containing both univariate revenue spikes and multivariate price/quantity anomalies.
"""

import json
from engine.forecasting import train_and_forecast_sales_rf, evaluate_product_demand_rf
from engine.anomaly import detect_transaction_outliers_iforest, score_daily_series_iforest


def evaluate_real_db_snapshot():
    """
    Exact read-only sales series from local retail_bi_db for testowner@example.com:
    2026-10-01: ₹600.00
    2026-10-02: ₹225.00
    2026-10-03: ₹320.00
    2026-10-04: ₹360.00
    2026-10-05: ₹150.00
    2026-10-06: ₹150.00
    (6 distinct trading days, 6 transactions)
    """
    real_db_series = [
        {"date": "2026-10-01", "amount": 600.0},
        {"date": "2026-10-02", "amount": 225.0},
        {"date": "2026-10-03", "amount": 320.0},
        {"date": "2026-10-04", "amount": 360.0},
        {"date": "2026-10-05", "amount": 150.0},
        {"date": "2026-10-06", "amount": 150.0},
    ]
    res = train_and_forecast_sales_rf(
        records=real_db_series,
        horizon=7,
        scope_id="real_db_audit",
    )
    return res


def evaluate_30day_chronological_benchmark():
    """
    30-day realistic retail store revenue series with weekly seasonality (weekend surge)
    and upward trend.
    Chronological split: first 24 days train, last 6 days test (zero future data leakage).
    """
    series_30d = [
        {"date": "2026-09-01", "amount": 410.0},
        {"date": "2026-09-02", "amount": 425.0},
        {"date": "2026-09-03", "amount": 440.0},
        {"date": "2026-09-04", "amount": 465.0},
        {"date": "2026-09-05", "amount": 610.0},  # Sat
        {"date": "2026-09-06", "amount": 590.0},  # Sun
        {"date": "2026-09-07", "amount": 430.0},
        {"date": "2026-09-08", "amount": 445.0},
        {"date": "2026-09-09", "amount": 460.0},
        {"date": "2026-09-10", "amount": 475.0},
        {"date": "2026-09-11", "amount": 490.0},
        {"date": "2026-09-12", "amount": 640.0},  # Sat
        {"date": "2026-09-13", "amount": 615.0},  # Sun
        {"date": "2026-09-14", "amount": 455.0},
        {"date": "2026-09-15", "amount": 470.0},
        {"date": "2026-09-16", "amount": 485.0},
        {"date": "2026-09-17", "amount": 500.0},
        {"date": "2026-09-18", "amount": 515.0},
        {"date": "2026-09-19", "amount": 670.0},  # Sat
        {"date": "2026-09-20", "amount": 645.0},  # Sun
        {"date": "2026-09-21", "amount": 480.0},
        {"date": "2026-09-22", "amount": 495.0},
        {"date": "2026-09-23", "amount": 510.0},
        {"date": "2026-09-24", "amount": 525.0},
        {"date": "2026-09-25", "amount": 540.0},
        {"date": "2026-09-26", "amount": 695.0},  # Sat
        {"date": "2026-09-27", "amount": 670.0},  # Sun
        {"date": "2026-09-28", "amount": 505.0},
        {"date": "2026-09-29", "amount": 520.0},
        {"date": "2026-09-30", "amount": 535.0},
    ]

    rf_res = train_and_forecast_sales_rf(
        records=series_30d,
        horizon=7,
        scope_id="benchmark_30d",
    )
    return rf_res


def evaluate_isolation_forest_benchmark():
    """
    20 normal transactions + 2 clear anomalies (bulk institutional order + abnormal unit price).
    """
    txs = []
    for i in range(1, 21):
        txs.append(
            {
                "_id": f"tx-{i}",
                "date": f"2026-09-{i:02d}",
                "productName": "Wireless Keyboard",
                "category": "Electronics",
                "quantitySold": 2 + (i % 2),
                "unitPrice": 45.0,
                "totalRevenue": float((2 + (i % 2)) * 45.0),
                "paymentMethod": "card",
            }
        )
    # Anomaly 1: Bulk order spike
    txs.append(
        {
            "_id": "tx-outlier-bulk",
            "date": "2026-09-21",
            "productName": "Wireless Keyboard",
            "category": "Electronics",
            "quantitySold": 45,
            "unitPrice": 45.0,
            "totalRevenue": 2025.0,
            "paymentMethod": "bank_transfer",
        }
    )
    # Anomaly 2: High-ticket server rack equipment
    txs.append(
        {
            "_id": "tx-outlier-price",
            "date": "2026-09-22",
            "productName": "Enterprise POS Terminal",
            "category": "Hardware",
            "quantitySold": 1,
            "unitPrice": 1450.0,
            "totalRevenue": 1450.0,
            "paymentMethod": "card",
        }
    )

    iforest_res = detect_transaction_outliers_iforest(
        transactions=txs,
        outlier_threshold=3.5,
        extreme_threshold=5.0,
        limit=50,
        scope_id="benchmark_tx",
    )
    return iforest_res


if __name__ == "__main__":
    real_db_eval = evaluate_real_db_snapshot()
    rf_30d_eval = evaluate_30day_chronological_benchmark()
    iforest_eval = evaluate_isolation_forest_benchmark()

    report = {
        "realDatabaseAudit": {
            "distinctRecordedDays": real_db_eval["distinctRecordedDays"],
            "minRequiredDaysForRF": real_db_eval["minRequiredDays"],
            "mlTrained": real_db_eval["mlTrained"],
            "reason": real_db_eval["reason"],
        },
        "randomForest30DayBenchmark": {
            "algorithm": rf_30d_eval["algorithm"],
            "modelEvaluation": rf_30d_eval["modelEvaluation"],
            "parameters": {
                k: v
                for k, v in rf_30d_eval["parameters"].items()
                if k != "featureImportances"
            },
            "topFeatureImportances": dict(
                list(rf_30d_eval["parameters"]["featureImportances"].items())[:5]
            ),
            "totalProjected7DayRevenue": rf_30d_eval["totalProjectedRevenue"],
        },
        "isolationForestBenchmark": {
            "algorithm": iforest_eval["algorithm"],
            "totalTransactions": iforest_eval["totalTransactions"],
            "outliersDetected": iforest_eval["summary"]["totalOutliers"],
            "detectedOutlierIds": [o["id"] for o in iforest_eval["outliers"]],
            "statistics": iforest_eval["statistics"],
        },
    }
    print(json.dumps(report, indent=2))
