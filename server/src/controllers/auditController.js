import mongoose from 'mongoose';
import DecisionAudit from '../models/DecisionAudit.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Recommendation from '../models/Recommendation.js';
import Scenario from '../models/Scenario.js';
import {
  calculateWindowDates,
  checkWindowMaturation,
  aggregateWindowSales,
  evaluateRestockOutcome,
  evaluateClearanceOutcome,
  evaluatePriceOptimizationOutcome,
  evaluateSimulationCalibration,
  resolveUnitCostAndOutlay,
  roundCurrency,
} from '../utils/auditEngine.js';

/**
 * Helper to compute or refresh audit metrics against current database records
 */
const computeAuditMetrics = async ({
  userId,
  decisionType,
  implementedAt,
  observationWindowDays,
  productId,
  unitCost = null,
  costPrice = 0,
  quantityOrdered = 0,
  purchaseOutlay = null,
  scenarioSimulatedResults,
  scenarioHorizon,
  currentAuditDoc = null,
}) => {
  const windowConfig = calculateWindowDates(implementedAt, observationWindowDays);
  const maturation = checkWindowMaturation(implementedAt, observationWindowDays, new Date());

  // Get current product stock and authoritative catalog unit cost
  let currentStock = 0;
  let catalogUnitCost = null;
  if (productId) {
    const prod = await Product.findOne({ _id: productId, userId });
    if (prod) {
      currentStock = prod.stockQuantity;
      catalogUnitCost = prod.costPrice;
    }
  }

  // Resolve authoritative per-unit wholesale cost and single-multiplied purchase outlay
  const resolvedCost = resolveUnitCostAndOutlay({
    quantityOrdered,
    submittedUnitCost: unitCost,
    submittedCostPrice: costPrice,
    catalogUnitCost,
  });
  const effectiveUnitCost = resolvedCost.unitCost;
  const effectivePurchaseOutlay =
    purchaseOutlay !== null && purchaseOutlay !== undefined && !isNaN(purchaseOutlay) && Number(purchaseOutlay) > 0 && !resolvedCost.wasTotalCostNormalized
      ? roundCurrency(purchaseOutlay)
      : resolvedCost.purchaseOutlay;

  // Retrieve sales spanning [preStart, postEnd]
  const salesRecords = await Sale.find({
    userId,
    ...(productId ? { productId } : {}),
    date: {
      $gte: new Date(`${windowConfig.preStart}T00:00:00.000Z`),
      $lte: new Date(`${windowConfig.postEnd}T23:59:59.999Z`),
    },
  }).sort({ date: 1 });

  // 1. Baseline metrics aggregation (Gross Profit = Revenue - COGS using per-unit wholesale cost)
  const baseline = aggregateWindowSales(
    salesRecords,
    windowConfig.preStart,
    windowConfig.preEnd,
    effectiveUnitCost
  );

  // 2. Post-decision metrics aggregation
  // If window is not matured, aggregate up to current date or postEnd, whichever is earlier
  const post = aggregateWindowSales(
    salesRecords,
    windowConfig.postStart,
    windowConfig.postEnd,
    effectiveUnitCost
  );

  // 3. Evaluate according to decisionType
  let evalResult;
  if (decisionType === 'inventory_restock') {
    evalResult = evaluateRestockOutcome({
      preMetrics: baseline,
      postMetrics: post,
      quantityOrdered: Number(quantityOrdered) || 0,
      unitCost: effectiveUnitCost,
      costPrice: effectiveUnitCost,
      purchaseOutlay: effectivePurchaseOutlay,
      currentStock,
      isMatured: maturation.isMatured,
    });
  } else if (decisionType === 'clearance_markdown') {
    evalResult = evaluateClearanceOutcome({
      preMetrics: baseline,
      postMetrics: post,
      costPrice: effectiveUnitCost,
      isMatured: maturation.isMatured,
    });
  } else {
    // price_optimization, promotional_discount, demand_stabilization
    evalResult = evaluatePriceOptimizationOutcome({
      preMetrics: baseline,
      postMetrics: post,
      isMatured: maturation.isMatured,
    });
  }

  // 4. Evaluate simulation calibration if scenario linked
  let simComparison = {
    isLinked: false,
    isCompatible: false,
    calibrationAssessment: 'not_applicable',
    explanation: 'No simulation scenario linked.',
  };

  if (scenarioSimulatedResults) {
    simComparison = evaluateSimulationCalibration(
      scenarioSimulatedResults,
      post,
      scenarioHorizon || observationWindowDays,
      observationWindowDays
    );
  } else if (currentAuditDoc?.simulationComparison?.isLinked) {
    simComparison = currentAuditDoc.simulationComparison;
  }

  return {
    windowConfig,
    maturation,
    resolvedCost: {
      unitCost: effectiveUnitCost,
      purchaseOutlay: effectivePurchaseOutlay,
    },
    baseline: {
      capturedAt: currentAuditDoc?.baselineMetrics?.capturedAt || new Date(),
      windowDays: windowConfig.windowDays,
      stockAtImplementation: currentAuditDoc?.baselineMetrics?.stockAtImplementation || currentStock,
      distinctTradingDays: baseline.distinctTradingDays,
      totalUnitsSold: baseline.totalUnitsSold,
      totalRevenue: baseline.totalRevenue,
      totalCOGS: baseline.totalCOGS,
      grossProfit: baseline.grossProfit,
      averageDailyDemand: baseline.averageDailyDemand,
      hasSufficientData: baseline.hasSufficientData,
    },
    post: {
      evaluatedAt: new Date(),
      daysElapsed: maturation.daysElapsed,
      isWindowCompleted: maturation.isMatured,
      currentStock,
      distinctTradingDays: post.distinctTradingDays,
      totalUnitsSold: post.totalUnitsSold,
      totalRevenue: post.totalRevenue,
      totalCOGS: post.totalCOGS,
      grossProfit: post.grossProfit,
      averageDailyDemand: post.averageDailyDemand,
      minStockObserved: currentStock,
      capitalRecovered: evalResult.deadCapitalRecovered || 0,
      hasSufficientData: post.hasSufficientData,
    },
    evalResult,
    simComparison,
  };
};

/**
 * @desc    Explicitly confirm and implement a decision for outcome tracking
 * @route   POST /api/audit/implement (and alias POST /api/audit)
 * @access  Private (JWT protected)
 */
export const implementDecision = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const {
      decisionSource,
      recommendationId,
      scenarioId,
      decisionType,
      title,
      productId,
      implementedAt,
      observationWindowDays = 14,
      implementationNotes = '',
      implementedParameters = {},
    } = req.body;

    if (!decisionSource || !decisionType || !title || !implementedAt) {
      return res.status(400).json({
        status: 'fail',
        message: 'decisionSource, decisionType, title, and implementedAt are required fields.',
      });
    }

    const validSources = ['recommendation', 'scenario', 'manual_action'];
    if (!validSources.includes(decisionSource)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid decisionSource. Must be one of: ${validSources.join(', ')}`,
      });
    }

    const validTypes = [
      'inventory_restock',
      'clearance_markdown',
      'price_optimization',
      'promotional_discount',
      'demand_stabilization',
    ];
    if (!validTypes.includes(decisionType)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid decisionType. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const validWindows = [7, 14, 30];
    const windowDays = parseInt(observationWindowDays, 10) || 14;
    if (!validWindows.includes(windowDays)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid observationWindowDays. Must be 7, 14, or 30 days.`,
      });
    }

    const implDate = new Date(implementedAt);
    if (isNaN(implDate.getTime())) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid implementation date format. Provide a valid ISO or YYYY-MM-DD date.',
      });
    }

    // Check duplicate: prevent creating duplicate audit for same recommendation
    if (recommendationId) {
      if (!mongoose.Types.ObjectId.isValid(recommendationId)) {
        return res.status(400).json({ status: 'fail', message: 'Invalid recommendation ID' });
      }
      const existingAudit = await DecisionAudit.findOne({
        userId: userObjectId,
        recommendationId,
        implementationStatus: 'implemented',
      });
      if (existingAudit) {
        return res.status(409).json({
          status: 'fail',
          message: 'An active decision audit record already exists for this recommendation.',
          data: { auditId: existingAudit._id },
        });
      }
    }

    // Normalize productId in case a populated object was passed
    const normalizedProductId =
      productId && typeof productId === 'object' && productId._id
        ? String(productId._id)
        : productId;

    // Resolve Product attributes
    let targetProductId = null;
    let productName = '';
    let sku = '';
    let catalogUnitCost = null;
    let recommendationUnitCost = null;

    if (normalizedProductId) {
      if (!mongoose.Types.ObjectId.isValid(normalizedProductId)) {
        return res.status(400).json({ status: 'fail', message: 'Invalid product ID' });
      }
      const product = await Product.findOne({ _id: normalizedProductId, userId: userObjectId });
      if (product) {
        targetProductId = product._id;
        productName = product.name;
        sku = product.sku;
        catalogUnitCost = product.costPrice;
      }
    }

    // Handle Linked Recommendation
    if (recommendationId) {
      const rec = await Recommendation.findOne({ _id: recommendationId, userId: userObjectId });
      if (rec) {
        if (rec.evidence?.unitCost !== undefined) {
          recommendationUnitCost = Number(rec.evidence.unitCost);
        }
        if (!targetProductId && rec.productId) {
          targetProductId = rec.productId;
          const prod = await Product.findOne({ _id: rec.productId, userId: userObjectId });
          if (prod) {
            productName = prod.name;
            sku = prod.sku;
            catalogUnitCost = prod.costPrice;
          }
        }
        // Link outcomeTracking in Recommendation without breaking existing schema
        rec.outcomeTracking = rec.outcomeTracking || {};
        rec.outcomeTracking.actionTakenDate = implDate;
        rec.status = 'completed'; // Auto-resolve recommendation on confirmed implementation
        await rec.save();
      }
    }

    // Handle Linked Scenario (Keep scenario snapshot immutable!)
    let scenarioSimulatedResults = null;
    let scenarioHorizon = 14;
    let linkedScenarioId = null;

    if (scenarioId) {
      if (!mongoose.Types.ObjectId.isValid(scenarioId)) {
        return res.status(400).json({ status: 'fail', message: 'Invalid scenario ID' });
      }
      const scenario = await Scenario.findOne({ _id: scenarioId, userId: userObjectId });
      if (scenario) {
        linkedScenarioId = scenario._id;
        scenarioSimulatedResults = scenario.simulatedResults;
        scenarioHorizon = scenario.timeline?.horizonDays || 14;
        if (!targetProductId && scenario.productId) {
          targetProductId = scenario.productId;
          productName = scenario.productName || productName;
          const prod = await Product.findOne({ _id: scenario.productId, userId: userObjectId });
          if (prod) {
            productName = prod.name || productName;
            sku = prod.sku || sku;
            catalogUnitCost = prod.costPrice;
          }
        }
      }
    }

    const quantityOrdered = Number(implementedParameters.quantityOrdered) || 0;
    const {
      unitCost,
      costPrice,
      purchaseOutlay,
      capitalInvested,
    } = resolveUnitCostAndOutlay({
      quantityOrdered,
      submittedUnitCost: implementedParameters.unitCost,
      submittedCostPrice: implementedParameters.costPrice,
      catalogUnitCost,
      recommendationUnitCost,
    });

    // Compute initial baseline and window metrics using per-unit wholesale cost
    const metricsResult = await computeAuditMetrics({
      userId: userObjectId,
      decisionType,
      implementedAt: implDate,
      observationWindowDays: windowDays,
      productId: targetProductId,
      unitCost,
      costPrice,
      quantityOrdered,
      purchaseOutlay,
      scenarioSimulatedResults,
      scenarioHorizon,
    });

    // Create Audit document with unitCost and purchaseOutlay stored separately
    const audit = await DecisionAudit.create({
      userId: userObjectId,
      decisionSource,
      recommendationId: recommendationId || null,
      scenarioId: linkedScenarioId || null,
      decisionType,
      title: title.trim(),
      productId: targetProductId,
      productName,
      sku,
      implementationStatus: 'implemented',
      implementedAt: implDate,
      implementationNotes: implementationNotes.trim(),
      implementedParameters: {
        ...implementedParameters,
        quantityOrdered,
        unitCost,
        costPrice,
        purchaseOutlay,
        capitalInvested,
      },
      observationWindowDays: windowDays,
      baselineMetrics: metricsResult.baseline,
      postMetrics: metricsResult.post,
      simulationComparison: metricsResult.simComparison,
      evaluation: {
        status: metricsResult.evalResult.status,
        outcomeRating: metricsResult.evalResult.outcomeRating,
        headline: metricsResult.evalResult.headline,
        stockoutAverted: metricsResult.evalResult.stockoutAverted,
        deadCapitalRecovered: metricsResult.evalResult.deadCapitalRecovered,
        investmentCost: metricsResult.evalResult.investmentCost,
        capitalValueSold: metricsResult.evalResult.capitalValueSold,
        deltaRevenue: metricsResult.evalResult.deltaRevenue,
        deltaUnits: metricsResult.evalResult.deltaUnits,
        deltaGrossProfit: metricsResult.evalResult.deltaGrossProfit,
        incrementalNetBenefit: metricsResult.evalResult.incrementalNetBenefit,
        roiPercent: metricsResult.evalResult.roiPercent,
        roiExplanation: metricsResult.evalResult.roiExplanation,
        empiricalVarianceDisclaimer:
          'Observed metric variance represents empirical before-and-after performance during the evaluation window. Observational variance indicates correlation rather than isolated laboratory causation.',
        evidence: {
          windowConfig: metricsResult.windowConfig,
          maturation: metricsResult.maturation,
        },
      },
      auditHistory: [
        {
          action: 'implemented',
          performedAt: new Date(),
          notes: `Explicit implementation confirmed for date ${implDate.toISOString().slice(0, 10)}.`,
        },
      ],
    });

    return res.status(201).json({
      status: 'success',
      message: 'Decision confirmed and implemented. Observation window is now active.',
      data: { audit },
    });
  } catch (error) {
    console.error('[Implement Decision Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to record decision implementation',
    });
  }
};

/**
 * @desc    Get all decision audits for authenticated user
 *          Performs on-the-fly maturation updates for in-observation records
 * @route   GET /api/audit
 * @access  Private (JWT protected)
 */
export const getAudits = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const { status, decisionType, productId, decisionSource } = req.query;

    const query = { userId: userObjectId };

    if (status && status !== 'all') {
      query['evaluation.status'] = status;
    }
    if (decisionType && decisionType !== 'all') {
      query.decisionType = decisionType;
    }
    if (decisionSource && decisionSource !== 'all') {
      query.decisionSource = decisionSource;
    }
    if (productId) {
      query.productId = productId;
    }

    const audits = await DecisionAudit.find(query).sort({ implementedAt: -1, createdAt: -1 });

    // Refresh maturation on any in_observation audits
    const refreshedAudits = [];
    for (const audit of audits) {
      if (audit.evaluation?.status === 'in_observation') {
        const maturation = checkWindowMaturation(
          audit.implementedAt,
          audit.observationWindowDays,
          new Date()
        );
        const needsCostNormalization =
          audit.decisionType === 'inventory_restock' &&
          (audit.implementedParameters?.unitCost === null ||
            audit.implementedParameters?.unitCost === undefined);

        if (
          maturation.isMatured ||
          maturation.daysElapsed !== audit.postMetrics?.daysElapsed ||
          needsCostNormalization
        ) {
          try {
            const scenarioSimulated = audit.scenarioId
              ? (await Scenario.findOne({ _id: audit.scenarioId, userId: userObjectId }))?.simulatedResults
              : null;

            const refreshed = await computeAuditMetrics({
              userId: userObjectId,
              decisionType: audit.decisionType,
              implementedAt: audit.implementedAt,
              observationWindowDays: audit.observationWindowDays,
              productId: audit.productId,
              unitCost: audit.implementedParameters?.unitCost ?? null,
              costPrice: audit.implementedParameters?.costPrice || 0,
              quantityOrdered: audit.implementedParameters?.quantityOrdered || 0,
              purchaseOutlay: audit.implementedParameters?.purchaseOutlay ?? null,
              scenarioSimulatedResults: scenarioSimulated,
              currentAuditDoc: audit,
            });

            audit.baselineMetrics = refreshed.baseline;
            audit.postMetrics = refreshed.post;
            if (refreshed.resolvedCost) {
              audit.implementedParameters.unitCost = refreshed.resolvedCost.unitCost;
              audit.implementedParameters.costPrice = refreshed.resolvedCost.unitCost;
              audit.implementedParameters.purchaseOutlay = refreshed.resolvedCost.purchaseOutlay;
              audit.implementedParameters.capitalInvested = refreshed.resolvedCost.purchaseOutlay;
            }
            audit.evaluation.status = refreshed.evalResult.status;
            audit.evaluation.outcomeRating = refreshed.evalResult.outcomeRating;
            audit.evaluation.headline = refreshed.evalResult.headline;
            audit.evaluation.stockoutAverted = refreshed.evalResult.stockoutAverted;
            audit.evaluation.deadCapitalRecovered = refreshed.evalResult.deadCapitalRecovered;
            audit.evaluation.investmentCost = refreshed.evalResult.investmentCost;
            audit.evaluation.capitalValueSold = refreshed.evalResult.capitalValueSold;
            audit.evaluation.deltaRevenue = refreshed.evalResult.deltaRevenue;
            audit.evaluation.deltaUnits = refreshed.evalResult.deltaUnits;
            audit.evaluation.deltaGrossProfit = refreshed.evalResult.deltaGrossProfit;
            audit.evaluation.incrementalNetBenefit = refreshed.evalResult.incrementalNetBenefit;
            audit.evaluation.roiPercent = refreshed.evalResult.roiPercent;
            audit.evaluation.roiExplanation = refreshed.evalResult.roiExplanation;
            audit.simulationComparison = refreshed.simComparison;

            if (maturation.isMatured) {
              audit.auditHistory.push({
                action: 'evaluated',
                performedAt: new Date(),
                notes: `Observation window of ${audit.observationWindowDays} days completed. Final outcome rating computed.`,
              });
            }

            await audit.save();
          } catch (err) {
            console.error('Auto-refresh error for audit:', audit._id, err);
          }
        }
      }
      const auditObj = audit.toObject ? audit.toObject() : { ...audit };
      if (
        auditObj.decisionType === 'inventory_restock' &&
        auditObj.evaluation?.stockoutAverted === false &&
        Number(auditObj.postMetrics?.distinctTradingDays || 0) === 0 &&
        Number(auditObj.postMetrics?.totalUnitsSold || 0) === 0 &&
        Number(auditObj.postMetrics?.currentStock ?? 1) > 0
      ) {
        auditObj.evaluation = {
          ...auditObj.evaluation,
          stockoutAverted: null,
          headline:
            auditObj.evaluation.status === 'in_observation'
              ? 'Pending post-decision trading data to evaluate stockout prevention and financial impact.'
              : auditObj.evaluation.headline,
        };
      }
      refreshedAudits.push(auditObj);
    }

    return res.status(200).json({
      status: 'success',
      count: refreshedAudits.length,
      data: { audits: refreshedAudits },
    });
  } catch (error) {
    console.error('[Get Audits Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to retrieve decision audits',
    });
  }
};

/**
 * @desc    Get single decision audit details
 * @route   GET /api/audit/:id
 * @access  Private (JWT protected)
 */
export const getAuditById = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid audit ID' });
    }

    const audit = await DecisionAudit.findOne({ _id: id, userId: userObjectId });
    if (!audit) {
      return res.status(404).json({ status: 'fail', message: 'Decision audit not found' });
    }

    const auditObj = audit.toObject ? audit.toObject() : { ...audit };
    if (
      auditObj.decisionType === 'inventory_restock' &&
      auditObj.evaluation?.stockoutAverted === false &&
      Number(auditObj.postMetrics?.distinctTradingDays || 0) === 0 &&
      Number(auditObj.postMetrics?.totalUnitsSold || 0) === 0 &&
      Number(auditObj.postMetrics?.currentStock ?? 1) > 0
    ) {
      auditObj.evaluation = {
        ...auditObj.evaluation,
        stockoutAverted: null,
        headline:
          auditObj.evaluation.status === 'in_observation'
            ? 'Pending post-decision trading data to evaluate stockout prevention and financial impact.'
            : auditObj.evaluation.headline,
      };
    }

    return res.status(200).json({
      status: 'success',
      data: { audit: auditObj },
    });
  } catch (error) {
    console.error('[Get Audit By ID Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to retrieve decision audit',
    });
  }
};

/**
 * @desc    Get executive summary of decision outcomes & realized ROI
 * @route   GET /api/audit/summary
 * @access  Private (JWT protected)
 */
export const getAuditSummary = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    const audits = await DecisionAudit.find({
      userId: userObjectId,
      implementationStatus: 'implemented',
    });

    let totalImplemented = audits.length;
    let inObservationCount = 0;
    let maturedCount = 0;
    let favorableCount = 0;
    let neutralCount = 0;
    let unfavorableCount = 0;
    let inconclusiveCount = 0;

    let totalCapitalRecovered = 0;
    let stockoutsAvertedCount = 0;
    let totalIncrementalNetBenefit = 0;

    for (const a of audits) {
      const status = a.evaluation?.status;
      const rating = a.evaluation?.outcomeRating;

      if (status === 'in_observation') {
        inObservationCount += 1;
      } else if (status === 'evaluated_matured') {
        maturedCount += 1;
      } else if (status === 'insufficient_data') {
        inconclusiveCount += 1;
      }

      if (rating === 'favorable') favorableCount += 1;
      else if (rating === 'neutral') neutralCount += 1;
      else if (rating === 'unfavorable') unfavorableCount += 1;
      else if (rating === 'inconclusive') inconclusiveCount += 1;

      if (a.evaluation?.deadCapitalRecovered) {
        totalCapitalRecovered += Number(a.evaluation.deadCapitalRecovered) || 0;
      }

      if (a.evaluation?.stockoutAverted === true) {
        stockoutsAvertedCount += 1;
      }

      if (a.evaluation?.incrementalNetBenefit !== null && a.evaluation?.incrementalNetBenefit !== undefined) {
        totalIncrementalNetBenefit += Number(a.evaluation.incrementalNetBenefit) || 0;
      }
    }

    // Success rate calculated across evaluated matured decisions
    const evaluatedTotal = favorableCount + neutralCount + unfavorableCount;
    const successRate = evaluatedTotal > 0 ? Number(((favorableCount / evaluatedTotal) * 100).toFixed(1)) : null;

    return res.status(200).json({
      status: 'success',
      data: {
        summary: {
          totalImplemented,
          inObservationCount,
          maturedCount,
          favorableCount,
          neutralCount,
          unfavorableCount,
          inconclusiveCount,
          successRate,
          totalCapitalRecovered: roundCurrency(totalCapitalRecovered),
          stockoutsAvertedCount,
          totalIncrementalNetBenefit: roundCurrency(totalIncrementalNetBenefit),
        },
      },
    });
  } catch (error) {
    console.error('[Get Audit Summary Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to generate audit summary',
    });
  }
};

/**
 * @desc    Manually force recalculation of an audit record
 * @route   PATCH /api/audit/:id/recalculate
 * @access  Private (JWT protected)
 */
export const recalculateAudit = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid audit ID' });
    }

    const audit = await DecisionAudit.findOne({ _id: id, userId: userObjectId });
    if (!audit) {
      return res.status(404).json({ status: 'fail', message: 'Decision audit not found' });
    }

    const scenarioSimulated = audit.scenarioId
      ? (await Scenario.findOne({ _id: audit.scenarioId, userId: userObjectId }))?.simulatedResults
      : null;

    const refreshed = await computeAuditMetrics({
      userId: userObjectId,
      decisionType: audit.decisionType,
      implementedAt: audit.implementedAt,
      observationWindowDays: audit.observationWindowDays,
      productId: audit.productId,
      unitCost: audit.implementedParameters?.unitCost ?? null,
      costPrice: audit.implementedParameters?.costPrice || 0,
      quantityOrdered: audit.implementedParameters?.quantityOrdered || 0,
      purchaseOutlay: audit.implementedParameters?.purchaseOutlay ?? null,
      scenarioSimulatedResults: scenarioSimulated,
      currentAuditDoc: audit,
    });

    audit.baselineMetrics = refreshed.baseline;
    audit.postMetrics = refreshed.post;
    if (refreshed.resolvedCost) {
      audit.implementedParameters.unitCost = refreshed.resolvedCost.unitCost;
      audit.implementedParameters.costPrice = refreshed.resolvedCost.unitCost;
      audit.implementedParameters.purchaseOutlay = refreshed.resolvedCost.purchaseOutlay;
      audit.implementedParameters.capitalInvested = refreshed.resolvedCost.purchaseOutlay;
    }
    audit.evaluation.status = refreshed.evalResult.status;
    audit.evaluation.outcomeRating = refreshed.evalResult.outcomeRating;
    audit.evaluation.headline = refreshed.evalResult.headline;
    audit.evaluation.stockoutAverted = refreshed.evalResult.stockoutAverted;
    audit.evaluation.deadCapitalRecovered = refreshed.evalResult.deadCapitalRecovered;
    audit.evaluation.investmentCost = refreshed.evalResult.investmentCost;
    audit.evaluation.capitalValueSold = refreshed.evalResult.capitalValueSold;
    audit.evaluation.deltaRevenue = refreshed.evalResult.deltaRevenue;
    audit.evaluation.deltaUnits = refreshed.evalResult.deltaUnits;
    audit.evaluation.deltaGrossProfit = refreshed.evalResult.deltaGrossProfit;
    audit.evaluation.incrementalNetBenefit = refreshed.evalResult.incrementalNetBenefit;
    audit.evaluation.roiPercent = refreshed.evalResult.roiPercent;
    audit.evaluation.roiExplanation = refreshed.evalResult.roiExplanation;
    audit.simulationComparison = refreshed.simComparison;

    audit.auditHistory.push({
      action: 'recalculated',
      performedAt: new Date(),
      notes: 'Manual recalculation performed against latest database records.',
    });

    await audit.save();

    return res.status(200).json({
      status: 'success',
      message: 'Decision audit metrics successfully recalculated.',
      data: { audit },
    });
  } catch (error) {
    console.error('[Recalculate Audit Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to recalculate audit',
    });
  }
};

/**
 * @desc    Safely delete or cancel a decision audit
 * @route   DELETE /api/audit/:id
 * @access  Private (JWT protected)
 */
export const deleteAudit = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid audit ID' });
    }

    const audit = await DecisionAudit.findOneAndDelete({ _id: id, userId: userObjectId });
    if (!audit) {
      return res.status(404).json({ status: 'fail', message: 'Decision audit not found' });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Decision audit successfully deleted.',
    });
  } catch (error) {
    console.error('[Delete Audit Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete decision audit',
    });
  }
};
