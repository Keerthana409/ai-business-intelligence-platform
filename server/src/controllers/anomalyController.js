import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import {
  alignDailyTimeSeries,
} from '../utils/forecastingEngine.js';
import {
  detectDailyAnomalies,
  detectTransactionOutliers,
} from '../utils/anomalyEngine.js';
import {
  MIN_DAYS_FOR_DAILY_IFOREST,
  MIN_TRANSACTIONS_FOR_IFOREST,
  requestMLDailyAnomalyScores,
  requestMLTransactionOutliers,
} from '../services/mlServiceClient.js';

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
          minRequiredDaysForML: MIN_DAYS_FOR_DAILY_IFOREST,
          distinctRecordedDays,
          dateSpanDays,
          message: 'Insufficient historical data to establish an empirical baseline for anomaly detection.',
          explanation: 'At least 7 distinct trading days with recorded sales transactions are required to calculate valid non-parametric IQR corridors (and 14+ days for Isolation Forest daily scoring).',
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
          mlMetadata: {
            mlActive: false,
            mlServiceOnline: false,
            algorithmUsed: 'None (Insufficient Data)',
            minRequiredDaysForML: MIN_DAYS_FOR_DAILY_IFOREST,
            distinctRecordedDays,
            fallbackReason: `Dataset has ${distinctRecordedDays} distinct recorded day(s). Minimum 7 days required for statistical IQR corridors and ${MIN_DAYS_FOR_DAILY_IFOREST} days for Isolation Forest.`,
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

    let mlActive = false;
    let mlServiceOnline = false;
    let fallbackReason = null;
    let artifactPath = null;

    if (result.distinctRecordedDays >= MIN_DAYS_FOR_DAILY_IFOREST) {
      const mlDailyRes = await requestMLDailyAnomalyScores({
        dailyPoints: result.dailyPoints,
        scopeId: String(req.user.id),
      });
      mlServiceOnline = mlDailyRes.serviceOnline;

      if (mlDailyRes.serviceOnline && mlDailyRes.data && mlDailyRes.data.mlTrained) {
        mlActive = true;
        artifactPath = mlDailyRes.data.artifactPath || null;
        const scoresMap = mlDailyRes.data.scoresByDate || {};

        result.dailyPoints = result.dailyPoints.map((pt) => ({
          ...pt,
          isolationForestScore: scoresMap[pt.date] !== undefined ? scoresMap[pt.date] : null,
        }));
        result.anomalies = result.anomalies.map((anom) => ({
          ...anom,
          isolationForestScore: scoresMap[anom.date] !== undefined ? scoresMap[anom.date] : null,
        }));
      } else {
        fallbackReason = !mlDailyRes.serviceOnline
          ? 'Python ML service is currently offline; using non-parametric IQR Corridor + Trailing Median statistical fallback.'
          : 'Daily series has zero variance; using statistical IQR Corridor.';
      }
    } else {
      fallbackReason = `Dataset has ${result.distinctRecordedDays} distinct recorded trading days; at least ${MIN_DAYS_FOR_DAILY_IFOREST} distinct days are required for daily Isolation Forest scoring. Using non-parametric IQR Corridor + 7-day Trailing Median baseline.`;
    }

    res.status(200).json({
      status: 'success',
      data: {
        ...result,
        mlMetadata: {
          mlActive,
          mlServiceOnline,
          algorithmUsed: mlActive
            ? 'Isolation Forest (scikit-learn) + Non-Parametric IQR Corridor'
            : 'Non-Parametric IQR Corridor + Trailing Median (Statistical Fallback)',
          minRequiredDaysForML: MIN_DAYS_FOR_DAILY_IFOREST,
          distinctRecordedDays: result.distinctRecordedDays,
          artifactPath,
          fallbackReason,
        },
      },
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
 * @desc    Get transaction-level outliers using Isolation Forest (when >= 15 transactions)
 *          or Boris Iglewicz and David Hoaglin Modified Z-Scores statistical fallback
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

    // 1. Always compute statistical Modified Z-Score baseline (min 10 transactions)
    const statResult = detectTransactionOutliers(sales, {
      outlierThreshold: minScore,
      limit,
    });

    // 2. If >= 15 transactions, evaluate with multivariate Isolation Forest in Python ML service
    if (sales.length >= MIN_TRANSACTIONS_FOR_IFOREST) {
      const mlTxRes = await requestMLTransactionOutliers({
        transactions: sales,
        outlierThreshold: minScore,
        extremeThreshold: 5.0,
        limit,
        scopeId: String(req.user.id),
        minRequiredTransactions: MIN_TRANSACTIONS_FOR_IFOREST,
      });

      if (mlTxRes.serviceOnline && mlTxRes.data && mlTxRes.data.mlTrained) {
        return res.status(200).json({
          status: 'success',
          data: {
            ...mlTxRes.data,
            minRequiredTransactions: 10,
            minRequiredTransactionsForML: MIN_TRANSACTIONS_FOR_IFOREST,
            mlMetadata: {
              mlActive: true,
              mlServiceOnline: true,
              algorithmUsed: 'Isolation Forest (scikit-learn) + Modified Z-Score',
              minRequiredTransactionsForML: MIN_TRANSACTIONS_FOR_IFOREST,
              totalTransactions: sales.length,
              evaluation: mlTxRes.data.mlEvaluation || null,
              fallbackReason: null,
            },
          },
        });
      }

      const fallbackReason = !mlTxRes.serviceOnline
        ? `Python ML service is currently offline (${mlTxRes.error || 'connection refused'}). Retaining Boris Iglewicz & David Hoaglin Modified Z-Score statistical fallback.`
        : 'Isolation Forest could not be fitted; retaining Modified Z-Score statistical fallback.';

      return res.status(200).json({
        status: 'success',
        data: {
          ...statResult,
          algorithm: 'Boris Iglewicz & David Hoaglin Modified Z-Score (MAD)',
          minRequiredTransactionsForML: MIN_TRANSACTIONS_FOR_IFOREST,
          mlMetadata: {
            mlActive: false,
            mlServiceOnline: mlTxRes.serviceOnline,
            algorithmUsed: 'Boris Iglewicz & David Hoaglin Modified Z-Score (Statistical Fallback)',
            minRequiredTransactionsForML: MIN_TRANSACTIONS_FOR_IFOREST,
            totalTransactions: sales.length,
            fallbackReason,
          },
        },
      });
    }

    const fallbackReason =
      sales.length < 10
        ? `Dataset has ${sales.length} transaction(s). At least 10 transactions are required for Modified Z-Score and ${MIN_TRANSACTIONS_FOR_IFOREST} transactions for Isolation Forest.`
        : `Dataset has ${sales.length} transactions; at least ${MIN_TRANSACTIONS_FOR_IFOREST} transactions are required to train Isolation Forest reliably. Retaining Modified Z-Score (MAD) statistical fallback.`;

    res.status(200).json({
      status: 'success',
      data: {
        ...statResult,
        algorithm: 'Boris Iglewicz & David Hoaglin Modified Z-Score (MAD)',
        minRequiredTransactionsForML: MIN_TRANSACTIONS_FOR_IFOREST,
        mlMetadata: {
          mlActive: false,
          mlServiceOnline: false,
          algorithmUsed: statResult.hasSufficientData
            ? 'Boris Iglewicz & David Hoaglin Modified Z-Score (Statistical Fallback)'
            : 'None (Insufficient Data)',
          minRequiredTransactionsForML: MIN_TRANSACTIONS_FOR_IFOREST,
          totalTransactions: sales.length,
          fallbackReason,
        },
      },
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
    let txResult = detectTransactionOutliers(sales, { outlierThreshold: 3.5, limit: 10 });

    if (sales.length >= MIN_TRANSACTIONS_FOR_IFOREST) {
      const mlTxRes = await requestMLTransactionOutliers({
        transactions: sales,
        outlierThreshold: 3.5,
        extremeThreshold: 5.0,
        limit: 10,
        scopeId: String(req.user.id),
        minRequiredTransactions: MIN_TRANSACTIONS_FOR_IFOREST,
      });
      if (mlTxRes.serviceOnline && mlTxRes.data && mlTxRes.data.mlTrained) {
        txResult = mlTxRes.data;
      }
    }

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
