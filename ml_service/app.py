"""
FastAPI Machine Learning Microservice for the AI-Powered Business Intelligence &
Decision Intelligence Platform.

Exposes REST endpoints for:
- Random Forest Regression store-wide sales forecasting (/api/ml/forecast/sales)
- Random Forest Regression product demand forecasting (/api/ml/forecast/demand)
- Isolation Forest transaction outlier detection (/api/ml/anomalies/transactions)
- Isolation Forest daily revenue anomaly scoring (/api/ml/anomalies/daily)
- Service health and model artifact inventory (/health)
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import sklearn

from config import (
    ARTIFACTS_DIR,
    MIN_DAYS_FOR_DAILY_IFOREST,
    MIN_DAYS_FOR_PRODUCT_RF,
    MIN_DAYS_FOR_RF_FORECAST,
    MIN_TRANSACTIONS_FOR_IFOREST,
)
from engine.anomaly import detect_transaction_outliers_iforest, score_daily_series_iforest
from engine.forecasting import evaluate_product_demand_rf, train_and_forecast_sales_rf

app = FastAPI(
    title="Retail BI & Decision Intelligence — Python ML Service",
    description=(
        "scikit-learn Random Forest Regression and Isolation Forest microservice "
        "integrated with the MERN Business Intelligence Platform."
    ),
    version="1.0.0",
)


# ---------------------------------------------------------------------------
# Pydantic Request Schemas
# ---------------------------------------------------------------------------
class SalesRecordInput(BaseModel):
    date: str
    amount: Optional[float] = 0.0
    value: Optional[float] = None
    quantity: Optional[float] = None


class SalesForecastRequest(BaseModel):
    records: List[SalesRecordInput] = Field(default_factory=list)
    horizon: int = Field(default=7, ge=1, le=60)
    scopeId: str = Field(default="store")
    minRequiredDays: int = Field(default=MIN_DAYS_FOR_RF_FORECAST, ge=5)


class ProductDemandItemInput(BaseModel):
    productId: str
    salesRecords: List[Dict[str, Any]] = Field(default_factory=list)
    stockQuantity: float = 0.0
    reorderThreshold: float = 10.0
    leadTimeDays: int = 7


class ProductDemandBatchRequest(BaseModel):
    products: List[ProductDemandItemInput] = Field(default_factory=list)
    horizon: int = Field(default=7, ge=1, le=60)


class TransactionOutlierRequest(BaseModel):
    transactions: List[Dict[str, Any]] = Field(default_factory=list)
    outlierThreshold: float = Field(default=3.5, gt=0.0)
    extremeThreshold: float = Field(default=5.0, gt=0.0)
    limit: int = Field(default=50, ge=0)
    scopeId: str = Field(default="store")
    minRequiredTransactions: int = Field(default=MIN_TRANSACTIONS_FOR_IFOREST, ge=5)


class DailyAnomalyScoreRequest(BaseModel):
    dailyPoints: List[Dict[str, Any]] = Field(default_factory=list)
    scopeId: str = Field(default="store")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health_check() -> Dict[str, Any]:
    artifacts = list(ARTIFACTS_DIR.glob("*.joblib"))
    return {
        "status": "success",
        "service": "python-ml-service",
        "framework": "FastAPI + scikit-learn",
        "sklearnVersion": sklearn.__version__,
        "algorithms": {
            "salesForecasting": "RandomForestRegressor",
            "productDemandForecasting": "RandomForestRegressor",
            "transactionAnomalyDetection": "IsolationForest",
            "dailyAnomalyScoring": "IsolationForest",
        },
        "thresholds": {
            "minDaysForSalesRF": MIN_DAYS_FOR_RF_FORECAST,
            "minDaysForProductRF": MIN_DAYS_FOR_PRODUCT_RF,
            "minTransactionsForIForest": MIN_TRANSACTIONS_FOR_IFOREST,
            "minDaysForDailyIForest": MIN_DAYS_FOR_DAILY_IFOREST,
        },
        "storedArtifactsCount": len(artifacts),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/ml/forecast/sales")
def forecast_sales(req: SalesForecastRequest) -> Dict[str, Any]:
    try:
        raw_records = [
            {
                "date": r.date,
                "amount": (
                    r.amount
                    if r.amount is not None
                    else (r.value if r.value is not None else (r.quantity or 0.0))
                ),
            }
            for r in req.records
        ]
        result = train_and_forecast_sales_rf(
            records=raw_records,
            horizon=req.horizon,
            scope_id=req.scopeId,
            min_required_days=req.minRequiredDays,
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Random Forest forecast error: {str(exc)}")


@app.post("/api/ml/forecast/demand")
def forecast_product_demand(req: ProductDemandBatchRequest) -> Dict[str, Any]:
    try:
        results: Dict[str, Any] = {}
        for item in req.products:
            res = evaluate_product_demand_rf(
                sales_records=item.salesRecords,
                stock_quantity=item.stockQuantity,
                reorder_threshold=item.reorderThreshold,
                lead_time_days=item.leadTimeDays,
                horizon=req.horizon,
                product_id=item.productId,
            )
            results[item.productId] = res
        return {"status": "success", "data": results}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Product RF demand error: {str(exc)}")


@app.post("/api/ml/anomalies/transactions")
def detect_transaction_anomalies(req: TransactionOutlierRequest) -> Dict[str, Any]:
    try:
        result = detect_transaction_outliers_iforest(
            transactions=req.transactions,
            outlier_threshold=req.outlierThreshold,
            extreme_threshold=req.extremeThreshold,
            limit=req.limit,
            scope_id=req.scopeId,
            min_required_transactions=req.minRequiredTransactions,
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Isolation Forest transaction error: {str(exc)}")


@app.post("/api/ml/anomalies/daily")
def score_daily_anomalies(req: DailyAnomalyScoreRequest) -> Dict[str, Any]:
    try:
        result = score_daily_series_iforest(
            daily_points=req.dailyPoints,
            scope_id=req.scopeId,
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Isolation Forest daily error: {str(exc)}")


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
