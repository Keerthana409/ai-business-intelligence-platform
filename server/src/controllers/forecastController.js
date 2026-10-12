import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import {
  DEFAULT_DAMPING_PHI,
  alignDailyTimeSeries,
  calculateHoltLinear,
  calculateUncertaintyBands,
  runChronologicalBacktest,
  evaluateProductDemandRisk,
  addDays,
} from '../utils/forecastingEngine.js';
import {
  MIN_DAYS_FOR_PRODUCT_RF,
  MIN_DAYS_FOR_RF_FORECAST,
  requestMLProductDemandForecast,
  requestMLSalesForecast,
} from '../services/mlServiceClient.js';

/**
 * @desc    Generate store-wide sales revenue forecast using Random Forest Regression (when >= 14 days
 *          and Python ML service is online) with automatic fallback to Damped Holt's Linear Exponential Smoothing
 * @route   GET /api/forecast/sales
 * @access  Private
 */
export const getSalesForecast = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const horizon = Math.min(30, Math.max(7, parseInt(req.query.horizon, 10) || 7));
    const parsedPhi = req.query.phi !== undefined ? parseFloat(req.query.phi) : DEFAULT_DAMPING_PHI;
    const phi =
      Number.isFinite(parsedPhi) && parsedPhi > 0 && parsedPhi <= 1
        ? parsedPhi
        : DEFAULT_DAMPING_PHI;

    // Retrieve all recorded sales sorted chronologically
    const sales = await Sale.find({ userId: userObjectId }).sort({ date: 1 });

    const records = sales.map((s) => ({
      date: s.date,
      amount: s.totalRevenue,
    }));

    const {
      series,
      distinctRecordedDays,
      dateSpanDays,
      startDate,
      endDate,
    } = alignDailyTimeSeries(records);

    const meetsMinDaysRequirement = distinctRecordedDays >= MIN_DAYS_FOR_RF_FORECAST;
    const additionalDaysNeededForML = Math.max(0, MIN_DAYS_FOR_RF_FORECAST - distinctRecordedDays);

    // Initial Data Sufficiency Gate: minimum 5 distinct calendar days
    if (distinctRecordedDays < 5) {
      return res.status(200).json({
        status: 'success',
        data: {
          hasSufficientData: false,
          minRequiredDays: 5,
          minRequiredDaysForML: MIN_DAYS_FOR_RF_FORECAST,
          distinctRecordedDays,
          dateSpanDays,
          message: 'Insufficient historical data to compute a statistical or machine-learning sales forecast.',
          explanation: 'At least 5 distinct calendar days with recorded sales transactions are required as a minimal computational threshold for Holt\'s trend recursion (and 14+ days for Random Forest Regression).',
          guidance: 'Record sales transactions over multiple days or upload a historical sales CSV batch to enable predictive forecasting.',
          mlMetadata: {
            mlActive: false,
            mlAttempted: false,
            mlSucceeded: false,
            mlServiceOnline: false,
            meetsMinDaysRequirement: false,
            algorithmUsed: 'None (Insufficient Data)',
            minRequiredDaysForML: MIN_DAYS_FOR_RF_FORECAST,
            distinctRecordedDays,
            additionalDaysNeededForML,
            statisticalBacktestStatus: 'Insufficient Data (< 5 Days)',
            mlValidationStatus: `Pending (${additionalDaysNeededForML} More Days Needed)`,
            fallbackReason: `Dataset has ${distinctRecordedDays} distinct recorded trading day(s). Minimum 5 days required for statistical forecasting and ${MIN_DAYS_FOR_RF_FORECAST} days (${additionalDaysNeededForML} more needed) for Random Forest Regression.`,
          },
        },
      });
    }

    const values = series.map((s) => s.value);
    const alpha = 0.3;
    const beta = 0.1;

    // 1. Always compute Damped Holt's Linear statistical baseline and backtest
    const { forecast, finalLevel, finalTrend, dampingPhi } = calculateHoltLinear(
      values,
      horizon,
      alpha,
      beta,
      phi
    );
    const backtest = runChronologicalBacktest(values, 3, alpha, beta, phi);
    const rmse = backtest.hasSufficientDataForBacktest ? backtest.metrics.rmse : 5.0;
    const uncertaintyBands = calculateUncertaintyBands(forecast, rmse);

    const holtPredictions = forecast.map((val, idx) => ({
      date: addDays(endDate, idx + 1),
      forecastRevenue: val,
      lowerBound: uncertaintyBands[idx].lowerBound,
      upperBound: uncertaintyBands[idx].upperBound,
      uncertaintyMargin: uncertaintyBands[idx].uncertaintyMargin,
    }));

    const holtTotalProjectedRevenue = Number(
      holtPredictions.reduce((sum, p) => sum + p.forecastRevenue, 0).toFixed(2)
    );

    const statisticalBacktestStatus = backtest.hasSufficientDataForBacktest
      ? (meetsMinDaysRequirement ? 'Verified (Statistical Holdout)' : 'Provisional (Statistical Holdout)')
      : 'Insufficient Data';

    // 2. Evaluate eligibility and query Python ML service
    const mlAttempted = meetsMinDaysRequirement;
    const mlRes = await requestMLSalesForecast({
      records,
      horizon,
      scopeId: String(req.user.id),
      minRequiredDays: MIN_DAYS_FOR_RF_FORECAST,
    });

    const mlServiceOnline = Boolean(mlRes.serviceOnline);
    const mlSucceeded = Boolean(
      mlAttempted && mlServiceOnline && !mlRes.error && mlRes.data && mlRes.data.mlTrained === true
    );

    if (mlSucceeded) {
      const rfData = mlRes.data;
      const rfEval = rfData.modelEvaluation
        ? {
            ...rfData.modelEvaluation,
            validationMethod: 'Random Forest Chronological Holdout',
            isMLValidated: true,
            isProvisional: false,
            accuracyStatus: 'Verified (Random Forest Holdout)',
            statisticalBacktestStatus,
            mlValidationStatus: 'Verified (Random Forest Holdout)',
            requiredDaysForValidation: MIN_DAYS_FOR_RF_FORECAST,
            additionalDaysNeeded: 0,
          }
        : null;

      return res.status(200).json({
        status: 'success',
        data: {
          ...rfData,
          modelEvaluation: rfEval,
          mlMetadata: {
            mlActive: true,
            mlAttempted: true,
            mlSucceeded: true,
            mlServiceOnline: true,
            meetsMinDaysRequirement: true,
            algorithmUsed: 'Random Forest Regression (scikit-learn)',
            minRequiredDaysForML: MIN_DAYS_FOR_RF_FORECAST,
            distinctRecordedDays,
            additionalDaysNeededForML: 0,
            statisticalBacktestStatus,
            mlValidationStatus: rfEval ? 'Verified (Random Forest Holdout)' : 'Unavailable',
            supervisedTrainingSamples: rfData.historicalCoverage?.supervisedTrainingSamples || 0,
            featureImportances: rfData.parameters?.featureImportances || {},
            artifactPath: rfData.parameters?.artifactPath || null,
            fallbackReason: null,
            requestError: null,
          },
          statisticalBaselineComparison: {
            algorithm: 'Holt\'s Linear Exponential Smoothing',
            totalProjectedRevenue: holtTotalProjectedRevenue,
            metrics: backtest.hasSufficientDataForBacktest ? backtest.metrics : null,
          },
        },
      });
    }

    if (mlAttempted) {
      console.warn(
        `[Sales Forecast Fallback] Random Forest did not activate for store (${distinctRecordedDays} trading days, horizon=${horizon}d):`,
        {
          mlServiceOnline,
          httpStatus: mlRes.httpStatus,
          error: mlRes.error || null,
          reason: mlRes.data?.reason || null,
        }
      );
    }

    // Build accurate, non-contradictory fallback reason
    let fallbackReason = '';
    if (!meetsMinDaysRequirement) {
      fallbackReason = `Store has ${distinctRecordedDays} distinct recorded trading days; at least ${MIN_DAYS_FOR_RF_FORECAST} distinct days (${additionalDaysNeededForML} more day${additionalDaysNeededForML === 1 ? '' : 's'} needed) are required before Random Forest training is attempted. Using Holt's Linear Exponential Smoothing statistical projection.`;
      if (!mlServiceOnline) {
        fallbackReason += ` (Note: Python ML service is currently offline: ${mlRes.error || 'unreachable'}.)`;
      }
    } else if (!mlServiceOnline) {
      fallbackReason = `Store meets the ${MIN_DAYS_FOR_RF_FORECAST}-day minimum (${distinctRecordedDays} distinct trading days recorded) and Random Forest training was attempted, but the Python ML service is currently offline or unreachable (${mlRes.error || 'connection refused'}). Using Holt's Linear Exponential Smoothing statistical fallback.`;
    } else if (mlRes.error) {
      fallbackReason = `Store meets the ${MIN_DAYS_FOR_RF_FORECAST}-day minimum (${distinctRecordedDays} distinct trading days recorded) and Random Forest training was attempted, but the Python ML forecast request failed (${mlRes.error}). Using Holt's Linear Exponential Smoothing statistical fallback.`;
    } else if (mlRes.data?.reason) {
      fallbackReason = `Random Forest training was attempted with ${distinctRecordedDays} distinct trading days (minimum ${MIN_DAYS_FOR_RF_FORECAST} required), but fell back to Holt's Linear Exponential Smoothing: ${mlRes.data.reason}`;
    } else {
      fallbackReason = `Store meets the ${MIN_DAYS_FOR_RF_FORECAST}-day minimum (${distinctRecordedDays} distinct trading days recorded) and Random Forest training was attempted, but the ML service did not return a trained model. Using Holt's Linear Exponential Smoothing statistical fallback.`;
    }

    const mlValidationStatus = meetsMinDaysRequirement
      ? 'Unavailable (Random Forest Fallback)'
      : `Pending (${additionalDaysNeededForML} More Day${additionalDaysNeededForML === 1 ? '' : 's'} Needed)`;

    return res.status(200).json({
      status: 'success',
      data: {
        hasSufficientData: true,
        horizon,
        algorithm: 'Holt\'s Linear Exponential Smoothing',
        parameters: { alpha, beta, phi: dampingPhi, finalLevel, finalTrend },
        historicalCoverage: {
          startDate,
          endDate,
          distinctRecordedDays,
          totalCalendarDays: dateSpanDays,
        },
        historicalActuals: series.slice(-30), // Recent actuals for visualization
        predictions: holtPredictions,
        totalProjectedRevenue: holtTotalProjectedRevenue,
        modelEvaluation: backtest.hasSufficientDataForBacktest
          ? {
              mae: backtest.metrics.mae,
              rmse: backtest.metrics.rmse,
              wape: backtest.metrics.wape,
              mape: backtest.metrics.mape,
              mapeExplanation: backtest.metrics.mapeExplanation,
              normalizedAccuracy: backtest.metrics.normalizedAccuracy,
              validationMethod: 'Statistical Holt Holdout',
              isMLValidated: false,
              statisticalBacktestStatus,
              mlValidationStatus,
              accuracyStatus: meetsMinDaysRequirement
                ? 'Statistical Holdout Only (ML Inactive)'
                : 'Pending (Needs 14+ Days)',
              isProvisional: true,
              requiredDaysForValidation: MIN_DAYS_FOR_RF_FORECAST,
              additionalDaysNeeded: additionalDaysNeededForML,
              dampingPhi: backtest.dampingPhi,
              accuracyDefinition: 'Normalized Backtest Accuracy = max(0, 100 - WAPE)%, where WAPE = sum(|actual - predicted|) / sum(actual) * 100 on the holdout test period.',
              backtestTrainDays: backtest.trainSize,
              backtestTestDays: backtest.testSize,
              backtestActuals: backtest.testActuals,
              backtestPredictions: backtest.testPredictions,
              formulationComparison: backtest.formulationComparison,
            }
          : null,
        transparency: {
          algorithmName: 'Holt\'s Linear (Double) Exponential Smoothing with Damped Trend (Statistical Fallback)',
          formula: 'L_t = max(0, alpha*y_t + (1-alpha)*max(0, L_{t-1} + T_{t-1})) | T_t = beta*(L_t - L_{t-1}) + (1-beta)*T_{t-1} | y_hat_{t+h} = max(0, L_t + sum_{i=1..h}(phi^i)*T_t)',
          uncertaintyMethod: 'Approximate Uncertainty Range (±1.96 × Residual Standard Error under empirical normality assumption).',
          limitations: 'Statistical trend smoothing baseline. Does not capture multi-lag calendar or day-of-week non-linearities modeled by Random Forest.',
          minimumComputationalRequirementNote: meetsMinDaysRequirement
            ? `Current dataset has ${distinctRecordedDays} distinct trading days (meets the ${MIN_DAYS_FOR_RF_FORECAST}-day minimum requirement). ${fallbackReason}`
            : `Current dataset has ${distinctRecordedDays} distinct trading days. Minimum ${MIN_DAYS_FOR_RF_FORECAST} days required for AI Random Forest modeling (${additionalDaysNeededForML} more day${additionalDaysNeededForML === 1 ? '' : 's'} needed).`,
        },
        mlMetadata: {
          mlActive: false,
          mlAttempted,
          mlSucceeded: false,
          mlServiceOnline,
          meetsMinDaysRequirement,
          algorithmUsed: 'Holt\'s Linear Exponential Smoothing (Statistical Fallback)',
          minRequiredDaysForML: MIN_DAYS_FOR_RF_FORECAST,
          distinctRecordedDays,
          additionalDaysNeededForML,
          statisticalBacktestStatus,
          mlValidationStatus,
          fallbackReason,
          requestError: mlRes.error || null,
        },
      },
    });
  } catch (error) {
    console.error('[Sales Forecast Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to generate sales forecast',
    });
  }
};

/**
 * Escape regular expression special characters in user input strings
 */
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Internal helper to evaluate products with statistical baseline + optional Random Forest upgrade
 * when SKU sales history has >= MIN_DAYS_FOR_PRODUCT_RF (10) distinct recorded days.
 */
async function evaluateCatalogDemandWithML(products, userId, horizon) {
  const results = [];
  const mlBatch = [];

  for (const prod of products) {
    const cleanName = (prod.name || '').trim();
    const escapedName = escapeRegex(cleanName);

    const sales = await Sale.find({
      userId,
      $or: [
        { productId: prod._id },
        { productName: { $regex: `^\\s*${escapedName}\\s*$`, $options: 'i' } },
      ],
    }).sort({ date: 1 });

    const salesRecords = sales.map((s) => ({ date: s.date, quantity: s.quantitySold }));

    const evaluation = evaluateProductDemandRisk({
      salesRecords,
      stockQuantity: prod.stockQuantity,
      reorderThreshold: prod.reorderThreshold,
      leadTimeDays: prod.leadTimeDays || 7,
      horizon,
    });

    if (evaluation.distinctRecordedDays >= MIN_DAYS_FOR_PRODUCT_RF) {
      mlBatch.push({
        productId: String(prod._id),
        salesRecords,
        stockQuantity: prod.stockQuantity,
        reorderThreshold: prod.reorderThreshold,
        leadTimeDays: prod.leadTimeDays || 7,
      });
    }

    results.push({
      productId: prod._id,
      name: prod.name,
      sku: prod.sku,
      category: prod.category,
      unit: prod.unit || 'pcs',
      currentStock: prod.stockQuantity,
      reorderThreshold: prod.reorderThreshold,
      leadTimeDays: prod.leadTimeDays || 7,
      algorithm: evaluation.hasSufficientData
        ? 'Holt\'s Linear Exponential Smoothing'
        : 'Insufficient Data',
      mlActive: false,
      mlReason:
        evaluation.distinctRecordedDays < MIN_DAYS_FOR_PRODUCT_RF
          ? `Product has ${evaluation.distinctRecordedDays} distinct sales day(s); ${MIN_DAYS_FOR_PRODUCT_RF} required for SKU-level Random Forest training.`
          : null,
      minRequiredDaysForBaseline: 3,
      minRequiredDaysForML: MIN_DAYS_FOR_PRODUCT_RF,
      additionalDaysNeededForBaseline: Math.max(0, 3 - evaluation.distinctRecordedDays),
      additionalDaysNeededForML: Math.max(0, MIN_DAYS_FOR_PRODUCT_RF - evaluation.distinctRecordedDays),
      ...evaluation,
    });
  }

  // Query Python ML service only for products that meet the minimum SKU Random Forest threshold
  if (mlBatch.length > 0) {
    const mlBatchRes = await requestMLProductDemandForecast({
      products: mlBatch,
      horizon,
    });

    if (mlBatchRes.serviceOnline && mlBatchRes.data) {
      for (let i = 0; i < results.length; i++) {
        const pid = String(results[i].productId);
        const mlProd = mlBatchRes.data[pid];
        if (mlProd) {
          results[i].mlServiceOnline = true;
          results[i].mlReason = mlProd.reason || null;
          if (mlProd.mlUsed) {
            results[i] = {
              ...results[i],
              ...mlProd,
              currentStock: results[i].currentStock,
              mlActive: true,
              algorithm: 'Random Forest Regression (scikit-learn)',
            };
          }
        }
      }
    }
  }

  return results;
}

/**
 * @desc    Generate product-level unit demand forecasts
 * @route   GET /api/forecast/demand
 * @access  Private
 */
export const getProductDemandForecast = async (req, res) => {
  try {
    const { productId } = req.query;
    const horizon = Math.min(30, Math.max(7, parseInt(req.query.horizon, 10) || 7));

    let productsQuery = { userId: req.user.id };
    if (productId) {
      productsQuery._id = productId;
    }

    const products = await Product.find(productsQuery);
    if (!products || products.length === 0) {
      return res.status(200).json({
        status: 'success',
        count: 0,
        data: [],
      });
    }

    const results = await evaluateCatalogDemandWithML(products, req.user.id, horizon);

    return res.status(200).json({
      status: 'success',
      count: results.length,
      horizon,
      data: results,
    });
  } catch (error) {
    console.error('[Product Demand Forecast Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to calculate product demand forecasts',
    });
  }
};

/**
 * @desc    Evaluate inventory stockout risks by comparing projected demand against stock and thresholds
 * @route   GET /api/forecast/inventory-risk
 * @access  Private
 */
export const getInventoryRiskAnalysis = async (req, res) => {
  try {
    const horizon = Math.min(30, Math.max(7, parseInt(req.query.horizon, 10) || 14));
    const products = await Product.find({ userId: req.user.id });

    if (!products || products.length === 0) {
      return res.status(200).json({
        status: 'success',
        count: 0,
        data: [],
      });
    }

    const analysisResults = await evaluateCatalogDemandWithML(products, req.user.id, horizon);

    // Sort by risk priority
    const priorityOrder = {
      'Out of Stock': 1,
      'Critical Risk': 2,
      'High Risk': 3,
      'Low Stock (Buffer Alert)': 4,
      'Moderate Risk': 5,
      'Low / Safe': 6,
      'Pending History': 7,
      'Zero Projected Demand': 8,
      'Insufficient Data': 9,
    };

    analysisResults.sort((a, b) => {
      const pA = priorityOrder[a.status] || 99;
      const pB = priorityOrder[b.status] || 99;
      if (pA !== pB) return pA - pB;
      // Secondary sort: lower runout days first
      if (a.runoutDays !== null && b.runoutDays !== null) {
        return a.runoutDays - b.runoutDays;
      }
      return 0;
    });

    return res.status(200).json({
      status: 'success',
      count: analysisResults.length,
      horizon,
      data: analysisResults,
    });
  } catch (error) {
    console.error('[Inventory Risk Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to perform inventory risk analysis',
    });
  }
};

/**
 * @desc    Compare historical predictions against actual recorded sales using chronological backtesting
 * @route   GET /api/forecast/evaluation
 * @access  Private
 */
export const getForecastEvaluation = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const sales = await Sale.find({ userId: userObjectId }).sort({ date: 1 });

    const records = sales.map((s) => ({
      date: s.date,
      amount: s.totalRevenue,
    }));

    const { series, distinctRecordedDays } = alignDailyTimeSeries(records);

    if (distinctRecordedDays < 5) {
      return res.status(200).json({
        status: 'success',
        data: {
          hasSufficientData: false,
          minRequiredDays: 5,
          minRequiredDaysForML: MIN_DAYS_FOR_RF_FORECAST,
          distinctRecordedDays,
          message: 'At least 5 distinct calendar days with sales records are required for retrospective backtesting.',
        },
      });
    }

    const values = series.map((s) => s.value);
    const backtest = runChronologicalBacktest(values, 3);
    const meetsMinDaysRequirement = distinctRecordedDays >= MIN_DAYS_FOR_RF_FORECAST;
    const additionalDaysNeededForML = Math.max(0, MIN_DAYS_FOR_RF_FORECAST - distinctRecordedDays);

    let mlEvaluation = null;
    let mlServiceOnline = false;
    let mlSucceeded = false;

    if (meetsMinDaysRequirement) {
      const mlRes = await requestMLSalesForecast({
        records,
        horizon: 7,
        scopeId: String(req.user.id),
        minRequiredDays: MIN_DAYS_FOR_RF_FORECAST,
      });
      mlServiceOnline = Boolean(mlRes.serviceOnline);
      if (mlRes.serviceOnline && !mlRes.error && mlRes.data && mlRes.data.mlTrained) {
        mlSucceeded = true;
        mlEvaluation = mlRes.data.modelEvaluation;
      }
    }

    return res.status(200).json({
      status: 'success',
      data: {
        hasSufficientData: true,
        distinctRecordedDays,
        minRequiredDaysForML: MIN_DAYS_FOR_RF_FORECAST,
        meetsMinDaysRequirement,
        additionalDaysNeededForML,
        mlAttempted: meetsMinDaysRequirement,
        mlSucceeded,
        mlServiceOnline,
        ...backtest,
        mlValidationStatus: mlSucceeded
          ? 'Verified (Random Forest Holdout)'
          : meetsMinDaysRequirement
            ? 'Unavailable (Random Forest Fallback)'
            : `Pending (${additionalDaysNeededForML} More Day${additionalDaysNeededForML === 1 ? '' : 's'} Needed)`,
        mlEvaluation,
      },
    });
  } catch (error) {
    console.error('[Forecast Evaluation Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to run forecast evaluation',
    });
  }
};
