/**
 * Native JavaScript Mathematical & Statistical Anomaly Detection Engine
 * AI-Powered Business Intelligence & Decision Intelligence Platform
 *
 * Implements:
 * - NIST Type 7 Continuous Quantile Interpolation (Quartiles & IQR)
 * - Median and Median Absolute Deviation (MAD) with MeanAD fallback (Boris Iglewicz & David Hoaglin 1993)
 * - Modified Z-score transaction-level outlier detection
 * - Rolling trailing median baseline (strictly historical, day t excluded)
 * - Non-parametric daily revenue anomaly corridors [Q1 - k*IQR, Q3 + k*IQR]
 * - Multi-level severity classification (Low, Medium, High)
 * - Distinction between recorded zero days, unrecorded dates, and true revenue drops
 * - Protection against IQR=0, MAD=0, zero-baselines, empty inputs, and invalid dates
 * - Plain-English domain-specific explainability
 *
 * Strictly traditional statistical mathematics. Zero LLMs, generative APIs, or synthetic data.
 */

import { alignDailyTimeSeries, formatDateKey } from './forecastingEngine.js';

/**
 * NIST Type 7 Continuous Quantile Interpolation
 *
 * For sorted array x_0 <= x_1 <= ... <= x_{n-1} and p in [0, 1]:
 * h = (n - 1) * p
 * i = floor(h)
 * f = h - i
 * Q(p) = x_i + f * (x_{i+1} - x_i)
 *
 * @param {number[]} sortedValues - Array of numbers sorted in ascending order
 * @param {number} p - Desired quantile in [0, 1]
 * @returns {number} Interpolated quantile value
 */
export const calculateQuantile = (sortedValues = [], p = 0.5) => {
  const n = sortedValues.length;
  if (n === 0) return 0;
  if (n === 1) return Number(sortedValues[0]) || 0;
  if (p <= 0) return Number(sortedValues[0]) || 0;
  if (p >= 1) return Number(sortedValues[n - 1]) || 0;

  const h = (n - 1) * p;
  const i = Math.floor(h);
  const f = h - i;

  if (i >= n - 1) return Number(sortedValues[n - 1]) || 0;

  const valI = Number(sortedValues[i]) || 0;
  const valNext = Number(sortedValues[i + 1]) || 0;
  return valI + f * (valNext - valI);
};

/**
 * Calculate quartiles and Interquartile Range (IQR) using NIST Type 7 interpolation.
 *
 * @param {number[]} values - Array of numeric observations
 * @returns {{ q1: number, median: number, q3: number, iqr: number, min: number, max: number, count: number }}
 */
export const calculateQuartiles = (values = []) => {
  const valid = values
    .map(Number)
    .filter((v) => !isNaN(v) && isFinite(v));

  if (valid.length === 0) {
    return { q1: 0, median: 0, q3: 0, iqr: 0, min: 0, max: 0, count: 0 };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const q1 = Number(calculateQuantile(sorted, 0.25).toFixed(2));
  const median = Number(calculateQuantile(sorted, 0.5).toFixed(2));
  const q3 = Number(calculateQuantile(sorted, 0.75).toFixed(2));
  const iqr = Number((q3 - q1).toFixed(2));

  return {
    q1,
    median,
    q3,
    iqr,
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    count: sorted.length,
  };
};

/**
 * Calculate Median and Median Absolute Deviation (MAD).
 * Also computes Mean Absolute Deviation (MeanAD) as a robust fallback
 * when MAD = 0 (e.g. when > 50% of values are identical).
 *
 * Reference: Boris Iglewicz and David Hoaglin (1993),
 * "How to Detect and Handle Outliers", ASQC Basic References in Quality Control.
 *
 * @param {number[]} values - Array of numeric observations
 * @returns {{ median: number, mad: number, meanAD: number, count: number }}
 */
export const calculateMAD = (values = []) => {
  const valid = values
    .map(Number)
    .filter((v) => !isNaN(v) && isFinite(v));

  if (valid.length === 0) {
    return { median: 0, mad: 0, meanAD: 0, count: 0 };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const median = calculateQuantile(sorted, 0.5);

  const absDeviations = valid
    .map((v) => Math.abs(v - median))
    .sort((a, b) => a - b);

  const mad = calculateQuantile(absDeviations, 0.5);
  const meanAD =
    absDeviations.reduce((sum, d) => sum + d, 0) / valid.length;

  return {
    median: Number(median.toFixed(2)),
    mad: Number(mad.toFixed(2)),
    meanAD: Number(meanAD.toFixed(2)),
    count: valid.length,
  };
};

/**
 * Calculate Boris Iglewicz and David Hoaglin Modified Z-Scores.
 *
 * Formula:
 * M_i = 0.6745 * (x_i - median) / MAD
 *
 * When MAD = 0 and MeanAD > 0:
 * M_i = 0.7979 * (x_i - median) / MeanAD
 *
 * When both MAD = 0 and MeanAD = 0 (all values identical):
 * M_i = 0
 *
 * @param {number[]} values - Array of numeric observations
 * @returns {number[]} Array of Modified Z-scores
 */
export const calculateModifiedZScores = (values = []) => {
  const { median, mad, meanAD, count } = calculateMAD(values);
  if (count === 0) return [];

  const useMeanAD = mad === 0 && meanAD > 0;
  const denominator = useMeanAD ? meanAD : mad;
  const factor = useMeanAD ? 0.7979 : 0.6745;

  return values.map((val) => {
    const num = Number(val);
    if (isNaN(num) || !isFinite(num) || denominator === 0) {
      return 0;
    }
    const score = (factor * (num - median)) / denominator;
    return Number(score.toFixed(2));
  });
};

/**
 * Calculate Trailing Rolling Median Baseline for day t.
 * Strictly uses observations before day t (indices t - windowSize to t - 1).
 * Day t is strictly excluded from its own baseline to avoid self-contamination.
 *
 * @param {Array<{ date: string, value: number, isRecorded: boolean }>} series - Chronological daily series
 * @param {number} currentIndex - Index of day t
 * @param {number} windowSize - Trailing window size (default 7 days)
 * @param {number} minRequired - Minimum recorded days in window to compute baseline (default 3)
 * @returns {{ baseline: number|null, recordedCount: number, windowDates: string[] }}
 */
export const calculateTrailingBaseline = (
  series = [],
  currentIndex = 0,
  windowSize = 7,
  minRequired = 3
) => {
  if (!series || series.length === 0 || currentIndex <= 0) {
    return { baseline: null, recordedCount: 0, windowDates: [] };
  }

  const startIdx = Math.max(0, currentIndex - windowSize);
  const priorSlice = series.slice(startIdx, currentIndex);

  const priorRecorded = priorSlice.filter((item) => item.isRecorded);
  const recordedCount = priorRecorded.length;
  const windowDates = priorSlice.map((item) => item.date);

  if (recordedCount < minRequired) {
    return { baseline: null, recordedCount, windowDates };
  }

  const values = priorRecorded.map((item) => item.value).sort((a, b) => a - b);
  const median = calculateQuantile(values, 0.5);

  return {
    baseline: Number(median.toFixed(2)),
    recordedCount,
    windowDates,
  };
};

/**
 * Detect Daily Sales Revenue Anomalies
 *
 * Uses non-parametric IQR corridors combined with trailing rolling median baseline.
 *
 * Features:
 * - Sensitivity multipliers: standard (k=1.5), sensitive (k=1.2), conservative (k=2.0)
 * - Safe effective IQR floor when IQR = 0 (prevents division by zero or collapsed corridor)
 * - Zero baseline and missing date safeguards:
 *   Unrecorded calendar dates are never flagged as sudden drops
 *   Confirmed zero-revenue trading days are only flagged if trailing baseline >= max(20, Q1) and drop >= 50%
 * - Multi-level severity classification: Low, Medium, High
 * - Plain-English explanations without generative jargon
 *
 * @param {Array<{ date: string|Date, value?: number, amount?: number, isRecorded?: boolean }>} rawOrAligned
 * @param {Object} options
 * @param {'standard'|'sensitive'|'conservative'} [options.sensitivity='standard']
 * @param {number} [options.windowSize=7]
 * @param {number} [options.minRequiredDays=7]
 * @returns {Object} Comprehensive anomaly detection results
 */
export const detectDailyAnomalies = (rawOrAligned = [], options = {}) => {
  const sensitivity = options.sensitivity || 'standard';
  const kMap = { sensitive: 1.2, standard: 1.5, conservative: 2.0 };
  const k = kMap[sensitivity] !== undefined ? kMap[sensitivity] : 1.5;
  const windowSize = Number(options.windowSize) || 7;
  const minRequiredDays = Number(options.minRequiredDays) || 7;

  // Align time series if not already aligned
  let series = [];
  let distinctRecordedDays = 0;
  let totalCalendarDays = 0;

  if (
    rawOrAligned.length > 0 &&
    rawOrAligned[0].isRecorded !== undefined &&
    rawOrAligned[0].date !== undefined &&
    rawOrAligned[0].value !== undefined
  ) {
    // Already aligned series
    series = rawOrAligned;
    distinctRecordedDays = series.filter((d) => d.isRecorded).length;
    totalCalendarDays = series.length;
  } else {
    // Raw records with { date, amount/totalRevenue }
    const formattedRecords = rawOrAligned.map((r) => ({
      date: r.date,
      amount: Number(r.totalRevenue ?? r.amount ?? r.value ?? 0),
    }));
    const aligned = alignDailyTimeSeries(formattedRecords);
    series = aligned.series;
    distinctRecordedDays = aligned.distinctRecordedDays;
    totalCalendarDays = aligned.dateSpanDays;
  }

  // Sufficiency Gate: At least 7 distinct trading days with recorded sales
  if (distinctRecordedDays < minRequiredDays) {
    return {
      hasSufficientData: false,
      minRequiredDays,
      distinctRecordedDays,
      totalCalendarDays,
      message: `At least ${minRequiredDays} distinct trading days are required to establish a valid empirical baseline for anomaly detection. Current records have ${distinctRecordedDays} distinct day(s).`,
      anomalies: [],
      dailyPoints: [],
      summary: {
        totalAnomalies: 0,
        highSeverityCount: 0,
        mediumSeverityCount: 0,
        lowSeverityCount: 0,
        spikesCount: 0,
        dropsCount: 0,
      },
    };
  }

  // Calculate global quartiles using confirmed recorded sales days
  const recordedRevenues = series
    .filter((d) => d.isRecorded)
    .map((d) => Number(d.value) || 0);

  const { q1, median, q3, iqr } = calculateQuartiles(recordedRevenues);

  // Safe effective IQR: when variance is zero (e.g. flat sales), provide a 5% median or $1.00 floor
  const effectiveIQR = iqr > 0 ? iqr : Math.max(1.0, Number((median * 0.05).toFixed(2)));

  const upperThreshold = Number((q3 + k * effectiveIQR).toFixed(2));
  const extremeUpperThreshold = Number((q3 + 2 * k * effectiveIQR).toFixed(2));
  const lowerThreshold = Math.max(0, Number((q1 - k * effectiveIQR).toFixed(2)));
  const extremeLowerThreshold = Math.max(0, Number((q1 - 2 * k * effectiveIQR).toFixed(2)));

  const anomalies = [];
  const dailyPoints = [];

  for (let t = 0; t < series.length; t++) {
    const current = series[t];
    const rev = Number(current.value) || 0;
    const isRecorded = Boolean(current.isRecorded);

    // Trailing baseline strictly from prior days (indices max(0, t - windowSize) to t - 1)
    const { baseline: trailingMedian, recordedCount } = calculateTrailingBaseline(
      series,
      t,
      windowSize,
      3
    );

    let isAnomaly = false;
    let anomalyType = null;
    let severity = null;
    let anomalyScore = 0;
    let explanation = '';

    // 1. SPIKE DETECTION: Revenue exceeds upper threshold corridor
    if (rev > upperThreshold) {
      isAnomaly = true;
      anomalyType = 'revenue_spike';
      severity =
        rev >= extremeUpperThreshold
          ? 'High'
          : rev >= upperThreshold + k * 0.5 * effectiveIQR
          ? 'Medium'
          : 'Low';

      anomalyScore = Number(((rev - q3) / effectiveIQR).toFixed(2));
      const pctOver = Number(
        (((rev - upperThreshold) / Math.max(1, upperThreshold)) * 100).toFixed(1)
      );
      explanation = `Revenue of ₹${rev.toFixed(
        2
      )} exceeds normal upper limit (₹${upperThreshold.toFixed(2)}) by +${pctOver}%.`;
    }
    // 2. SUDDEN DROP DETECTION:
    // Only flag genuine drops relative to a verified prior trailing baseline.
    // Must be a recorded trading day OR have sales > 0 that dropped drastically.
    // If it's an unrecorded calendar date with zero sales, do NOT flag as an anomaly.
    else if (
      isRecorded &&
      trailingMedian !== null &&
      trailingMedian >= Math.max(20, q1)
    ) {
      const dropPct = Number(
        (((trailingMedian - rev) / trailingMedian) * 100).toFixed(1)
      );

      if (dropPct >= 50 && rev <= lowerThreshold) {
        isAnomaly = true;
        anomalyType = 'sales_drop';
        severity = dropPct >= 80 ? 'High' : dropPct >= 65 ? 'Medium' : 'Low';
        anomalyScore = Number((dropPct / 10).toFixed(2));
        explanation = `Revenue of ₹${rev.toFixed(
          2
        )} represents a severe -${dropPct}% drop below the trailing 7-day median baseline of ₹${trailingMedian.toFixed(
          2
        )}.`;
      }
    }

    const point = {
      date: current.date,
      revenue: rev,
      isRecorded,
      isAnomaly,
      anomalyType,
      severity,
      anomalyScore,
      explanation: isAnomaly
        ? explanation
        : !isRecorded && rev === 0
        ? 'No sales records for this calendar date'
        : 'Normal sales activity',
      upperThreshold,
      lowerThreshold,
      trailingMedian,
    };

    dailyPoints.push(point);
    if (isAnomaly) {
      anomalies.push(point);
    }
  }

  return {
    hasSufficientData: true,
    minRequiredDays,
    distinctRecordedDays,
    totalCalendarDays,
    sensitivity,
    kMultiplier: k,
    quartiles: { q1, median, q3, iqr: effectiveIQR, rawIQR: iqr },
    thresholds: {
      upperThreshold,
      lowerThreshold,
      extremeUpperThreshold,
      extremeLowerThreshold,
    },
    summary: {
      totalAnomalies: anomalies.length,
      highSeverityCount: anomalies.filter((a) => a.severity === 'High').length,
      mediumSeverityCount: anomalies.filter((a) => a.severity === 'Medium').length,
      lowSeverityCount: anomalies.filter((a) => a.severity === 'Low').length,
      spikesCount: anomalies.filter((a) => a.anomalyType === 'revenue_spike').length,
      dropsCount: anomalies.filter((a) => a.anomalyType === 'sales_drop').length,
    },
    anomalies,
    dailyPoints,
  };
};

/**
 * Detect Transaction-Level Outliers using Boris Iglewicz and David Hoaglin Modified Z-Scores.
 *
 * Outlier Rule:
 * - Flagged when |Modified Z-Score| >= outlierThreshold (standard guideline: 3.50)
 * - Severe outlier when |Modified Z-Score| >= extremeThreshold (5.00)
 *
 * @param {Array<Object>} transactions - Array of sale documents
 * @param {Object} options
 * @param {number} [options.minRequiredTransactions=10]
 * @param {number} [options.outlierThreshold=3.5]
 * @param {number} [options.extremeThreshold=5.0]
 * @param {number} [options.limit=50]
 * @returns {Object} Comprehensive transaction outlier results
 */
export const detectTransactionOutliers = (transactions = [], options = {}) => {
  const minRequiredTransactions = Number(options.minRequiredTransactions) || 10;
  const outlierThreshold = Number(options.outlierThreshold) || 3.5;
  const extremeThreshold = Number(options.extremeThreshold) || 5.0;
  const limit = Number(options.limit) || 50;

  if (!transactions || transactions.length < minRequiredTransactions) {
    return {
      hasSufficientData: false,
      minRequiredTransactions,
      totalTransactions: transactions ? transactions.length : 0,
      message: `At least ${minRequiredTransactions} transactions are required to perform robust transaction outlier detection. Current records have ${
        transactions ? transactions.length : 0
      } transaction(s).`,
      outliers: [],
      allEvaluatedCount: transactions ? transactions.length : 0,
      summary: {
        totalOutliers: 0,
        highSeverityCount: 0,
        mediumSeverityCount: 0,
        lowSeverityCount: 0,
      },
    };
  }

  // Extract revenue amounts
  const amounts = transactions.map((t) =>
    Number(t.totalRevenue ?? t.amount ?? 0)
  );

  const { median, mad, meanAD } = calculateMAD(amounts);
  const zScores = calculateModifiedZScores(amounts);

  const evaluated = [];
  const outliers = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const amount = amounts[i];
    const score = zScores[i];
    const absScore = Math.abs(score);

    const isOutlier = absScore >= outlierThreshold;
    let severity = null;
    let outlierType = null;
    let explanation = 'Transaction is within normal historical sales range.';

    if (isOutlier) {
      severity = absScore >= extremeThreshold ? 'High' : absScore >= 4.0 ? 'Medium' : 'Low';
      outlierType = score > 0 ? 'unusually_high_value' : 'unusually_low_value';

      if (score > 0) {
        const factorOver = median > 0 ? Number((amount / median).toFixed(1)) : 0;
        explanation = `Transaction of ₹${amount.toFixed(
          2
        )} is unusually high (${
          factorOver > 1 ? `${factorOver}x typical value, ` : ''
        }deviation score: ${score.toFixed(
          2
        )} vs. normal limit ${outlierThreshold.toFixed(
          2
        )}). Typical transaction value is ₹${median.toFixed(2)}.`;
      } else {
        explanation = `Transaction of ₹${amount.toFixed(
          2
        )} is unusually low (deviation score: ${score.toFixed(
          2
        )} vs. normal limit -${outlierThreshold.toFixed(
          2
        )}). Typical transaction value is ₹${median.toFixed(2)}.`;
      }
    }

    const record = {
      id: tx._id ? String(tx._id) : `tx-${i}`,
      date: tx.date ? formatDateKey(tx.date) : '',
      productName: tx.productName || 'Unknown Product',
      quantitySold: Number(tx.quantitySold) || 1,
      unitPrice: Number(tx.unitPrice) || 0,
      totalRevenue: amount,
      paymentMethod: tx.paymentMethod || 'cash',
      modifiedZScore: score,
      isOutlier,
      outlierType,
      severity,
      explanation,
    };

    evaluated.push(record);
    if (isOutlier) {
      outliers.push(record);
    }
  }

  // Sort outliers by descending absolute Modified Z-score (most abnormal first)
  outliers.sort((a, b) => Math.abs(b.modifiedZScore) - Math.abs(a.modifiedZScore));

  const cappedOutliers = limit > 0 ? outliers.slice(0, limit) : outliers;

  return {
    hasSufficientData: true,
    minRequiredTransactions,
    totalTransactions: transactions.length,
    statistics: {
      median,
      mad,
      meanAD,
      outlierThreshold,
      extremeThreshold,
    },
    summary: {
      totalOutliers: outliers.length,
      highSeverityCount: outliers.filter((o) => o.severity === 'High').length,
      mediumSeverityCount: outliers.filter((o) => o.severity === 'Medium').length,
      lowSeverityCount: outliers.filter((o) => o.severity === 'Low').length,
    },
    outliers: cappedOutliers,
    allEvaluatedCount: evaluated.length,
  };
};
