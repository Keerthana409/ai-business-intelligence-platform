/**
 * Mathematical & Statistical Utilities for ML and Decision Intelligence
 * Implemented natively with standard statistical formulas (No external LLM or AI API)
 */

/**
 * Calculates arithmetic mean of a numeric array
 * @param {number[]} values
 * @returns {number}
 */
export const calculateMean = (values) => {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
};

/**
 * Calculates sample standard deviation
 * @param {number[]} values
 * @returns {number}
 */
export const calculateStandardDeviation = (values) => {
  if (!values || values.length < 2) return 0;
  const mean = calculateMean(values);
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
};

/**
 * Approximation of Standard Normal Cumulative Distribution Function (CDF)
 * Converts Z-score into cumulative probability P(Z <= z)
 * @param {number} z
 * @returns {number} Probability between 0 and 1
 */
export const normalCDF = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
};

/**
 * Calculates Mean Absolute Percentage Error (MAPE)
 * @param {number[]} actuals
 * @param {number[]} predictions
 * @returns {number} Percentage error (e.g. 12.5 for 12.5%)
 */
export const calculateMAPE = (actuals, predictions) => {
  if (!actuals.length || actuals.length !== predictions.length) return 0;
  let totalError = 0;
  let count = 0;
  for (let i = 0; i < actuals.length; i++) {
    if (actuals[i] !== 0) {
      totalError += Math.abs((actuals[i] - predictions[i]) / actuals[i]);
      count++;
    }
  }
  return count > 0 ? (totalError / count) * 100 : 0;
};
