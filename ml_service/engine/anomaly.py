"""
Isolation Forest Anomaly Detection Engine (scikit-learn).

Implements:
1. Multivariate Transaction-Level Outlier Detection using sklearn.ensemble.IsolationForest
   paired with Boris Iglewicz & David Hoaglin Modified Z-Scores for full backwards compatibility.
2. Daily Revenue Anomaly Detection combining Isolation Forest decision scores with
   NIST Type 7 Interquartile Range (IQR) corridors and 7-day trailing median baselines.
3. Artifact persistence (.joblib + .meta.json) and unsupervised score separation evaluation metrics.
"""
from datetime import datetime, timezone
import json
import math
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from config import (
    ARTIFACTS_DIR,
    IF_N_ESTIMATORS,
    IF_RANDOM_STATE,
    MIN_DAYS_FOR_DAILY_IFOREST,
    MIN_TRANSACTIONS_FOR_IFOREST,
)
from engine.forecasting import align_daily_time_series, format_date_key, sanitize_scope_key

TX_FEATURE_NAMES = [
    "total_revenue",
    "quantity_sold",
    "unit_price",
    "revenue_to_median_ratio",
    "qty_to_median_ratio",
    "log_revenue",
    "day_of_week",
]


def calculate_quantile_nist7(sorted_values: List[float], p: float = 0.5) -> float:
    """NIST Type 7 continuous quantile interpolation."""
    n = len(sorted_values)
    if n == 0:
        return 0.0
    if n == 1 or p <= 0:
        return float(sorted_values[0])
    if p >= 1:
        return float(sorted_values[-1])

    h = (n - 1) * p
    i = int(math.floor(h))
    f = h - i
    if i >= n - 1:
        return float(sorted_values[-1])
    return float(sorted_values[i]) + f * (float(sorted_values[i + 1]) - float(sorted_values[i]))


def calculate_mad(values: List[float]) -> Dict[str, float]:
    """Calculate Median, Median Absolute Deviation (MAD), and MeanAD fallback."""
    valid = [float(v) for v in values if v is not None and math.isfinite(float(v))]
    if not valid:
        return {"median": 0.0, "mad": 0.0, "meanAD": 0.0, "count": 0}

    sorted_vals = sorted(valid)
    median = calculate_quantile_nist7(sorted_vals, 0.5)
    abs_devs = sorted(abs(v - median) for v in valid)
    mad = calculate_quantile_nist7(abs_devs, 0.5)
    mean_ad = sum(abs_devs) / len(valid)

    return {
        "median": round(median, 2),
        "mad": round(mad, 2),
        "meanAD": round(mean_ad, 2),
        "count": len(valid),
    }


def calculate_modified_z_scores(values: List[float]) -> List[float]:
    """Calculate Boris Iglewicz & David Hoaglin Modified Z-Scores."""
    stats = calculate_mad(values)
    if stats["count"] == 0:
        return []

    median = stats["median"]
    mad = stats["mad"]
    mean_ad = stats["meanAD"]

    use_mean_ad = mad == 0 and mean_ad > 0
    denominator = mean_ad if use_mean_ad else mad
    factor = 0.7979 if use_mean_ad else 0.6745

    scores: List[float] = []
    for val in values:
        num = float(val or 0.0)
        if not math.isfinite(num) or denominator == 0:
            scores.append(0.0)
        else:
            scores.append(round((factor * (num - median)) / denominator, 2))
    return scores


def detect_transaction_outliers_iforest(
    transactions: List[Dict[str, Any]],
    outlier_threshold: float = 3.5,
    extreme_threshold: float = 5.0,
    limit: int = 50,
    scope_id: str = "store",
    min_required_transactions: int = MIN_TRANSACTIONS_FOR_IFOREST,
) -> Dict[str, Any]:
    """
    Detect transaction-level outliers using scikit-learn IsolationForest on multivariate
    transaction features combined with Modified Z-Score statistics.
    """
    n_tx = len(transactions) if transactions else 0
    if n_tx < min_required_transactions:
        return {
            "hasSufficientData": False,
            "mlTrained": False,
            "minRequiredTransactions": min_required_transactions,
            "totalTransactions": n_tx,
            "message": (
                f"Pattern analysis requires at least {min_required_transactions} transactions "
                f"to detect multi-factor transaction outliers reliably. Current dataset has {n_tx} transaction(s)."
            ),
            "outliers": [],
            "allEvaluatedCount": n_tx,
            "summary": {
                "totalOutliers": 0,
                "highSeverityCount": 0,
                "mediumSeverityCount": 0,
                "lowSeverityCount": 0,
            },
        }

    amounts = [
        float(tx.get("totalRevenue", tx.get("amount", 0.0)) or 0.0)
        for tx in transactions
    ]
    quantities = [
        max(1.0, float(tx.get("quantitySold", tx.get("quantity", 1.0)) or 1.0))
        for tx in transactions
    ]
    unit_prices = [
        float(tx.get("unitPrice", 0.0) or (amounts[i] / quantities[i]))
        for i, tx in enumerate(transactions)
    ]

    mad_stats = calculate_mad(amounts)
    qty_stats = calculate_mad(quantities)
    z_scores = calculate_modified_z_scores(amounts)

    median_rev = max(1.0, mad_stats["median"])
    median_qty = max(1.0, qty_stats["median"])

    # Build 7-feature matrix for IsolationForest
    X_rows: List[List[float]] = []
    for i, tx in enumerate(transactions):
        rev = amounts[i]
        qty = quantities[i]
        uprice = unit_prices[i]
        rev_ratio = rev / median_rev
        qty_ratio = qty / median_qty
        log_rev = math.log1p(max(0.0, rev))

        d_key = format_date_key(tx.get("date"))
        if d_key:
            dow = float(datetime.strptime(d_key, "%Y-%m-%d").weekday())
        else:
            dow = 0.0

        X_rows.append([rev, qty, uprice, rev_ratio, qty_ratio, log_rev, dow])

    X_mat = np.array(X_rows, dtype=float)

    # Check if feature matrix has zero variance across all columns (all identical transactions)
    col_stds = np.std(X_mat, axis=0)
    has_variance = bool(np.any(col_stds > 1e-9))

    if has_variance:
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            (
                "iforest",
                IsolationForest(
                    n_estimators=IF_N_ESTIMATORS,
                    contamination="auto",
                    random_state=IF_RANDOM_STATE,
                ),
            ),
        ])
        pipeline.fit(X_mat)
        if_preds = pipeline.predict(X_mat)  # -1 for anomaly, +1 for inlier
        decision_scores = pipeline.decision_function(X_mat)  # < 0 for anomalies
        raw_anomaly_scores = -pipeline.score_samples(X_mat)  # higher = more anomalous
    else:
        pipeline = None
        if_preds = np.ones(n_tx, dtype=int)
        decision_scores = np.zeros(n_tx, dtype=float)
        raw_anomaly_scores = np.zeros(n_tx, dtype=float)

    # Save artifact if trained
    safe_key = sanitize_scope_key(scope_id)
    artifact_path = ARTIFACTS_DIR / f"iforest_tx_{safe_key}.joblib"
    meta_path = ARTIFACTS_DIR / f"iforest_tx_{safe_key}.meta.json"

    evaluated: List[Dict[str, Any]] = []
    outliers: List[Dict[str, Any]] = []
    inlier_dec_scores: List[float] = []
    outlier_dec_scores: List[float] = []

    for i, tx in enumerate(transactions):
        amount = amounts[i]
        z_score = z_scores[i]
        abs_z = abs(z_score)
        dec_score = round(float(decision_scores[i]), 4)
        iso_score = round(float(raw_anomaly_scores[i]), 4)
        if_flagged = bool(if_preds[i] == -1 and dec_score < -0.02)
        z_flagged = bool(abs_z >= outlier_threshold)

        # Combine Isolation Forest multivariate detection with Modified Z-Score safeguard
        is_outlier = has_variance and (z_flagged or (if_flagged and abs_z >= 2.0))

        severity: Optional[str] = None
        outlier_type: Optional[str] = None
        explanation = "Transaction is within normal historical value and volume patterns."

        if is_outlier:
            outlier_dec_scores.append(dec_score)
            if abs_z >= extreme_threshold or dec_score <= -0.15:
                severity = "High"
            elif abs_z >= 4.0 or dec_score <= -0.08:
                severity = "Medium"
            else:
                severity = "Low"

            outlier_type = (
                "unusually_high_value"
                if amount >= mad_stats["median"]
                else "unusually_low_value"
            )

            factor_over = (
                round(amount / mad_stats["median"], 1)
                if mad_stats["median"] > 0
                else 0.0
            )
            if outlier_type == "unusually_high_value":
                explanation = (
                    f"Transaction of ₹{amount:,.2f} stands out as unusually high "
                    f"({f'{factor_over}x typical receipt value, ' if factor_over > 1 else ''}"
                    f"deviation score: {z_score:.2f}). "
                    f"Typical receipt value is ₹{mad_stats['median']:,.2f}."
                )
            else:
                explanation = (
                    f"Transaction of ₹{amount:,.2f} is unusually low compared to typical sales "
                    f"(deviation score: {z_score:.2f}). "
                    f"Typical receipt value is ₹{mad_stats['median']:,.2f}."
                )
        else:
            inlier_dec_scores.append(dec_score)

        record = {
            "id": str(tx.get("_id") or tx.get("id") or f"tx-{i}"),
            "date": format_date_key(tx.get("date")),
            "productName": tx.get("productName") or "Unknown Product",
            "quantitySold": int(quantities[i]),
            "unitPrice": round(unit_prices[i], 2),
            "totalRevenue": round(amount, 2),
            "paymentMethod": tx.get("paymentMethod") or "cash",
            "modifiedZScore": z_score,
            "isolationForestDecisionScore": dec_score,
            "isolationForestAnomalyScore": iso_score,
            "isOutlier": is_outlier,
            "outlierType": outlier_type,
            "severity": severity,
            "explanation": explanation,
        }

        evaluated.append(record)
        if is_outlier:
            outliers.append(record)

    # Sort outliers by most anomalous (highest |Modified Z-Score| and lowest Isolation Forest decision score)
    outliers.sort(
        key=lambda o: (abs(o["modifiedZScore"]), -o["isolationForestDecisionScore"]),
        reverse=True,
    )
    capped_outliers = outliers[:limit] if limit > 0 else outliers

    inlier_mean = round(float(np.mean(inlier_dec_scores)), 4) if inlier_dec_scores else 0.0
    outlier_mean = round(float(np.mean(outlier_dec_scores)), 4) if outlier_dec_scores else None
    separation_delta = (
        round(inlier_mean - outlier_mean, 4)
        if outlier_mean is not None
        else None
    )

    eval_metrics = {
        "algorithm": "IsolationForest (sklearn.ensemble.IsolationForest)",
        "nEstimators": IF_N_ESTIMATORS,
        "featureNames": TX_FEATURE_NAMES,
        "totalEvaluated": n_tx,
        "outliersDetected": len(outliers),
        "outlierRatePct": round((len(outliers) / max(1, n_tx)) * 100.0, 2),
        "inlierMeanDecisionScore": inlier_mean,
        "outlierMeanDecisionScore": outlier_mean,
        "scoreSeparationDelta": separation_delta,
        "artifactPath": str(artifact_path.name) if pipeline is not None else None,
    }

    if pipeline is not None:
        joblib.dump(pipeline, artifact_path)
        meta_path.write_text(
            json.dumps(
                {
                    "modelType": "IsolationForest",
                    "scopeId": safe_key,
                    "trainedAt": datetime.now(timezone.utc).isoformat(),
                    "evaluation": eval_metrics,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    return {
        "hasSufficientData": True,
        "mlTrained": True,
        "algorithm": "Isolation Forest (scikit-learn) + Modified Z-Score",
        "minRequiredTransactions": min_required_transactions,
        "totalTransactions": n_tx,
        "statistics": {
            "median": mad_stats["median"],
            "mad": mad_stats["mad"],
            "meanAD": mad_stats["meanAD"],
            "outlierThreshold": outlier_threshold,
            "extremeThreshold": extreme_threshold,
        },
        "mlEvaluation": eval_metrics,
        "summary": {
            "totalOutliers": len(outliers),
            "highSeverityCount": sum(1 for o in outliers if o["severity"] == "High"),
            "mediumSeverityCount": sum(1 for o in outliers if o["severity"] == "Medium"),
            "lowSeverityCount": sum(1 for o in outliers if o["severity"] == "Low"),
        },
        "outliers": capped_outliers,
        "allEvaluatedCount": len(evaluated),
    }


def score_daily_series_iforest(
    daily_points: List[Dict[str, Any]],
    scope_id: str = "store",
) -> Dict[str, Any]:
    """
    Train an IsolationForest on recorded daily revenue points when >= MIN_DAYS_FOR_DAILY_IFOREST
    distinct days exist, returning per-date Isolation Forest anomaly scores and evaluation metrics.
    """
    recorded_pts = [pt for pt in daily_points if pt.get("isRecorded")]
    if len(recorded_pts) < MIN_DAYS_FOR_DAILY_IFOREST:
        return {
            "mlTrained": False,
            "distinctRecordedDays": len(recorded_pts),
            "minRequiredDays": MIN_DAYS_FOR_DAILY_IFOREST,
            "scoresByDate": {},
        }

    X_rows: List[List[float]] = []
    dates: List[str] = []
    revs = [float(pt.get("revenue", 0.0)) for pt in recorded_pts]

    for idx, pt in enumerate(recorded_pts):
        rev = float(pt.get("revenue", 0.0))
        trailing_med = pt.get("trailingMedian")
        dev_ratio = (
            (rev - float(trailing_med)) / max(1.0, float(trailing_med))
            if trailing_med is not None and float(trailing_med) > 0
            else 0.0
        )
        window_3 = revs[max(0, idx - 2) : idx + 1]
        std_3 = float(np.std(window_3, ddof=1)) if len(window_3) >= 2 else 0.0
        d_str = str(pt.get("date"))
        dow = float(datetime.strptime(d_str[:10], "%Y-%m-%d").weekday())

        X_rows.append([rev, dev_ratio, std_3, dow])
        dates.append(d_str)

    X_mat = np.array(X_rows, dtype=float)
    if not np.any(np.std(X_mat, axis=0) > 1e-9):
        return {
            "mlTrained": False,
            "distinctRecordedDays": len(recorded_pts),
            "minRequiredDays": MIN_DAYS_FOR_DAILY_IFOREST,
            "scoresByDate": {},
        }

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        (
            "iforest",
            IsolationForest(
                n_estimators=IF_N_ESTIMATORS,
                contamination="auto",
                random_state=IF_RANDOM_STATE,
            ),
        ),
    ])
    pipeline.fit(X_mat)
    dec_scores = pipeline.decision_function(X_mat)

    safe_key = sanitize_scope_key(scope_id)
    artifact_path = ARTIFACTS_DIR / f"iforest_daily_{safe_key}.joblib"
    joblib.dump(pipeline, artifact_path)

    scores_by_date = {
        d: round(float(score), 4) for d, score in zip(dates, dec_scores)
    }

    return {
        "mlTrained": True,
        "algorithm": "IsolationForest (sklearn.ensemble.IsolationForest) + IQR Corridor",
        "distinctRecordedDays": len(recorded_pts),
        "artifactPath": str(artifact_path.name),
        "scoresByDate": scores_by_date,
    }
