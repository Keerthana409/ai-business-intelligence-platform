/**
 * Native JavaScript Mathematical & Statistical Forecasting Engine
 * AI-Powered Business Intelligence & Decision Intelligence Platform
 *
 * Implements:
 * - Continuous daily time-series alignment
 * - Holt's Linear Exponential Smoothing (Double Exponential Smoothing)
 * - Chronological retrospective backtesting (leak-free train/test evaluation)
 * - Evaluation metrics: MAE, RMSE, WAPE, and conditional MAPE
 * - Approximate empirical uncertainty bounds
 * - Product-level unit demand and inventory stockout risk estimation
 *
 * Strictly traditional mathematics. Zero LLMs, generative APIs, or synthetic data.
 */

/**
 * Format Date to YYYY-MM-DD (ISO UTC string format)
 */
export const formatDateKey = (date) => {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return '';
  }
  return d.toISOString().slice(0, 10);
};

/**
 * Add days to a YYYY-MM-DD string or Date object using UTC calendar math
 */
export const addDays = (dateStr, days) => {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
};

/**
 * Align discrete daily sales records into a continuous daily chronological series.
 * Fills intermediate missing trading calendar days with zero sales between min and max date.
 *
 * @param {Array<{ date: Date|string, amount: number }>} records
 * @returns {{ series: Array<{ date: string, value: number, isRecorded: boolean }>, distinctRecordedDays: number }}
 */
export const alignDailyTimeSeries = (records = []) => {
  if (!records || records.length === 0) {
    return { series: [], distinctRecordedDays: 0, dateSpanDays: 0, startDate: null, endDate: null };
  }

  // Aggregate by calendar date
  const dateMap = new Map();
  for (const r of records) {
    const key = formatDateKey(r.date);
    if (!key) continue;
    const amt = Number(r.amount || 0);
    dateMap.set(key, (dateMap.get(key) || 0) + amt);
  }

  const sortedDates = Array.from(dateMap.keys()).sort();
  const distinctRecordedDays = sortedDates.length;

  if (distinctRecordedDays === 0) {
    return { series: [], distinctRecordedDays: 0, dateSpanDays: 0, startDate: null, endDate: null };
  }

  const startDate = new Date(`${sortedDates[0]}T00:00:00.000Z`);
  const endDate = new Date(`${sortedDates[sortedDates.length - 1]}T00:00:00.000Z`);

  const series = [];
  const curr = new Date(startDate);

  while (curr <= endDate) {
    const key = curr.toISOString().slice(0, 10);
    const hasRecord = dateMap.has(key);
    series.push({
      date: key,
      value: hasRecord ? Number(dateMap.get(key).toFixed(2)) : 0,
      isRecorded: hasRecord,
    });
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  return {
    series,
    distinctRecordedDays,
    dateSpanDays: series.length,
    startDate: sortedDates[0],
    endDate: sortedDates[sortedDates.length - 1],
  };
};

/**
 * Default damped trend parameter (0 < phi <= 1).
 * phi = 0.5 damps multi-step linear extrapolation so steep short-term slopes taper off
 * rather than forcing future multi-day revenue forecasts to zero.
 * Setting phi = 1.0 recovers undamped Holt linear extrapolation.
 */
export const DEFAULT_DAMPING_PHI = 0.5;

/**
 * Holt's Linear Exponential Smoothing with Configurable Damped Trend & Non-Negative Constraints
 *
 * Initialization:
 * Computes an Ordinary Least Squares (OLS) regression slope and intercept over an
 * initial window m = min(5, n). This avoids catastrophic sensitivity to a single
 * initial day's jump (such as ₹600 down to ₹225).
 *
 * In-sample Recursion:
 * Level: L_t = max(0, alpha * y_t + (1 - alpha) * max(0, L_{t-1} + T_{t-1}))
 * Trend: T_t = beta * (L_t - L_{t-1}) + (1 - beta) * T_{t-1}
 * Trend Damping: If L_t + T_t < 0, damp T_t = -L_t to ensure next period's expected
 * level remains within the non-negative retail domain without negative runaway.
 *
 * Out-of-Sample Damped Forecast:
 * y_hat_{t+h} = max(0, L_t + (sum_{i=1}^h phi^i) * T_t)
 *
 * @param {number[]} values - Historical observations
 * @param {number} horizon - Number of steps to forecast ahead (e.g. 7, 14, 30)
 * @param {number} alpha - Level smoothing parameter (0 < alpha <= 1, default 0.3)
 * @param {number} beta - Trend smoothing parameter (0 < beta <= 1, default 0.1)
 * @param {number} phi - Damped trend parameter (0 < phi <= 1, default 0.5; 1.0 = undamped)
 * @returns {{ fitted: number[], forecast: number[], finalLevel: number, finalTrend: number, dampingPhi: number }}
 */
export const calculateHoltLinear = (
  values = [],
  horizon = 7,
  alpha = 0.3,
  beta = 0.1,
  phi = DEFAULT_DAMPING_PHI
) => {
  const n = values.length;
  if (n < 2) {
    throw new Error('Holt linear smoothing requires at least 2 historical observations.');
  }

  const safeHorizon = Math.max(1, Math.floor(Number(horizon) || 7));
  const safePhi =
    typeof phi === 'number' && Number.isFinite(phi) && phi > 0 && phi <= 1
      ? phi
      : DEFAULT_DAMPING_PHI;

  // Regression slope initialization over window m = min(5, n)
  const m = Math.min(5, n);
  let sumT = 0, sumY = 0, sumTY = 0, sumT2 = 0;
  for (let i = 0; i < m; i++) {
    sumT += i;
    sumY += values[i];
    sumTY += i * values[i];
    sumT2 += i * i;
  }
  const meanT = sumT / m;
  const meanY = sumY / m;
  const denom = sumT2 - m * meanT * meanT;
  const slope = denom !== 0 ? (sumTY - m * meanT * meanY) / denom : 0;
  const intercept = meanY - slope * meanT;

  // Level initialized to non-negative intercept (fallback to values[0] if intercept <= 0)
  let level = Math.max(0, intercept > 0 ? intercept : values[0]);
  let trend = slope;

  // If initial projected level level + trend < 0, damp initial trend
  if (level + trend < 0) {
    trend = -level;
  }

  const fitted = [level];

  // In-sample recursion
  for (let t = 1; t < n; t++) {
    const prevLevel = level;
    const prevTrend = trend;
    const y = values[t];

    // Bounded prior expectation for non-negative domain
    const priorLevel = Math.max(0, prevLevel + prevTrend);

    // Standard Holt level update with non-negative guarantee
    level = Math.max(0, alpha * y + (1 - alpha) * priorLevel);

    // Standard Holt trend update
    trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;

    // Trend damping: prevent negative trend from projecting negative level on next step
    if (level + trend < 0) {
      trend = -level;
    }

    // One-step ahead fitted value (non-negative)
    fitted.push(Math.max(0, Number((prevLevel + prevTrend).toFixed(2))));
  }

  // Generate out-of-sample forecast with damped trend multiplier sum_{i=1}^h (phi^i)
  const forecast = [];
  let cumulativePhi = 0;
  for (let h = 1; h <= safeHorizon; h++) {
    cumulativePhi += Math.pow(safePhi, h);
    const rawVal = level + cumulativePhi * trend;
    forecast.push(Math.max(0, Number(rawVal.toFixed(2))));
  }

  return {
    fitted,
    forecast,
    finalLevel: Number(level.toFixed(2)),
    finalTrend: Number(trend.toFixed(4)),
    dampingPhi: safePhi,
  };
};

/**
 * Model Evaluation Metrics: MAE, RMSE, WAPE, and Conditional MAPE
 *
 * @param {number[]} actuals - Ground truth values
 * @param {number[]} predicted - Predicted values
 * @returns {{ mae: number, rmse: number, wape: number, mape: number|null, mapeExplanation: string, normalizedAccuracy: number, sampleSize: number }}
 */
export const calculateEvaluationMetrics = (actuals = [], predicted = []) => {
  const k = Math.min(actuals.length, predicted.length);
  if (k === 0) {
    return {
      mae: 0,
      rmse: 0,
      wape: 0,
      mape: null,
      mapeExplanation: 'No evaluation points available',
      normalizedAccuracy: 0,
      sampleSize: 0,
    };
  }

  let absErrorSum = 0;
  let sqErrorSum = 0;
  let actualSum = 0;
  let nonZeroCount = 0;
  let nonZeroAbsPctSum = 0;

  for (let i = 0; i < k; i++) {
    const act = actuals[i];
    const pred = predicted[i];
    const diff = act - pred;

    absErrorSum += Math.abs(diff);
    sqErrorSum += diff * diff;
    actualSum += act;

    if (act > 0) {
      nonZeroAbsPctSum += Math.abs(diff) / act;
      nonZeroCount++;
    }
  }

  const mae = Number((absErrorSum / k).toFixed(2));
  const rmse = Number(Math.sqrt(sqErrorSum / k).toFixed(2));

  // WAPE = sum(|actual - pred|) / sum(actual) * 100%
  let wape = 0;
  let normalizedAccuracy = 0;
  if (actualSum > 0) {
    wape = Number(((absErrorSum / actualSum) * 100).toFixed(1));
    normalizedAccuracy = Math.max(0, Number((100 - wape).toFixed(1)));
  }

  // Conditional MAPE
  let mape = null;
  let mapeExplanation = '';
  if (nonZeroCount === k) {
    mape = Number(((nonZeroAbsPctSum / k) * 100).toFixed(1));
    mapeExplanation = 'Calculated across all historical test observations.';
  } else if (nonZeroCount > 0) {
    mape = Number(((nonZeroAbsPctSum / nonZeroCount) * 100).toFixed(1));
    mapeExplanation = `Calculated on ${nonZeroCount} of ${k} days with non-zero sales (omits zero-sales days to avoid division by zero).`;
  } else {
    mape = null;
    mapeExplanation = 'Undefined: all historical test observations have zero sales.';
  }

  return {
    mae,
    rmse,
    wape,
    mape,
    mapeExplanation,
    normalizedAccuracy,
    sampleSize: k,
  };
};

/**
 * Chronological Retrospective Backtest
 * Ensures no future data leaks into the model used to predict earlier observations.
 * Splits series chronologically into train (first N - k days) and test (last k days).
 * Compares both the active damped formulation (phi) and undamped formulation (phi = 1.0).
 *
 * @param {number[]} values - Continuous chronological series
 * @param {number} testHorizon - Number of holdout days (default 3)
 * @param {number} alpha - Level smoothing parameter (default 0.3)
 * @param {number} beta - Trend smoothing parameter (default 0.1)
 * @param {number} phi - Damped trend parameter (default 0.5; 1.0 = undamped)
 * @returns {object}
 */
export const runChronologicalBacktest = (
  values = [],
  testHorizon = 3,
  alpha = 0.3,
  beta = 0.1,
  phi = DEFAULT_DAMPING_PHI
) => {
  const n = values.length;
  // Require at least 5 points total (e.g. 3 train, 2 test)
  if (n < 5) {
    return {
      hasSufficientDataForBacktest: false,
      reason: 'At least 5 continuous days required for chronological backtesting.',
    };
  }

  const safePhi =
    typeof phi === 'number' && Number.isFinite(phi) && phi > 0 && phi <= 1
      ? phi
      : DEFAULT_DAMPING_PHI;

  const k = Math.min(testHorizon, Math.max(2, Math.floor(n * 0.25)));
  const trainSize = n - k;

  const trainValues = values.slice(0, trainSize);
  const testActuals = values.slice(trainSize);

  // Train Holt's model strictly on trainValues with active damping parameter
  const { forecast, dampingPhi } = calculateHoltLinear(trainValues, k, alpha, beta, safePhi);
  const metrics = calculateEvaluationMetrics(testActuals, forecast);

  // Also evaluate undamped Holt linear formulation (phi = 1.0) on identical split for comparison
  const { forecast: undampedForecast } = calculateHoltLinear(trainValues, k, alpha, beta, 1.0);
  const undampedMetrics = calculateEvaluationMetrics(testActuals, undampedForecast);

  return {
    hasSufficientDataForBacktest: true,
    validationMethod: 'Statistical Holt Holdout',
    isMLValidated: false,
    isProvisional: n < 14,
    statisticalBacktestStatus: n >= 14 ? 'Verified (Statistical Holdout)' : 'Provisional (Needs 14+ Days)',
    mlValidationStatus: n >= 14 ? 'Pending ML Training' : 'Pending (Needs 14+ Days)',
    accuracyStatus: n >= 14 ? 'Statistical Holdout Only (ML Inactive)' : 'Pending (Needs 14+ Days)',
    requiredDaysForValidation: 14,
    additionalDaysNeededForValidation: Math.max(0, 14 - n),
    dampingPhi,
    trainSize,
    testSize: k,
    testActuals,
    testPredictions: forecast,
    metrics,
    formulationComparison: {
      damped: {
        phi: dampingPhi,
        predictions: forecast,
        mae: metrics.mae,
        rmse: metrics.rmse,
        wape: metrics.wape,
        normalizedAccuracy: metrics.normalizedAccuracy,
      },
      undamped: {
        phi: 1.0,
        predictions: undampedForecast,
        mae: undampedMetrics.mae,
        rmse: undampedMetrics.rmse,
        wape: undampedMetrics.wape,
        normalizedAccuracy: undampedMetrics.normalizedAccuracy,
      },
    },
  };
};

/**
 * Compute Approximate Uncertainty Range
 * Uses residual standard error (RMSE) under empirical normal error variation assumptions.
 *
 * @param {number[]} forecastValues
 * @param {number} residualStdError - Base error (RMSE)
 * @returns {Array<{ value: number, lowerBound: number, upperBound: number }>}
 */
export const calculateUncertaintyBands = (forecastValues = [], residualStdError = 0) => {
  const se = Math.max(0.5, residualStdError);

  return forecastValues.map((val, idx) => {
    // Uncertainty widens moderately with forecast horizon
    const horizonFactor = Math.sqrt(1 + idx * 0.08);
    const margin = Number((1.96 * se * horizonFactor).toFixed(2));

    return {
      value: val,
      lowerBound: Math.max(0, Number((val - margin).toFixed(2))),
      upperBound: Number((val + margin).toFixed(2)),
      uncertaintyMargin: margin,
    };
  });
};

/**
 * Compute Product Demand Forecast and Runout Analysis
 *
 * @param {object} params
 * @param {Array<{ date: Date|string, quantity: number }>} params.salesRecords
 * @param {number} params.stockQuantity - Current on-hand stock
 * @param {number} params.reorderThreshold - Reorder safety point
 * @param {number} params.leadTimeDays - Supplier replenishment delay
 * @param {number} params.horizon - Forecast horizon days (e.g. 7, 14, 30)
 * @param {number} params.phi - Damped trend parameter (default 0.5)
 * @returns {object}
 */
export const evaluateProductDemandRisk = ({
  salesRecords = [],
  stockQuantity = 0,
  reorderThreshold = 10,
  leadTimeDays = 7,
  horizon = 7,
  phi = DEFAULT_DAMPING_PHI,
}) => {
  const { series, distinctRecordedDays } = alignDailyTimeSeries(
    salesRecords.map((r) => ({ date: r.date, amount: r.quantity }))
  );

  // Product Data Gate: requires at least 3 distinct days with recorded sales
  if (distinctRecordedDays < 3) {
    let status = 'Pending History';
    if (stockQuantity === 0) {
      status = 'Out of Stock';
    } else if (stockQuantity <= reorderThreshold) {
      status = 'Low Stock (Buffer Alert)';
    }

    return {
      hasSufficientData: false,
      distinctRecordedDays,
      minRequiredDays: 3,
      minRequiredDaysForML: 10,
      additionalDaysNeededForBaseline: Math.max(0, 3 - distinctRecordedDays),
      additionalDaysNeededForML: Math.max(0, 10 - distinctRecordedDays),
      reason: `Product has ${distinctRecordedDays} distinct sales day(s); 3 required for trend baseline, 10 for AI Random Forest.`,
      currentStock: stockQuantity,
      reorderThreshold,
      leadTimeDays,
      status,
      runoutDays: stockQuantity === 0 ? 0 : null,
      projectedDailyDemand: 0,
      totalProjectedDemand: 0,
      suggestedReorder: stockQuantity <= reorderThreshold ? Math.max(1, reorderThreshold * 2 - stockQuantity) : 0,
    };
  }

  const values = series.map((s) => s.value);
  const safeHorizon = Math.max(1, Number(horizon) || 7);
  const operationalLeadTime = Math.max(1, Number(leadTimeDays) || 7);

  const { forecast } = calculateHoltLinear(values, safeHorizon, 0.35, 0.1, phi);
  const { forecast: leadTimeForecast } =
    operationalLeadTime === safeHorizon
      ? { forecast }
      : calculateHoltLinear(values, operationalLeadTime, 0.35, 0.1, phi);

  const totalProjectedDemand = Number(
    forecast.reduce((sum, v) => sum + v, 0).toFixed(1)
  );
  const rawLeadTimeTotal = Number(
    leadTimeForecast.reduce((sum, v) => sum + v, 0).toFixed(1)
  );
  const avgDailyDemand = Number((rawLeadTimeTotal / operationalLeadTime).toFixed(2));

  // Reorder quantity recommendation:
  // Buffer needed to cover demand during supplier lead time + safety reorder threshold
  const leadTimeDemand = Number((avgDailyDemand * operationalLeadTime).toFixed(1));
  const targetStock = Math.ceil(reorderThreshold + leadTimeDemand);
  const suggestedReorder =
    stockQuantity <= reorderThreshold && avgDailyDemand <= 0
      ? Math.max(1, reorderThreshold * 2 - stockQuantity)
      : Math.max(0, Math.ceil(targetStock - stockQuantity));

  let runoutDays = null;
  let status = 'Low / Safe';

  if (stockQuantity === 0) {
    runoutDays = 0;
    status = 'Out of Stock';
  } else if (avgDailyDemand === 0) {
    runoutDays = null; // Zero projected demand
    status = 'Zero Projected Demand';
  } else {
    runoutDays = Number((stockQuantity / avgDailyDemand).toFixed(1));

    if (runoutDays <= operationalLeadTime || runoutDays <= 3) {
      status = 'Critical Risk';
    } else if (
      runoutDays <= operationalLeadTime * 1.25 ||
      stockQuantity - leadTimeDemand <= reorderThreshold
    ) {
      status = 'High Risk';
    } else if (runoutDays <= operationalLeadTime * 1.5) {
      status = 'Moderate Risk';
    } else {
      status = 'Low / Safe';
    }
  }

  return {
    hasSufficientData: true,
    distinctRecordedDays,
    series,
    forecast,
    totalProjectedDemand,
    avgDailyDemand,
    stockQuantity,
    reorderThreshold,
    leadTimeDays: operationalLeadTime,
    leadTimeDemand,
    targetStock,
    runoutDays,
    status,
    suggestedReorder,
  };
};
