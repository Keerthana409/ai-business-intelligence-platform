import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import {
  alignDailyTimeSeries,
  formatDateKey,
} from '../utils/forecastingEngine.js';
import {
  detectDailyAnomalies,
  detectTransactionOutliers,
} from '../utils/anomalyEngine.js';

/**
 * @desc    Get daily sales revenue anomalies and corridor bounds
 * @route   GET /api/anomalies/daily
 * @access  Private (JWT protected)
 */
export const getDailyAnomalies = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const sensitivity = req.query.sensitivity || 'standard';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Retrieve all recorded sales for authenticated user, sorted chronologically
    const sales = await Sale.find({ userId: userObjectId }).sort({ date: 1 });

    const records = sales.map((s) => ({
      date: s.date,
      amount: s.totalRevenue,
    }));

    const {
      series,
      distinctRecordedDays,
      dateSpanDays,
    } = alignDailyTimeSeries(records);

    // Initial Data Sufficiency Gate: At least 7 distinct trading days
    if (distinctRecordedDays < 7) {
      return res.status(200).json({
        status: 'success',
        data: {
          hasSufficientData: false,
          minRequiredDays: 7,
          distinctRecordedDays,
          dateSpanDays,
          message: 'Insufficient historical data to establish an empirical baseline for anomaly detection.',
          explanation: 'At least 7 distinct trading days with recorded sales transactions are required to calculate valid non-parametric IQR corridors.',
          guidance: 'Record sales transactions over multiple days or upload a historical sales CSV batch to enable anomaly detection.',
          dailyPoints: [],
          anomalies: [],
          summary: {
            totalAnomalies: 0,
            highSeverityCount: 0,
            mediumSeverityCount: 0,
            lowSeverityCount: 0,
            spikesCount: 0,
            dropsCount: 0,
          },
        },
      });
    }

    // Filter series if date bounds are specified
    let filteredSeries = series;
    if (startDate) {
      filteredSeries = filteredSeries.filter((d) => d.date >= startDate);
    }
    if (endDate) {
      filteredSeries = filteredSeries.filter((d) => d.date <= endDate);
    }

    const result = detectDailyAnomalies(filteredSeries, { sensitivity });

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    console.error('Error detecting daily anomalies:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error detecting daily anomalies',
    });
  }
};

/**
 * @desc    Get transaction-level outliers using Boris Iglewicz and David Hoaglin Modified Z-Scores
 * @route   GET /api/anomalies/transactions
 * @access  Private (JWT protected)
 */
export const getTransactionOutliers = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const limit = parseInt(req.query.limit, 10) || 50;
    const minScore = parseFloat(req.query.minScore) || 3.5;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const query = { userId: userObjectId };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Retrieve sales for user
    const sales = await Sale.find(query).sort({ date: -1 });

    const result = detectTransactionOutliers(sales, {
      outlierThreshold: minScore,
      limit,
    });

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    console.error('Error detecting transaction outliers:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error detecting transaction outliers',
    });
  }
};

/**
 * @desc    Get consolidated summary of anomaly intelligence for dashboard cards
 * @route   GET /api/anomalies/summary
 * @access  Private (JWT protected)
 */
export const getAnomalySummary = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    // Retrieve sales sorted chronologically
    const sales = await Sale.find({ userId: userObjectId }).sort({ date: 1 });

    const records = sales.map((s) => ({
      date: s.date,
      amount: s.totalRevenue,
    }));

    const {
      series,
      distinctRecordedDays,
      dateSpanDays,
    } = alignDailyTimeSeries(records);

    const dailyResult = detectDailyAnomalies(series, { sensitivity: 'standard' });
    const txResult = detectTransactionOutliers(sales, { outlierThreshold: 3.5, limit: 10 });

    const totalAnomalies =
      (dailyResult.summary ? dailyResult.summary.totalAnomalies : 0) +
      (txResult.summary ? txResult.summary.totalOutliers : 0);

    const highSeverityTotal =
      (dailyResult.summary ? dailyResult.summary.highSeverityCount : 0) +
      (txResult.summary ? txResult.summary.highSeverityCount : 0);

    // Latest anomaly if any exists
    let latestAnomaly = null;
    if (dailyResult.anomalies && dailyResult.anomalies.length > 0) {
      const lastDaily = dailyResult.anomalies[dailyResult.anomalies.length - 1];
      latestAnomaly = {
        type: 'daily',
        date: lastDaily.date,
        anomalyType: lastDaily.anomalyType,
        severity: lastDaily.severity,
        explanation: lastDaily.explanation,
        amount: lastDaily.revenue,
      };
    } else if (txResult.outliers && txResult.outliers.length > 0) {
      const topTx = txResult.outliers[0];
      latestAnomaly = {
        type: 'transaction',
        date: topTx.date,
        anomalyType: topTx.outlierType,
        severity: topTx.severity,
        explanation: topTx.explanation,
        amount: topTx.totalRevenue,
      };
    }

    res.status(200).json({
      status: 'success',
      data: {
        hasSufficientDailyData: dailyResult.hasSufficientData,
        hasSufficientTxData: txResult.hasSufficientData,
        distinctRecordedDays,
        dateSpanDays,
        totalTransactions: sales.length,
        totalAnomalies,
        highSeverityTotal,
        daily: dailyResult.summary || {
          totalAnomalies: 0,
          spikesCount: 0,
          dropsCount: 0,
          highSeverityCount: 0,
          mediumSeverityCount: 0,
          lowSeverityCount: 0,
        },
        transactions: txResult.summary || {
          totalOutliers: 0,
          highSeverityCount: 0,
          mediumSeverityCount: 0,
          lowSeverityCount: 0,
        },
        latestAnomaly,
      },
    });
  } catch (error) {
    console.error('Error fetching anomaly summary:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error fetching anomaly summary',
    });
  }
};
