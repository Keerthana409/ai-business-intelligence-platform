"""
Random Forest Regression Forecasting Engine (scikit-learn).

Implements:
1. Continuous daily time-series alignment.
2. Strictly causal (leak-free) time-based feature engineering:
   - Autoregressive lags: lag_1, lag_2, lag_3, lag_7
   - Trailing rolling window statistics (excluding target day t):
     rolling_mean_3, rolling_std_3, rolling_mean_7, momentum_3_7
   - Calendar & trend features: day_of_week, is_weekend, day_of_month, time_index
3. Chronological train/test split and recursive multi-step holdout evaluation
   (zero future data leakage).
4. Model training with sklearn.ensemble.RandomForestRegressor, feature importance
   extraction, ensemble tree dispersion uncertainty bounds, and joblib artifact storage.
"""
from datetime import datetime, timedelta, timezone
import json
import math
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor

from config import (
    ARTIFACTS_DIR,
    MIN_DAYS_FOR_PRODUCT_RF,
    MIN_DAYS_FOR_RF_FORECAST,
    RF_MAX_DEPTH,
    RF_MIN_SAMPLES_LEAF,
    RF_N_ESTIMATORS,
    RF_RANDOM_STATE,
)

FEATURE_NAMES = [
    "lag_1",
    "lag_2",
    "lag_3",
    "lag_7",
    "rolling_mean_3",
    "rolling_std_3",
    "rolling_mean_7",
    "momentum_3_7",
    "day_of_week",
    "is_weekend",
    "day_of_month",
    "time_index",
]


def format_date_key(date_val: Any) -> str:
    """Normalize a date string or datetime to YYYY-MM-DD."""
    if not date_val:
        return ""
    s = str(date_val).strip()
    if len(s) >= 10 and re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return ""


def add_days(date_str: str, days: int) -> str:
    """Add calendar days to a YYYY-MM-DD string."""
    dt = datetime.strptime(date_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    target = dt + timedelta(days=days)
    return target.strftime("%Y-%m-%d")


def align_daily_time_series(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Align discrete daily sales records into a continuous daily chronological series.
    Fills intermediate missing calendar days with 0.0 between min and max date.
    """
    if not records:
        return {
            "series": [],
            "distinctRecordedDays": 0,
            "dateSpanDays": 0,
            "startDate": None,
            "endDate": None,
        }

    date_map: Dict[str, float] = {}
    for r in records:
        key = format_date_key(r.get("date"))
        if not key:
            continue
        amt = float(r.get("amount", r.get("value", r.get("quantity", 0.0))) or 0.0)
        date_map[key] = date_map.get(key, 0.0) + amt

    sorted_dates = sorted(date_map.keys())
    distinct_recorded_days = len(sorted_dates)
    if distinct_recorded_days == 0:
        return {
            "series": [],
            "distinctRecordedDays": 0,
            "dateSpanDays": 0,
            "startDate": None,
            "endDate": None,
        }

    start_dt = datetime.strptime(sorted_dates[0], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_dt = datetime.strptime(sorted_dates[-1], "%Y-%m-%d").replace(tzinfo=timezone.utc)

    series = []
    curr = start_dt
    while curr <= end_dt:
        key = curr.strftime("%Y-%m-%d")
        has_rec = key in date_map
        val = round(date_map[key], 2) if has_rec else 0.0
        series.append({
            "date": key,
            "value": val,
            "isRecorded": has_rec,
        })
        curr += timedelta(days=1)

    return {
        "series": series,
        "distinctRecordedDays": distinct_recorded_days,
        "dateSpanDays": len(series),
        "startDate": sorted_dates[0],
        "endDate": sorted_dates[-1],
    }


def build_feature_vector(
    history_values: List[float],
    target_date_str: str,
    time_idx: int,
) -> List[float]:
    """
    Build a 12-dimensional causal feature vector for target day at `time_idx`
    using strictly observations prior to `time_idx` (`history_values` has length >= 7
    representing [..., y_{t-2}, y_{t-1}]).
    """
    lag_1 = float(history_values[-1])
    lag_2 = float(history_values[-2]) if len(history_values) >= 2 else lag_1
    lag_3 = float(history_values[-3]) if len(history_values) >= 3 else lag_2
    lag_7 = float(history_values[-7]) if len(history_values) >= 7 else float(np.mean(history_values))

    window_3 = history_values[-3:] if len(history_values) >= 3 else history_values
    window_7 = history_values[-7:] if len(history_values) >= 7 else history_values

    rolling_mean_3 = float(np.mean(window_3))
    rolling_std_3 = float(np.std(window_3, ddof=1)) if len(window_3) >= 2 else 0.0
    rolling_mean_7 = float(np.mean(window_7))
    momentum_3_7 = rolling_mean_3 - rolling_mean_7

    dt = datetime.strptime(target_date_str[:10], "%Y-%m-%d")
    day_of_week = float(dt.weekday())  # 0=Monday .. 6=Sunday
    is_weekend = 1.0 if dt.weekday() >= 5 else 0.0
    day_of_month = float(dt.day)

    return [
        lag_1,
        lag_2,
        lag_3,
        lag_7,
        rolling_mean_3,
        rolling_std_3,
        rolling_mean_7,
        momentum_3_7,
        day_of_week,
        is_weekend,
        day_of_month,
        float(time_idx),
    ]


def create_supervised_dataset(
    series: List[Dict[str, Any]],
    warmup_lags: int = 7,
) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Transform aligned daily series into supervised (X, y, dates) matrices
    starting at index `warmup_lags` so every sample has complete lag history.
    """
    values = [float(item["value"]) for item in series]
    dates = [str(item["date"]) for item in series]

    X_rows: List[List[float]] = []
    y_rows: List[float] = []
    target_dates: List[str] = []

    for t in range(warmup_lags, len(series)):
        prior_history = values[:t]  # Strictly indices 0 .. t-1 (excludes t)
        feats = build_feature_vector(prior_history, dates[t], t)
        X_rows.append(feats)
        y_rows.append(values[t])
        target_dates.append(dates[t])

    return np.array(X_rows, dtype=float), np.array(y_rows, dtype=float), target_dates


def predict_recursive_horizon(
    model: RandomForestRegressor,
    seed_values: List[float],
    last_date_str: str,
    start_time_idx: int,
    horizon: int,
) -> Tuple[List[float], List[float]]:
    """
    Autoregressively forecast `horizon` future days without any future leakage.
    Also computes per-step ensemble tree standard deviation across all trees in the forest.
    """
    working_history = list(seed_values)
    predictions: List[float] = []
    tree_stds: List[float] = []

    for step in range(1, horizon + 1):
        target_date = add_days(last_date_str, step)
        t_idx = start_time_idx + step - 1
        feats = build_feature_vector(working_history, target_date, t_idx)
        X_step = np.array([feats], dtype=float)

        raw_pred = float(model.predict(X_step)[0])
        bounded_pred = max(0.0, round(raw_pred, 2))
        predictions.append(bounded_pred)

        # Compute dispersion across individual estimators in the Random Forest
        per_tree_preds = [max(0.0, float(est.predict(X_step)[0])) for est in model.estimators_]
        tree_std = float(np.std(per_tree_preds, ddof=1)) if len(per_tree_preds) > 1 else 0.0
        tree_stds.append(round(tree_std, 2))

        # Append predicted value to history for next step's lag features
        working_history.append(bounded_pred)

    return predictions, tree_stds


def calculate_evaluation_metrics(
    actuals: List[float],
    predicted: List[float],
) -> Dict[str, Any]:
    """
    Calculate MAE, RMSE, WAPE, Conditional MAPE, and Normalized Accuracy
    matching the exact mathematical definitions in the platform.
    """
    k = min(len(actuals), len(predicted))
    if k == 0:
        return {
            "mae": 0.0,
            "rmse": 0.0,
            "wape": 0.0,
            "mape": None,
            "mapeExplanation": "No evaluation points available",
            "normalizedAccuracy": 0.0,
            "sampleSize": 0,
        }

    abs_err_sum = 0.0
    sq_err_sum = 0.0
    actual_sum = 0.0
    non_zero_count = 0
    non_zero_abs_pct_sum = 0.0

    for i in range(k):
        act = float(actuals[i])
        pred = float(predicted[i])
        diff = act - pred

        abs_err_sum += abs(diff)
        sq_err_sum += diff * diff
        actual_sum += act

        if act > 0:
            non_zero_abs_pct_sum += abs(diff) / act
            non_zero_count += 1

    mae = round(abs_err_sum / k, 2)
    rmse = round(math.sqrt(sq_err_sum / k), 2)

    wape = 0.0
    normalized_accuracy = 0.0
    if actual_sum > 0:
        wape = round((abs_err_sum / actual_sum) * 100.0, 1)
        normalized_accuracy = max(0.0, round(100.0 - wape, 1))

    if non_zero_count == k:
        mape = round((non_zero_abs_pct_sum / k) * 100.0, 1)
        mape_explanation = "Calculated across all historical holdout test observations."
    elif non_zero_count > 0:
        mape = round((non_zero_abs_pct_sum / non_zero_count) * 100.0, 1)
        mape_explanation = (
            f"Calculated on {non_zero_count} of {k} days with non-zero sales "
            "(omits zero-sales days to avoid division by zero)."
        )
    else:
        mape = None
        mape_explanation = "Undefined: all historical test observations have zero sales."

    return {
        "mae": mae,
        "rmse": rmse,
        "wape": wape,
        "mape": mape,
        "mapeExplanation": mape_explanation,
        "normalizedAccuracy": normalized_accuracy,
        "sampleSize": k,
    }


def run_rf_chronological_backtest(
    series: List[Dict[str, Any]],
    test_horizon: int = 3,
    warmup_lags: int = 7,
) -> Dict[str, Any]:
    """
    Leak-free chronological train/test evaluation for Random Forest Regression.
    1. Splits series chronologically into train_series = series[:N-k] and test_series = series[N-k:].
    2. Fits RandomForestRegressor strictly on supervised samples derived from train_series.
    3. Forecasts k steps ahead autoregressively and compares against test_series actuals.
    """
    n = len(series)
    effective_samples = n - warmup_lags
    if effective_samples < 5:
        return {
            "hasSufficientDataForBacktest": False,
            "reason": (
                f"At least {warmup_lags + 5} continuous daily points required for "
                "Random Forest lag warm-up and chronological holdout testing."
            ),
        }

    k = min(test_horizon, max(2, int(math.floor(effective_samples * 0.25))))
    train_end_idx = n - k

    train_series = series[:train_end_idx]
    test_series = series[train_end_idx:]

    X_train, y_train, _ = create_supervised_dataset(train_series, warmup_lags=warmup_lags)
    if len(X_train) < 3:
        return {
            "hasSufficientDataForBacktest": False,
            "reason": "Insufficient supervised training samples after lag warm-up.",
        }

    rf_backtest = RandomForestRegressor(
        n_estimators=RF_N_ESTIMATORS,
        max_depth=RF_MAX_DEPTH,
        min_samples_leaf=RF_MIN_SAMPLES_LEAF,
        random_state=RF_RANDOM_STATE,
    )
    rf_backtest.fit(X_train, y_train)

    seed_values = [float(item["value"]) for item in train_series]
    last_train_date = str(train_series[-1]["date"])

    test_predictions, _ = predict_recursive_horizon(
        model=rf_backtest,
        seed_values=seed_values,
        last_date_str=last_train_date,
        start_time_idx=train_end_idx,
        horizon=k,
    )
    test_actuals = [round(float(item["value"]), 2) for item in test_series]

    metrics = calculate_evaluation_metrics(test_actuals, test_predictions)

    return {
        "hasSufficientDataForBacktest": True,
        "trainSize": train_end_idx,
        "supervisedTrainSamples": int(len(X_train)),
        "testSize": k,
        "testDates": [str(item["date"]) for item in test_series],
        "testActuals": test_actuals,
        "testPredictions": test_predictions,
        "metrics": metrics,
    }


def sanitize_scope_key(scope: str) -> str:
    """Sanitize scope identifier for safe filename storage."""
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", str(scope or "default"))
    return cleaned[:64] or "default"


def train_and_forecast_sales_rf(
    records: List[Dict[str, Any]],
    horizon: int = 7,
    scope_id: str = "store",
    min_required_days: int = MIN_DAYS_FOR_RF_FORECAST,
) -> Dict[str, Any]:
    """
    Train a RandomForestRegressor on store-wide daily sales history,
    run chronological backtesting, save model artifact, and forecast `horizon` days ahead.
    """
    aligned = align_daily_time_series(records)
    series = aligned["series"]
    distinct_days = aligned["distinctRecordedDays"]
    date_span_days = aligned["dateSpanDays"]
    start_date = aligned["startDate"]
    end_date = aligned["endDate"]

    warmup_lags = 7
    supervised_count = max(0, len(series) - warmup_lags)

    # Check strict ML data sufficiency gate
    if distinct_days < min_required_days or supervised_count < 5:
        if distinct_days < min_required_days:
            needed = min_required_days - distinct_days
            reason_msg = (
                f"Random Forest Regression requires at least {min_required_days} distinct recorded "
                f"trading days ({needed} more day(s) needed). "
                f"Current dataset has {distinct_days} distinct recorded day(s) across {date_span_days} calendar day(s)."
            )
        else:
            reason_msg = (
                f"Random Forest Regression requires at least 5 supervised post-warmup training samples "
                f"(>=12 continuous calendar days). Current dataset has {distinct_days} distinct recorded day(s) "
                f"across {date_span_days} calendar day(s) ({supervised_count} supervised sample(s))."
            )
        return {
            "hasSufficientData": False,
            "mlTrained": False,
            "minRequiredDays": min_required_days,
            "distinctRecordedDays": distinct_days,
            "dateSpanDays": date_span_days,
            "supervisedSampleCount": supervised_count,
            "reason": reason_msg,
        }

    # 1. Leak-free chronological train/test evaluation
    backtest = run_rf_chronological_backtest(series, test_horizon=3, warmup_lags=warmup_lags)

    # 2. Fit final Random Forest model on full supervised historical dataset
    X_all, y_all, supervised_dates = create_supervised_dataset(series, warmup_lags=warmup_lags)
    rf_model = RandomForestRegressor(
        n_estimators=RF_N_ESTIMATORS,
        max_depth=RF_MAX_DEPTH,
        min_samples_leaf=RF_MIN_SAMPLES_LEAF,
        random_state=RF_RANDOM_STATE,
    )
    rf_model.fit(X_all, y_all)

    # Extract feature importances
    importances_raw = rf_model.feature_importances_
    feature_importances = {
        name: round(float(imp), 4)
        for name, imp in sorted(
            zip(FEATURE_NAMES, importances_raw),
            key=lambda item: item[1],
            reverse=True,
        )
    }

    # 3. Persist trained model artifact and metadata
    safe_key = sanitize_scope_key(scope_id)
    artifact_path = ARTIFACTS_DIR / f"rf_sales_{safe_key}.joblib"
    meta_path = ARTIFACTS_DIR / f"rf_sales_{safe_key}.meta.json"

    metadata = {
        "modelType": "RandomForestRegressor",
        "scopeId": safe_key,
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "hyperparameters": {
            "n_estimators": RF_N_ESTIMATORS,
            "max_depth": RF_MAX_DEPTH,
            "min_samples_leaf": RF_MIN_SAMPLES_LEAF,
            "random_state": RF_RANDOM_STATE,
        },
        "featureNames": FEATURE_NAMES,
        "featureImportances": feature_importances,
        "distinctRecordedDays": distinct_days,
        "totalCalendarDays": date_span_days,
        "supervisedSampleCount": int(len(X_all)),
        "startDate": start_date,
        "endDate": end_date,
        "backtestMetrics": backtest.get("metrics") if backtest.get("hasSufficientDataForBacktest") else None,
    }

    try:
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(rf_model, artifact_path)
        meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    except Exception:
        pass

    # 4. Generate out-of-sample recursive forecast for `horizon` days
    all_values = [float(item["value"]) for item in series]
    forecast_vals, tree_stds = predict_recursive_horizon(
        model=rf_model,
        seed_values=all_values,
        last_date_str=end_date,
        start_time_idx=len(series),
        horizon=horizon,
    )

    backtest_rmse = (
        float(backtest["metrics"]["rmse"])
        if backtest.get("hasSufficientDataForBacktest")
        else float(np.std(y_all, ddof=1) if len(y_all) > 1 else 5.0)
    )

    predictions = []
    for idx, val in enumerate(forecast_vals):
        pred_date = add_days(end_date, idx + 1)
        horizon_factor = math.sqrt(1.0 + idx * 0.08)
        # Combine backtest residual RMSE with ensemble tree dispersion
        combined_se = max(0.5, 0.7 * backtest_rmse + 0.3 * tree_stds[idx])
        margin = round(1.96 * combined_se * horizon_factor, 2)
        predictions.append({
            "date": pred_date,
            "forecastRevenue": val,
            "lowerBound": max(0.0, round(val - margin, 2)),
            "upperBound": round(val + margin, 2),
            "uncertaintyMargin": margin,
            "ensembleTreeStd": tree_stds[idx],
        })

    total_projected_revenue = round(sum(p["forecastRevenue"] for p in predictions), 2)

    # Calculate recent level and trend equivalent for UI backwards compatibility
    recent_window = all_values[-7:] if len(all_values) >= 7 else all_values
    final_level = round(float(np.mean(recent_window)), 2)
    final_trend = round(
        (forecast_vals[-1] - forecast_vals[0]) / max(1, len(forecast_vals) - 1),
        4,
    ) if len(forecast_vals) > 1 else 0.0

    return {
        "hasSufficientData": True,
        "mlTrained": True,
        "horizon": horizon,
        "algorithm": "Random Forest Regression (scikit-learn)",
        "parameters": {
            "n_estimators": RF_N_ESTIMATORS,
            "max_depth": RF_MAX_DEPTH,
            "min_samples_leaf": RF_MIN_SAMPLES_LEAF,
            "alpha": f"RF(trees={RF_N_ESTIMATORS})",
            "beta": f"depth={RF_MAX_DEPTH}",
            "finalLevel": final_level,
            "finalTrend": final_trend,
            "featureImportances": feature_importances,
            "artifactPath": str(artifact_path.name),
        },
        "historicalCoverage": {
            "startDate": start_date,
            "endDate": end_date,
            "distinctRecordedDays": distinct_days,
            "totalCalendarDays": date_span_days,
            "supervisedTrainingSamples": int(len(X_all)),
        },
        "historicalActuals": series[-30:],
        "predictions": predictions,
        "totalProjectedRevenue": total_projected_revenue,
        "modelEvaluation": (
            {
                "mae": backtest["metrics"]["mae"],
                "rmse": backtest["metrics"]["rmse"],
                "wape": backtest["metrics"]["wape"],
                "mape": backtest["metrics"]["mape"],
                "mapeExplanation": backtest["metrics"]["mapeExplanation"],
                "normalizedAccuracy": backtest["metrics"]["normalizedAccuracy"],
                "validationMethod": "Random Forest Chronological Holdout",
                "isMLValidated": True,
                "isProvisional": False,
                "accuracyStatus": "Verified (Random Forest Holdout)",
                "statisticalBacktestStatus": "Verified (Random Forest Holdout)",
                "mlValidationStatus": "Verified (Random Forest Holdout)",
                "accuracyDefinition": (
                    "Normalized Backtest Accuracy = max(0, 100 - WAPE)%, evaluated via "
                    "leak-free chronological train/test split on RandomForestRegressor."
                ),
                "backtestTrainDays": backtest["trainSize"],
                "supervisedTrainSamples": backtest["supervisedTrainSamples"],
                "backtestTestDays": backtest["testSize"],
                "backtestActuals": backtest["testActuals"],
                "backtestPredictions": backtest["testPredictions"],
            }
            if backtest.get("hasSufficientDataForBacktest")
            else None
        ),
        "transparency": {
            "algorithmName": "Random Forest Regressor (sklearn.ensemble.RandomForestRegressor)",
            "formula": (
                "y_hat_t = (1/B) * sum_{b=1..B} T_b(X_t), where X_t = [lag_1, lag_2, lag_3, lag_7, "
                "rolling_mean_3, rolling_std_3, rolling_mean_7, momentum_3_7, day_of_week, is_weekend, day_of_month, time_index]"
            ),
            "uncertaintyMethod": (
                "Ensemble tree dispersion + holdout backtest RMSE (±1.96 × combined standard error)."
            ),
            "limitations": (
                "Tree-based ensemble trained on historical lags and calendar features. "
                "Requires at least 14 distinct recorded trading days; falls back to Holt's Linear "
                "Exponential Smoothing when fewer than 14 days are recorded."
            ),
            "minimumComputationalRequirementNote": (
                f"{min_required_days} distinct recorded trading days required for Random Forest training "
                "(7-day lag warm-up + chronological train/test split)."
            ),
            "featureImportances": feature_importances,
        },
    }


def evaluate_product_demand_rf(
    sales_records: List[Dict[str, Any]],
    stock_quantity: float = 0,
    reorder_threshold: float = 10,
    lead_time_days: int = 7,
    horizon: int = 7,
    product_id: str = "product",
) -> Dict[str, Any]:
    """
    Train a product-level RandomForestRegressor when >= MIN_DAYS_FOR_PRODUCT_RF (10)
    distinct days of sales exist for the SKU. Otherwise indicate fallback to statistical Holt smoothing.
    """
    aligned = align_daily_time_series(
        [{"date": r.get("date"), "amount": r.get("quantity", r.get("amount", 0))} for r in sales_records]
    )
    series = aligned["series"]
    distinct_days = aligned["distinctRecordedDays"]

    warmup_lags = 7
    supervised_count = max(0, len(series) - warmup_lags)

    if distinct_days < MIN_DAYS_FOR_PRODUCT_RF or supervised_count < 4:
        return {
            "mlUsed": False,
            "distinctRecordedDays": distinct_days,
            "minRequiredDaysForML": MIN_DAYS_FOR_PRODUCT_RF,
            "reason": (
                f"Product has {distinct_days} distinct sales day(s); {MIN_DAYS_FOR_PRODUCT_RF} required "
                "for SKU-level Random Forest training."
            ),
        }

    X_all, y_all, _ = create_supervised_dataset(series, warmup_lags=warmup_lags)
    rf_prod = RandomForestRegressor(
        n_estimators=60,
        max_depth=5,
        min_samples_leaf=2,
        random_state=RF_RANDOM_STATE,
    )
    rf_prod.fit(X_all, y_all)

    safe_key = sanitize_scope_key(product_id)
    try:
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(rf_prod, ARTIFACTS_DIR / f"rf_product_{safe_key}.joblib")
    except Exception:
        pass

    all_values = [float(item["value"]) for item in series]
    forecast, _ = predict_recursive_horizon(
        model=rf_prod,
        seed_values=all_values,
        last_date_str=aligned["endDate"],
        start_time_idx=len(series),
        horizon=horizon,
    )

    total_projected_demand = round(sum(forecast), 1)
    avg_daily_demand = round(total_projected_demand / max(1, horizon), 2)

    stock = float(stock_quantity or 0)
    threshold = float(reorder_threshold or 10)
    lead_time = int(lead_time_days or 7)

    runout_days: Optional[float] = None
    status = "Low / Safe"

    if stock == 0:
        runout_days = 0.0
        status = "Out of Stock"
    elif avg_daily_demand == 0:
        runout_days = None
        status = "Zero Projected Demand"
    else:
        runout_days = round(stock / avg_daily_demand, 1)
        if runout_days <= lead_time or runout_days <= 3:
            status = "Critical Risk"
        elif runout_days <= horizon or (stock - total_projected_demand) <= threshold:
            status = "High Risk"
        elif runout_days <= horizon * 1.5:
            status = "Moderate Risk"
        else:
            status = "Low / Safe"

    lead_time_demand = round(avg_daily_demand * lead_time, 1)
    target_stock = threshold + lead_time_demand
    suggested_reorder = max(0, int(math.ceil(target_stock - stock)))

    return {
        "mlUsed": True,
        "algorithm": "Random Forest Regression (scikit-learn)",
        "hasSufficientData": True,
        "distinctRecordedDays": distinct_days,
        "series": series,
        "forecast": forecast,
        "totalProjectedDemand": total_projected_demand,
        "avgDailyDemand": avg_daily_demand,
        "stockQuantity": stock,
        "reorderThreshold": threshold,
        "leadTimeDays": lead_time,
        "leadTimeDemand": lead_time_demand,
        "runoutDays": runout_days,
        "status": status,
        "suggestedReorder": suggested_reorder,
    }
