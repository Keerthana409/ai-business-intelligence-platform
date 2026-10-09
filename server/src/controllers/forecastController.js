import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import {
  alignDailyTimeSeries,
  calculateHoltLinear,
  calculateUncertaintyBands,
  runChronologicalBacktest,
  evaluateProductDemandRisk,
  addDays,
} from '../utils/forecastingEngine.js';

/**
 * @desc    Generate store-wide sales revenue forecast using Holt's Linear Exponential Smoothing
 * @route   GET /api/forecast/sales
 * @access  Private
 */
export const getSalesForecast = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const horizon = Math.min(30, Math.max(7, parseInt(req.query.horizon, 10) || 7));

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

    // Initial Data Sufficiency Gate: minimum 5 distinct calendar days
    if (distinctRecordedDays < 5) {
      return res.status(200).json({
        status: 'success',
        data: {
          hasSufficientData: false,
          minRequiredDays: 5,
          distinctRecordedDays,
          dateSpanDays,
          message: 'Insufficient historical data to compute a statistical sales forecast.',
          explanation: 'At least 5 distinct calendar days with recorded sales transactions are required as a minimal computational threshold for Holt\'s trend recursion.',
          guidance: 'Record sales transactions over multiple days or upload a historical sales CSV batch to enable predictive forecasting.',
        },
      });
    }

    const values = series.map((s) => s.value);
    const alpha = 0.3;
    const beta = 0.1;

    // 1. Fit Holt's Linear Model on full historical observations
    const { forecast, finalLevel, finalTrend } = calculateHoltLinear(
      values,
      horizon,
      alpha,
      beta
    );

    // 2. Chronological Backtesting on holdout test set (no future data leakage)
    const backtest = runChronologicalBacktest(values, 3);

    // 3. Approximate uncertainty bands based on backtest residual standard error (RMSE)
    const rmse = backtest.hasSufficientDataForBacktest ? backtest.metrics.rmse : 5.0;
    const uncertaintyBands = calculateUncertaintyBands(forecast, rmse);

    // 4. Construct future chronological predictions
    const predictions = forecast.map((val, idx) => ({
      date: addDays(endDate, idx + 1),
      forecastRevenue: val,
      lowerBound: uncertaintyBands[idx].lowerBound,
      upperBound: uncertaintyBands[idx].upperBound,
      uncertaintyMargin: uncertaintyBands[idx].uncertaintyMargin,
    }));

    const totalProjectedRevenue = Number(
      predictions.reduce((sum, p) => sum + p.forecastRevenue, 0).toFixed(2)
    );

    return res.status(200).json({
      status: 'success',
      data: {
        hasSufficientData: true,
        horizon,
        algorithm: 'Holt\'s Linear Exponential Smoothing',
        parameters: { alpha, beta, finalLevel, finalTrend },
        historicalCoverage: {
          startDate,
          endDate,
          distinctRecordedDays,
          totalCalendarDays: dateSpanDays,
        },
        historicalActuals: series.slice(-30), // Recent actuals for visualization
        predictions,
        totalProjectedRevenue,
        modelEvaluation: backtest.hasSufficientDataForBacktest
          ? {
              mae: backtest.metrics.mae,
              rmse: backtest.metrics.rmse,
              wape: backtest.metrics.wape,
              mape: backtest.metrics.mape,
              mapeExplanation: backtest.metrics.mapeExplanation,
              normalizedAccuracy: backtest.metrics.normalizedAccuracy,
              accuracyDefinition: 'Normalized Backtest Accuracy = max(0, 100 - WAPE)%, where WAPE = sum(|actual - predicted|) / sum(actual) * 100 on the holdout test period.',
              backtestTrainDays: backtest.trainSize,
              backtestTestDays: backtest.testSize,
              backtestActuals: backtest.testActuals,
              backtestPredictions: backtest.testPredictions,
            }
          : null,
        transparency: {
          algorithmName: 'Holt\'s Linear (Double) Exponential Smoothing',
          formula: 'L_t = max(0, alpha*y_t + (1-alpha)*max(0, L_{t-1} + T_{t-1})) | T_t = beta*(L_t - L_{t-1}) + (1-beta)*T_{t-1} (with OLS regression initialization)',
          uncertaintyMethod: 'Approximate Uncertainty Range (±1.96 × Residual Standard Error under empirical normality assumption; not a guaranteed confidence interval).',
          limitations: 'Assumes recent trend trajectory continues without external macro disruptions, supplier stockouts, or unexpected emergency promotions. Reliability increases with larger sample sizes (30+ days).',
          minimumComputationalRequirementNote: '5 distinct calendar days represents a computational minimum to seed Level and Trend recursion, not a guarantee of long-term forecast reliability.',
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

    const results = [];

    for (const prod of products) {
      const cleanName = (prod.name || '').trim();
      const escapedName = escapeRegex(cleanName);

      // Find sales linked by productId OR case-insensitive trimmed productName fallback
      const sales = await Sale.find({
        userId: req.user.id,
        $or: [
          { productId: prod._id },
          { productName: { $regex: `^\\s*${escapedName}\\s*$`, $options: 'i' } },
        ],
      }).sort({ date: 1 });

      const evaluation = evaluateProductDemandRisk({
        salesRecords: sales.map((s) => ({ date: s.date, quantity: s.quantitySold })),
        stockQuantity: prod.stockQuantity,
        reorderThreshold: prod.reorderThreshold,
        leadTimeDays: prod.leadTimeDays || 7,
        horizon,
      });

      results.push({
        productId: prod._id,
        name: prod.name,
        sku: prod.sku,
        category: prod.category,
        unit: prod.unit || 'pcs',
        currentStock: prod.stockQuantity,
        reorderThreshold: prod.reorderThreshold,
        leadTimeDays: prod.leadTimeDays || 7,
        ...evaluation,
      });
    }

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

    const analysisResults = [];

    for (const prod of products) {
      const cleanName = (prod.name || '').trim();
      const escapedName = escapeRegex(cleanName);

      // Find sales linked by productId OR case-insensitive trimmed productName fallback
      const sales = await Sale.find({
        userId: req.user.id,
        $or: [
          { productId: prod._id },
          { productName: { $regex: `^\\s*${escapedName}\\s*$`, $options: 'i' } },
        ],
      }).sort({ date: 1 });

      const evalResult = evaluateProductDemandRisk({
        salesRecords: sales.map((s) => ({ date: s.date, quantity: s.quantitySold })),
        stockQuantity: prod.stockQuantity,
        reorderThreshold: prod.reorderThreshold,
        leadTimeDays: prod.leadTimeDays || 7,
        horizon,
      });

      analysisResults.push({
        productId: prod._id,
        name: prod.name,
        sku: prod.sku,
        category: prod.category,
        unit: prod.unit || 'pcs',
        currentStock: prod.stockQuantity,
        reorderThreshold: prod.reorderThreshold,
        leadTimeDays: prod.leadTimeDays || 7,
        ...evalResult,
      });
    }

    // Sort by risk priority
    const priorityOrder = {
      'Out of Stock': 1,
      'Critical Risk': 2,
      'High Risk': 3,
      'Moderate Risk': 4,
      'Low / Safe': 5,
      'Zero Projected Demand': 6,
      'Insufficient Data': 7,
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
          distinctRecordedDays,
          message: 'At least 5 distinct calendar days with sales records are required for retrospective backtesting.',
        },
      });
    }

    const values = series.map((s) => s.value);
    const backtest = runChronologicalBacktest(values, 3);

    return res.status(200).json({
      status: 'success',
      data: {
        hasSufficientData: true,
        ...backtest,
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
