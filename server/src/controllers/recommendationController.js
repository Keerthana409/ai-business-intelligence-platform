import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Recommendation from '../models/Recommendation.js';
import {
  alignDailyTimeSeries,
} from '../utils/forecastingEngine.js';
import {
  detectDailyAnomalies,
} from '../utils/anomalyEngine.js';
import {
  generateCandidateRecommendations,
  resolveRecommendationConflicts,
} from '../utils/recommendationEngine.js';
import {
  requestMLProductDemandForecast,
  MIN_DAYS_FOR_PRODUCT_RF,
} from '../services/mlServiceClient.js';

/**
 * @desc    Get all active business recommendations for authenticated user
 *          Evaluates live inventory and sales, synchronizes with MongoDB,
 *          prevents duplicate records, and returns deterministic decision cards.
 * @route   GET /api/recommendations
 * @access  Private (JWT protected)
 */
export const getRecommendations = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const { category, priority, status = 'all' } = req.query;

    // 1. Fetch user's inventory catalog and sales history
    const [products, sales] = await Promise.all([
      Product.find({ userId: userObjectId }).sort({ stockQuantity: 1 }),
      Sale.find({ userId: userObjectId }).sort({ date: 1 }),
    ]);

    // 2. Aggregate store-wide daily sales series
    const salesRecords = sales.map((s) => ({
      date: s.date,
      amount: s.totalRevenue,
    }));
    const { series, distinctRecordedDays } = alignDailyTimeSeries(salesRecords);

    // 3. Evaluate daily anomalies (Module 5 engine)
    const anomalyResult = detectDailyAnomalies(series, { sensitivity: 'standard' });

    // 3B. Optional ML SKU demand velocity overrides when a product has >= 10 distinct sales days
    const mlDemandOverrides = new Map();
    const salesByProduct = new Map();
    for (const s of sales) {
      if (s.productId) {
        const idKey = String(s.productId);
        if (!salesByProduct.has(idKey)) salesByProduct.set(idKey, []);
        salesByProduct.get(idKey).push(s);
      }
      const cleanName = (s.productName || '').trim().toLowerCase();
      if (cleanName) {
        const nameKey = `name_${cleanName}`;
        if (!salesByProduct.has(nameKey)) salesByProduct.set(nameKey, []);
        salesByProduct.get(nameKey).push(s);
      }
    }

    const mlEligibleBatch = [];
    for (const prod of products) {
      const prodIdStr = String(prod._id);
      const cleanNameKey = `name_${(prod.name || '').trim().toLowerCase()}`;
      const directSales = salesByProduct.get(prodIdStr) || [];
      const nameSales = salesByProduct.get(cleanNameKey) || [];
      const seenIds = new Set();
      const prodSales = [];
      for (const s of [...directSales, ...nameSales]) {
        const sid = s._id ? String(s._id) : s;
        if (!seenIds.has(sid)) {
          seenIds.add(sid);
          prodSales.push(s);
        }
      }
      if (prodSales.length >= MIN_DAYS_FOR_PRODUCT_RF) {
        const { distinctRecordedDays: prodDays } = alignDailyTimeSeries(
          prodSales.map((s) => ({ date: s.date, amount: s.quantitySold }))
        );
        if (prodDays >= MIN_DAYS_FOR_PRODUCT_RF) {
          mlEligibleBatch.push({
            productId: prodIdStr,
            salesRecords: prodSales.map((s) => ({ date: s.date, quantity: s.quantitySold })),
            stockQuantity: prod.stockQuantity,
            reorderThreshold: prod.reorderThreshold,
            leadTimeDays: prod.leadTimeDays || 7,
          });
        }
      }
    }

    if (mlEligibleBatch.length > 0) {
      const mlBatchRes = await requestMLProductDemandForecast({
        products: mlEligibleBatch,
        horizon: 7,
      });
      if (mlBatchRes.serviceOnline && mlBatchRes.data) {
        for (const [pid, mlProd] of Object.entries(mlBatchRes.data)) {
          if (mlProd && mlProd.mlUsed) {
            mlDemandOverrides.set(pid, {
              avgDailyDemand: mlProd.avgDailyDemand,
              runoutDays: mlProd.runoutDays,
              algorithm: 'AI Demand Forecast',
            });
          }
        }
      }
    }

    // 4. Generate candidate recommendations (Module 6 engine)
    const rawCandidates = generateCandidateRecommendations({
      products,
      sales,
      distinctStoreTradingDays: distinctRecordedDays,
      dailyAnomalyResult: anomalyResult,
      horizon: 14,
      mlDemandOverrides,
    });

    // 5. Apply mutual exclusion and conflict resolution
    const resolvedCandidates = resolveRecommendationConflicts(rawCandidates);

    // 6. Synchronize candidates with MongoDB Recommendation collection
    // Fetch all existing recommendations for this user
    const existingRecs = await Recommendation.find({ userId: userObjectId });
    const existingMap = new Map(existingRecs.map((r) => [r.dedupKey, r]));
    const candidateKeys = new Set(resolvedCandidates.map((c) => c.dedupKey));

    for (const cand of resolvedCandidates) {
      const existing = existingMap.get(cand.dedupKey);

      if (existing) {
        // If user explicitly dismissed or accepted within last 7 days, preserve their choice!
        if (existing.status === 'rejected' || existing.status === 'accepted') {
          continue;
        }

        // If existing is pending, update metrics in place
        existing.title = cand.title;
        existing.actionProposed = cand.actionProposed;
        existing.reason = cand.reason;
        existing.priority = cand.priority;
        existing.category = cand.category;
        existing.isDataSufficient = cand.isDataSufficient;
        existing.evidence = cand.evidence;
        existing.explanation = cand.explanation;
        await existing.save();
      } else {
        // Safe atomic upsert with duplicate-key protection
        try {
          await Recommendation.findOneAndUpdate(
            { userId: userObjectId, dedupKey: cand.dedupKey },
            {
              $setOnInsert: {
                userId: userObjectId,
                dedupKey: cand.dedupKey,
                productId: cand.productId,
                title: cand.title,
                type: cand.type,
                category: cand.category,
                priority: cand.priority,
                actionProposed: cand.actionProposed,
                isDataSufficient: cand.isDataSufficient,
                evidence: cand.evidence,
                explanation: cand.explanation,
                status: 'pending',
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        } catch (err) {
          // E11000 duplicate key race condition: safely ignore
          if (err.code !== 11000) {
            console.error('Error inserting recommendation:', err);
          }
        }
      }
    }

    // 7. Auto-resolve cleared pending recommendations
    // If a pending recommendation's condition is no longer active (e.g. restocked), mark completed
    for (const ex of existingRecs) {
      if (ex.status === 'pending' && !candidateKeys.has(ex.dedupKey)) {
        ex.status = 'completed';
        await ex.save();
      }
    }

    // 8. Query synchronized recommendations for response
    const query = { userId: userObjectId };

    if (status && status !== 'all') {
      query.status = status;
    } else {
      // By default show active pending recommendations, plus any user accepted/dismissed
      query.status = { $in: ['pending', 'accepted', 'rejected'] };
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (priority && priority !== 'all') {
      query.priority = priority;
    }

    const recommendations = await Recommendation.find(query)
      .populate('productId', 'name sku stockQuantity reorderThreshold costPrice sellingPrice supplier unit')
      .sort({ createdAt: -1 });

    // Compute consolidated KPI metrics
    const pendingRecs = recommendations.filter((r) => r.status === 'pending');
    const criticalCount = pendingRecs.filter((r) => r.priority === 'critical').length;
    const highCount = pendingRecs.filter((r) => r.priority === 'high').length;
    const mediumCount = pendingRecs.filter((r) => r.priority === 'medium').length;

    let totalCapitalAtRisk = 0;
    let totalSuggestedOrderUnits = 0;
    let totalEstimatedOutlay = 0;

    for (const r of pendingRecs) {
      if (r.evidence?.capitalAtRisk) {
        totalCapitalAtRisk += Number(r.evidence.capitalAtRisk) || 0;
      }
      if (r.evidence?.suggestedQuantity) {
        totalSuggestedOrderUnits += Number(r.evidence.suggestedQuantity) || 0;
      }
      if (r.evidence?.estimatedTotalCost) {
        totalEstimatedOutlay += Number(r.evidence.estimatedTotalCost) || 0;
      }
    }

    return res.status(200).json({
      status: 'success',
      data: {
        summary: {
          totalActive: pendingRecs.length,
          criticalCount,
          highCount,
          mediumCount,
          totalCapitalAtRisk: Number(totalCapitalAtRisk.toFixed(2)),
          totalSuggestedOrderUnits,
          totalEstimatedOutlay: Number(totalEstimatedOutlay.toFixed(2)),
          distinctRecordedDays,
        },
        recommendations,
      },
    });
  } catch (error) {
    console.error('[Get Recommendations Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to generate decision recommendations',
    });
  }
};

/**
 * @desc    Update recommendation status (accept, reject/dismiss, complete)
 * @route   PATCH /api/recommendations/:id/status
 * @access  Private (JWT protected)
 */
export const updateRecommendationStatus = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'accepted', 'rejected', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid recommendation ID',
      });
    }

    const recommendation = await Recommendation.findOne({
      _id: id,
      userId: userObjectId,
    });

    if (!recommendation) {
      return res.status(404).json({
        status: 'fail',
        message: 'Recommendation not found or access denied',
      });
    }

    recommendation.status = status;
    if (status === 'accepted' || status === 'completed') {
      recommendation.outcomeTracking = recommendation.outcomeTracking || {};
      recommendation.outcomeTracking.actionTakenDate = new Date();
    }
    await recommendation.save();

    return res.status(200).json({
      status: 'success',
      message: `Recommendation status successfully updated to '${status}'.`,
      data: {
        recommendation,
      },
    });
  } catch (error) {
    console.error('[Update Recommendation Status Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update recommendation status',
    });
  }
};

/**
 * @desc    Get quick recommendation summary for dashboard widgets
 * @route   GET /api/recommendations/summary
 * @access  Private (JWT protected)
 */
export const getRecommendationSummary = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    const pendingRecs = await Recommendation.find({
      userId: userObjectId,
      status: 'pending',
    }).sort({ priority: 1, createdAt: -1 });

    const criticalCount = pendingRecs.filter((r) => r.priority === 'critical').length;
    const highCount = pendingRecs.filter((r) => r.priority === 'high').length;
    const mediumCount = pendingRecs.filter((r) => r.priority === 'medium').length;

    let totalCapitalAtRisk = 0;
    let totalSuggestedUnits = 0;

    for (const r of pendingRecs) {
      if (r.evidence?.capitalAtRisk) {
        totalCapitalAtRisk += Number(r.evidence.capitalAtRisk) || 0;
      }
      if (r.evidence?.suggestedQuantity) {
        totalSuggestedUnits += Number(r.evidence.suggestedQuantity) || 0;
      }
    }

    const topRecommendation = pendingRecs.length > 0 ? pendingRecs[0] : null;

    return res.status(200).json({
      status: 'success',
      data: {
        totalPending: pendingRecs.length,
        criticalCount,
        highCount,
        mediumCount,
        totalCapitalAtRisk: Number(totalCapitalAtRisk.toFixed(2)),
        totalSuggestedUnits,
        topRecommendation: topRecommendation
          ? {
              id: topRecommendation._id,
              title: topRecommendation.title,
              priority: topRecommendation.priority,
              category: topRecommendation.category,
              actionProposed: topRecommendation.actionProposed,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('[Get Recommendation Summary Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to retrieve recommendation summary',
    });
  }
};
