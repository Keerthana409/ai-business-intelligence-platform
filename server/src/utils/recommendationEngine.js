/**
 * Native JavaScript Decision Support & Recommendation Engine
 * AI-Powered Business Intelligence & Decision Intelligence Platform
 *
 * Implements:
 * - Deterministic, rule-based recommendation generation
 * - Reorder quantity calculation with lead-time demand buffers and safety thresholds
 * - Declining sales trend split-window evaluation with zero-baseline protection
 * - Slow-moving & dead stock evaluation with capital-at-risk thresholds
 * - High-severity anomaly follow-up recommendations
 * - Mutual exclusion and conflict resolution (no contradictory alerts for same product)
 * - Deterministic priority ranking: critical > high > medium > low
 * - Comprehensive explainability with exact factors, metrics, thresholds, and evidence
 *
 * Strictly traditional statistical mathematics & deterministic business logic.
 * Zero LLMs, ChatGPT APIs, Gemini APIs, or synthetic data.
 */

import {
  evaluateProductDemandRisk,
  alignDailyTimeSeries,
  formatDateKey,
} from './forecastingEngine.js';
import {
  detectDailyAnomalies,
} from './anomalyEngine.js';

/**
 * Escape regular expression special characters in string
 */
export const escapeRegex = (str = '') =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Calculate recommended reorder quantity based on demand velocity and lead time,
 * or safely fall back to catalog safety threshold buffer when sales history is insufficient.
 *
 * @param {object} params
 * @param {number} params.stockQuantity - Current on-hand stock
 * @param {number} params.reorderThreshold - Safety reorder point
 * @param {number} params.leadTimeDays - Supplier replenishment delay in days
 * @param {number} [params.avgDailyDemand=0] - Projected daily sales demand
 * @param {boolean} [params.hasSufficientData=false] - Whether demand is empirically estimated
 * @returns {{ suggestedQuantity: number, leadTimeDemand: number, targetStock: number, isDemandBased: boolean }}
 */
export const calculateReorderQuantity = ({
  stockQuantity = 0,
  reorderThreshold = 10,
  leadTimeDays = 7,
  avgDailyDemand = 0,
  hasSufficientData = false,
}) => {
  const stock = Math.max(0, Number(stockQuantity) || 0);
  const threshold = Math.max(0, Number(reorderThreshold) || 10);
  const leadTime = Math.max(1, Number(leadTimeDays) || 7);

  if (hasSufficientData && avgDailyDemand > 0) {
    const leadTimeDemand = Number((avgDailyDemand * leadTime).toFixed(1));
    const targetStock = Math.ceil(threshold + leadTimeDemand);
    const suggestedQuantity = Math.max(0, Math.ceil(targetStock - stock));

    return {
      suggestedQuantity,
      leadTimeDemand,
      targetStock,
      isDemandBased: true,
    };
  }

  // Fallback for insufficient sales history: only suggest when restock is justified (stock <= threshold)
  if (stock <= threshold) {
    const targetStock = threshold * 2;
    const suggestedQuantity = Math.max(1, targetStock - stock);

    return {
      suggestedQuantity,
      leadTimeDemand: 0,
      targetStock,
      isDemandBased: false,
    };
  }

  return {
    suggestedQuantity: 0,
    leadTimeDemand: 0,
    targetStock: threshold,
    isDemandBased: false,
  };
};

/**
 * Evaluate product declining sales over a 14-day split-window:
 * Period 1 (Days t-14 to t-8) vs. Period 2 (Days t-7 to t-1).
 * Day t is strictly excluded.
 *
 * Requires:
 * - Store to have >= 7 distinct recorded trading days.
 * - Product to have sold >= 5 units across at least 2 distinct days in Period 1.
 *
 * @param {object} params
 * @param {Array<{ date: Date|string, quantity: number }>} params.productSales
 * @param {number} params.distinctStoreTradingDays - Store-wide recorded trading days
 * @param {Date|string} [params.referenceDate] - Target day t
 * @returns {object|null}
 */
export const evaluateProductDecliningSales = ({
  productSales = [],
  distinctStoreTradingDays = 0,
  referenceDate = new Date(),
}) => {
  // Gate: Store must have established empirical trading history (>= 7 distinct trading days)
  if (distinctStoreTradingDays < 7) {
    return null;
  }

  const refDateObj = new Date(referenceDate);
  if (isNaN(refDateObj.getTime())) return null;

  // Window bounds (UTC)
  const d14Ago = new Date(refDateObj);
  d14Ago.setUTCDate(d14Ago.getUTCDate() - 14);
  const d7Ago = new Date(refDateObj);
  d7Ago.setUTCDate(d7Ago.getUTCDate() - 7);
  const d1Ago = new Date(refDateObj);
  d1Ago.setUTCDate(d1Ago.getUTCDate() - 1);

  const p1Dates = new Set();
  let unitsP1 = 0;
  let revenueP1 = 0;

  const p2Dates = new Set();
  let unitsP2 = 0;
  let revenueP2 = 0;

  for (const s of productSales) {
    const saleDate = new Date(s.date);
    if (isNaN(saleDate.getTime())) continue;

    const dateKey = saleDate.toISOString().slice(0, 10);
    const qty = Number(s.quantity ?? s.quantitySold ?? 0);
    const rev = Number(s.totalRevenue ?? (qty * (s.unitPrice || 0)));

    if (saleDate >= d14Ago && saleDate < d7Ago) {
      unitsP1 += qty;
      revenueP1 += rev;
      p1Dates.add(dateKey);
    } else if (saleDate >= d7Ago && saleDate <= d1Ago) {
      unitsP2 += qty;
      revenueP2 += rev;
      p2Dates.add(dateKey);
    }
  }

  // Baseline sufficiency: Product must have sold at least 5 units across at least 2 distinct days in Period 1
  if (unitsP1 < 5 || p1Dates.size < 2) {
    return null;
  }

  // Percentage decline formula: (P1 - P2) / P1 * 100%
  const dropUnits = unitsP1 - unitsP2;
  const declinePct = Number(((dropUnits / unitsP1) * 100).toFixed(1));

  // Trigger alert only when decline is >= 40%
  if (declinePct < 40) {
    return null;
  }

  return {
    isDeclining: true,
    unitsP1,
    unitsP2,
    revenueP1: Number(revenueP1.toFixed(2)),
    revenueP2: Number(revenueP2.toFixed(2)),
    declinePct,
    p1DaysWithSales: p1Dates.size,
    p2DaysWithSales: p2Dates.size,
  };
};

/**
 * Evaluate slow-moving & dead inventory with capital-at-risk thresholds.
 *
 * @param {object} params
 * @param {object} params.product - Product document
 * @param {number} params.unitsSoldLast30Days - Total units sold in last 30 days
 * @param {number|null} params.runoutDays - Forecasted days to deplete stock
 * @param {boolean} params.hasSufficientData - Whether demand projection was reliable
 * @returns {object|null}
 */
export const evaluateProductSlowMovingStock = ({
  product,
  unitsSoldLast30Days = 0,
  runoutDays = null,
  hasSufficientData = false,
}) => {
  const stock = Number(product.stockQuantity) || 0;
  const threshold = Number(product.reorderThreshold) || 10;
  const cost = Number(product.costPrice) || 0;

  // Rule 1: Must have excess quantity over safety threshold (stock > 2x threshold)
  if (stock <= threshold * 2 || stock === 0) {
    return null;
  }

  // Rule 2: Stagnant velocity criteria
  // If history exists: runoutDays > 90 days OR sold <= 1 unit in last 30 days
  // If product in catalog for > 14 days with 0 sales: dead stock
  const catalogAgeDays = product.createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(product.createdAt).getTime()) / 86400000))
    : 30;

  const isDeadStock = catalogAgeDays >= 14 && unitsSoldLast30Days === 0;
  const isSlowMovingWithDemand = hasSufficientData && runoutDays !== null && runoutDays > 90;
  const isSlowMovingUnits = unitsSoldLast30Days <= 1;

  if (!isDeadStock && !isSlowMovingWithDemand && !isSlowMovingUnits) {
    return null;
  }

  // Rule 3: Capital at risk floor (excess units * cost price >= $50)
  const excessUnits = stock - threshold;
  const capitalAtRisk = Number((excessUnits * cost).toFixed(2));

  if (capitalAtRisk < 50) {
    return null;
  }

  const priority = capitalAtRisk >= 300 ? 'high' : 'medium';

  return {
    isSlowMoving: true,
    isDeadStock,
    excessUnits,
    capitalAtRisk,
    priority,
    unitsSoldLast30Days,
    runoutDays,
  };
};

/**
 * Generate full candidate decision recommendations for user catalog and sales history.
 *
 * @param {object} params
 * @param {Array<object>} params.products - User's product documents
 * @param {Array<object>} params.sales - User's sales documents
 * @param {number} [params.distinctStoreTradingDays=0] - Number of distinct store sales days
 * @param {object} [params.dailyAnomalyResult=null] - Output from detectDailyAnomalies
 * @param {number} [params.horizon=14] - Forecast horizon
 * @returns {Array<object>} Candidate recommendations
 */
export const generateCandidateRecommendations = ({
  products = [],
  sales = [],
  distinctStoreTradingDays = 0,
  dailyAnomalyResult = null,
  horizon = 14,
}) => {
  const candidates = [];

  // Group sales by product id and product name for fast lookups
  const salesByProduct = new Map();

  for (const s of sales) {
    const key = s.productId ? String(s.productId) : `name_${(s.productName || '').trim().toLowerCase()}`;
    if (!salesByProduct.has(key)) {
      salesByProduct.set(key, []);
    }
    salesByProduct.get(key).push(s);
  }

  // 1. Evaluate Product-Level Rules
  for (const prod of products) {
    const prodIdStr = String(prod._id);
    const prodCleanName = (prod.name || '').trim();
    const cleanNameKey = `name_${prodCleanName.toLowerCase()}`;

    // Combine direct productId matches and name fallback matches
    const directSales = salesByProduct.get(prodIdStr) || [];
    const nameSales = salesByProduct.get(cleanNameKey) || [];
    const allProdSales = directSales.length > 0 ? directSales : nameSales;

    const stock = Number(prod.stockQuantity) || 0;
    const threshold = Number(prod.reorderThreshold) || 10;
    const leadTime = Number(prod.leadTimeDays) || 7;
    const cost = Number(prod.costPrice) || 0;
    const price = Number(prod.sellingPrice) || 0;
    const supplier = prod.supplier || 'Primary Supplier';

    // 1A. Run Demand & Risk Evaluation (Reusing forecastingEngine)
    const demandEval = evaluateProductDemandRisk({
      salesRecords: allProdSales.map((s) => ({ date: s.date, quantity: s.quantitySold })),
      stockQuantity: stock,
      reorderThreshold: threshold,
      leadTimeDays: leadTime,
      horizon,
    });

    const hasDemandHistory = demandEval.hasSufficientData;
    const avgDailyDemand = demandEval.avgDailyDemand || 0;
    const runoutDays = demandEval.runoutDays;

    // 1B. Reorder Quantity calculation
    const reorderResult = calculateReorderQuantity({
      stockQuantity: stock,
      reorderThreshold: threshold,
      leadTimeDays: leadTime,
      avgDailyDemand,
      hasSufficientData: hasDemandHistory,
    });

    const suggestedUnits = reorderResult.suggestedQuantity;
    const estimatedCost = Number((suggestedUnits * cost).toFixed(2));

    // RULE REC-01: Out of Stock (stockQuantity === 0)
    if (stock === 0) {
      candidates.push({
        dedupKey: `REC-01_${prodIdStr}`,
        ruleId: 'REC-01',
        type: 'reorder_urgency',
        category: 'Restock Urgency',
        priority: 'critical',
        productId: prod._id,
        targetProduct: { id: prod._id, name: prod.name, sku: prod.sku, category: prod.category },
        title: `Immediate Stockout: ${prod.name} is completely out of stock`,
        actionProposed: `Create Purchase Order Draft for ${suggestedUnits} ${prod.unit || 'pcs'} with supplier '${supplier}'.`,
        reason: hasDemandHistory
          ? `Current stock is 0 units. Projected daily demand is ${avgDailyDemand} units/day with a ${leadTime}-day replenishment lead time.`
          : `Current stock is 0 units. Restock quantity of ${suggestedUnits} units suggested based on catalog safety threshold buffer due to insufficient sales history (<3 distinct days).`,
        isDataSufficient: hasDemandHistory,
        evidence: {
          currentStock: 0,
          reorderThreshold: threshold,
          leadTimeDays: leadTime,
          avgDailyDemand: hasDemandHistory ? avgDailyDemand : null,
          runoutDays: 0,
          leadTimeDemand: reorderResult.leadTimeDemand,
          suggestedQuantity: suggestedUnits,
          unitCost: cost,
          estimatedTotalCost: estimatedCost,
          supplier,
        },
        explanation: {
          ruleTriggered: 'REC-01_ZERO_STOCK_STOCKOUT',
          factors: [
            { metric: 'stockQuantity', value: 0, threshold: 0, description: 'On-hand physical stock is completely depleted.' },
            {
              metric: 'suggestedReorderQuantity',
              value: suggestedUnits,
              threshold: threshold,
              description: hasDemandHistory
                ? `Covers target stock (${threshold} threshold + ${reorderResult.leadTimeDemand} lead-time demand).`
                : 'Calculated using standard catalog safety buffer (2x reorder threshold).',
            },
          ],
        },
        status: 'pending',
      });
    }
    // RULE REC-02: Imminent Stockout within Lead Time (stock <= threshold and runout <= leadTime)
    else if (stock <= threshold && hasDemandHistory && runoutDays !== null && runoutDays <= leadTime) {
      candidates.push({
        dedupKey: `REC-02_${prodIdStr}`,
        ruleId: 'REC-02',
        type: 'reorder_urgency',
        category: 'Restock Urgency',
        priority: 'critical',
        productId: prod._id,
        targetProduct: { id: prod._id, name: prod.name, sku: prod.sku, category: prod.category },
        title: `Imminent Stockout: ${prod.name} will run out in ${runoutDays} days (Lead time: ${leadTime} days)`,
        actionProposed: `Place urgent order for ${suggestedUnits} ${prod.unit || 'pcs'} immediately to avoid stockout before delivery.`,
        reason: `Estimated runout of ${runoutDays} days is shorter than supplier replenishment lead time of ${leadTime} days.`,
        isDataSufficient: true,
        evidence: {
          currentStock: stock,
          reorderThreshold: threshold,
          leadTimeDays: leadTime,
          avgDailyDemand,
          runoutDays,
          leadTimeDemand: reorderResult.leadTimeDemand,
          suggestedQuantity: suggestedUnits,
          unitCost: cost,
          estimatedTotalCost: estimatedCost,
          supplier,
        },
        explanation: {
          ruleTriggered: 'REC-02_RUNOUT_LESS_THAN_LEAD_TIME',
          factors: [
            { metric: 'runoutDays', value: runoutDays, threshold: leadTime, description: 'Inventory runout is less than or equal to supplier delivery time.' },
            { metric: 'currentStock', value: stock, threshold, description: 'Stock is at or below the reorder threshold.' },
          ],
        },
        status: 'pending',
      });
    }
    // RULE REC-03: Low Stock Replenishment (stock <= threshold, runout > leadTime or demand history insufficient)
    else if (stock <= threshold) {
      candidates.push({
        dedupKey: `REC-03_${prodIdStr}`,
        ruleId: 'REC-03',
        type: 'reorder_urgency',
        category: 'Restock Urgency',
        priority: 'high',
        productId: prod._id,
        targetProduct: { id: prod._id, name: prod.name, sku: prod.sku, category: prod.category },
        title: `Low Stock Alert: ${prod.name} is at or below safety threshold`,
        actionProposed: `Create Purchase Order Draft for ${suggestedUnits} ${prod.unit || 'pcs'} to restore safety inventory.`,
        reason: hasDemandHistory
          ? `Current stock (${stock} units) is below reorder point (${threshold} units). Estimated runout is ${runoutDays} days.`
          : `Current stock (${stock} units) is below reorder point (${threshold} units). Restock quantity based on catalog threshold buffer.`,
        isDataSufficient: hasDemandHistory,
        evidence: {
          currentStock: stock,
          reorderThreshold: threshold,
          leadTimeDays: leadTime,
          avgDailyDemand: hasDemandHistory ? avgDailyDemand : null,
          runoutDays: hasDemandHistory ? runoutDays : null,
          leadTimeDemand: reorderResult.leadTimeDemand,
          suggestedQuantity: suggestedUnits,
          unitCost: cost,
          estimatedTotalCost: estimatedCost,
          supplier,
        },
        explanation: {
          ruleTriggered: 'REC-03_BELOW_REORDER_THRESHOLD',
          factors: [
            { metric: 'stockQuantity', value: stock, threshold, description: 'Current stock is at or below the reorder threshold.' },
            { metric: 'deficit', value: threshold - stock, threshold: 0, description: 'Units below safety threshold.' },
          ],
        },
        status: 'pending',
      });
    }
    // RULE REC-04: High Demand Stockout Risk (stock > threshold, but runout <= 1.5 * leadTime)
    else if (
      stock > threshold &&
      hasDemandHistory &&
      avgDailyDemand > 0 &&
      runoutDays !== null &&
      runoutDays <= leadTime * 1.5
    ) {
      candidates.push({
        dedupKey: `REC-04_${prodIdStr}`,
        ruleId: 'REC-04',
        type: 'high_demand_stockout_risk',
        category: 'Restock Urgency',
        priority: 'high',
        productId: prod._id,
        targetProduct: { id: prod._id, name: prod.name, sku: prod.sku, category: prod.category },
        title: `Impending Stockout Risk: Strong demand on ${prod.name} approaching reorder point in ${runoutDays} days`,
        actionProposed: `Schedule advance purchase order for ${suggestedUnits} ${prod.unit || 'pcs'} with supplier '${supplier}'.`,
        reason: `Current sales burn rate of ${avgDailyDemand} units/day will deplete stock past the safety buffer within ${runoutDays} days.`,
        isDataSufficient: true,
        evidence: {
          currentStock: stock,
          reorderThreshold: threshold,
          leadTimeDays: leadTime,
          avgDailyDemand,
          runoutDays,
          leadTimeDemand: reorderResult.leadTimeDemand,
          suggestedQuantity: suggestedUnits,
          unitCost: cost,
          estimatedTotalCost: estimatedCost,
          supplier,
        },
        explanation: {
          ruleTriggered: 'REC-04_HIGH_DEMAND_STOCKOUT_RISK',
          factors: [
            { metric: 'runoutDays', value: runoutDays, threshold: leadTime * 1.5, description: 'Runout will occur within 1.5x supplier lead time.' },
            { metric: 'avgDailyDemand', value: avgDailyDemand, threshold: 0, description: 'Strong active daily unit burn rate.' },
          ],
        },
        status: 'pending',
      });
    }

    // 1C. Evaluate Declining Sales (REC-06)
    const declineResult = evaluateProductDecliningSales({
      productSales: allProdSales,
      distinctStoreTradingDays,
      referenceDate: new Date(),
    });

    if (declineResult && declineResult.isDeclining) {
      candidates.push({
        dedupKey: `REC-06_${prodIdStr}`,
        ruleId: 'REC-06',
        type: 'declining_sales_alert',
        category: 'Demand Trends',
        priority: 'medium',
        productId: prod._id,
        targetProduct: { id: prod._id, name: prod.name, sku: prod.sku, category: prod.category },
        title: `Sales Velocity Drop: ${prod.name} demand fell by -${declineResult.declinePct}%`,
        actionProposed: `Review shelf visibility, merchandising, and pricing competitiveness for ${prod.name}.`,
        reason: `Sales volume dropped from ${declineResult.unitsP1} units in the prior 7 days to ${declineResult.unitsP2} units in the recent 7 days (-${declineResult.declinePct}%).`,
        isDataSufficient: true,
        evidence: {
          previousUnits: declineResult.unitsP1,
          recentUnits: declineResult.unitsP2,
          declinePercentage: declineResult.declinePct,
          previousRevenue: declineResult.revenueP1,
          recentRevenue: declineResult.revenueP2,
          currentStock: stock,
        },
        explanation: {
          ruleTriggered: 'REC-06_SPLIT_WINDOW_SALES_DECLINE',
          factors: [
            { metric: 'declinePercentage', value: declineResult.declinePct, threshold: 40, description: 'Unit sales dropped by >= 40% between consecutive 7-day windows.' },
            { metric: 'baselineUnits', value: declineResult.unitsP1, threshold: 5, description: 'Baseline sales in prior period established valid demand.' },
          ],
        },
        status: 'pending',
      });
    }

    // 1D. Evaluate Slow-Moving & Overstock (REC-05)
    // Calculate units sold in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const unitsSold30d = allProdSales
      .filter((s) => new Date(s.date) >= thirtyDaysAgo)
      .reduce((sum, s) => sum + (Number(s.quantitySold) || 0), 0);

    const slowMoveResult = evaluateProductSlowMovingStock({
      product: prod,
      unitsSoldLast30Days: unitsSold30d,
      runoutDays,
      hasSufficientData: hasDemandHistory,
    });

    if (slowMoveResult && slowMoveResult.isSlowMoving) {
      candidates.push({
        dedupKey: `REC-05_${prodIdStr}`,
        ruleId: 'REC-05',
        type: 'slow_moving_overstock',
        category: 'Inventory Optimization',
        priority: slowMoveResult.priority,
        productId: prod._id,
        targetProduct: { id: prod._id, name: prod.name, sku: prod.sku, category: prod.category },
        title: `Slow-Moving Stock: ${prod.name} has $${slowMoveResult.capitalAtRisk.toFixed(2)} tied up in excess inventory`,
        actionProposed: `Consider a 10%–15% promotional clearance or product bundle to release capital. Pause future supplier orders until stock normalizes.`,
        reason: slowMoveResult.isDeadStock
          ? `Product has ${stock} units on hand with zero sales recorded since catalog entry (>14 days). $${slowMoveResult.capitalAtRisk.toFixed(2)} in capital is immobilized.`
          : `Current inventory of ${stock} units exceeds safety threshold (${threshold} units) by 2x. Only ${unitsSold30d} unit(s) sold in the past 30 days.`,
        isDataSufficient: true,
        evidence: {
          currentStock: stock,
          reorderThreshold: threshold,
          excessUnits: slowMoveResult.excessUnits,
          capitalAtRisk: slowMoveResult.capitalAtRisk,
          unitsSoldLast30Days: unitsSold30d,
          runoutDays: slowMoveResult.runoutDays,
          unitCost: cost,
          isDeadStock: slowMoveResult.isDeadStock,
        },
        explanation: {
          ruleTriggered: slowMoveResult.isDeadStock ? 'REC-05_DEAD_STOCK_ZERO_SALES' : 'REC-05_EXCESS_INVENTORY_SLOW_TURNOVER',
          factors: [
            { metric: 'capitalAtRisk', value: slowMoveResult.capitalAtRisk, threshold: 50, description: 'Capital tied up in excess inventory exceeds $50 threshold.' },
            { metric: 'stockQuantity', value: stock, threshold: threshold * 2, description: 'Stock quantity is more than double the reorder threshold.' },
          ],
        },
        status: 'pending',
      });
    }
  }

  // 2. Evaluate Anomaly Action Rules (REC-07)
  if (dailyAnomalyResult && Array.isArray(dailyAnomalyResult.anomalies)) {
    const sevenDaysAgoStr = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    for (const anom of dailyAnomalyResult.anomalies) {
      if (
        anom.anomalyType === 'sales_drop' &&
        anom.severity === 'High' &&
        anom.date >= sevenDaysAgoStr
      ) {
        candidates.push({
          dedupKey: `REC-07_${anom.date}`,
          ruleId: 'REC-07',
          type: 'anomaly_investigation',
          category: 'Store Operations',
          priority: 'high',
          productId: null,
          title: `Operational Audit: Extreme revenue drop recorded on ${anom.date}`,
          actionProposed: `Audit store register logs, operating hours, and out-of-stock events on ${anom.date} to diagnose root cause.`,
          reason: anom.explanation || `Sales on ${anom.date} plunged by >= 80% below the trailing 7-day median baseline ($${anom.trailingMedian?.toFixed(2)}).`,
          isDataSufficient: true,
          evidence: {
            anomalyDate: anom.date,
            actualRevenue: anom.revenue,
            trailingMedian: anom.trailingMedian,
            lowerThreshold: anom.lowerThreshold,
            severity: anom.severity,
          },
          explanation: {
            ruleTriggered: 'REC-07_HIGH_SEVERITY_SALES_DROP',
            factors: [
              { metric: 'revenue', value: anom.revenue, threshold: anom.lowerThreshold || 0, description: 'Daily revenue dropped severely below normal corridor.' },
              { metric: 'trailingMedian', value: anom.trailingMedian || 0, threshold: 20, description: 'Baseline trading volume before drop.' },
            ],
          },
          status: 'pending',
        });
      }
    }
  }

  return candidates;
};

/**
 * Resolve Conflicts & Apply Mutual Exclusion Rules:
 * - A product with a restock recommendation (REC-01, REC-02, REC-03, REC-04) cannot have an overstock recommendation (REC-05).
 * - A product with an Out of Stock recommendation (REC-01) suppresses sales decline alerts (REC-06).
 * - Priority ranking: critical (0) > high (1) > medium (2) > low (3).
 *
 * @param {Array<object>} candidates
 * @returns {Array<object>} Clean, conflict-free recommendations
 */
export const resolveRecommendationConflicts = (candidates = []) => {
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };

  // Track products with restock or stockout alerts
  const restockProductIds = new Set();
  const outOfStockProductIds = new Set();

  for (const c of candidates) {
    if (c.productId) {
      const pid = String(c.productId);
      if (['reorder_urgency', 'high_demand_stockout_risk'].includes(c.type)) {
        restockProductIds.add(pid);
      }
      if (c.ruleId === 'REC-01') {
        outOfStockProductIds.add(pid);
      }
    }
  }

  const filtered = [];
  const seenDedupKeys = new Set();

  for (const c of candidates) {
    if (seenDedupKeys.has(c.dedupKey)) continue;

    const pid = c.productId ? String(c.productId) : null;

    // Rule 1: Mutual exclusion between Restock and Overstock
    if (pid && c.type === 'slow_moving_overstock' && restockProductIds.has(pid)) {
      continue; // Suppress overstock recommendation for item that needs restock
    }

    // Rule 2: Out of Stock takes absolute precedence over Declining Sales
    if (pid && c.type === 'declining_sales_alert' && outOfStockProductIds.has(pid)) {
      continue; // Suppress sales decline for items that are completely out of stock
    }

    seenDedupKeys.add(c.dedupKey);
    filtered.push(c);
  }

  // Sort deterministically:
  // 1. Priority (critical first)
  // 2. Type order
  // 3. Estimated cost / capital at risk (largest impact first)
  filtered.sort((a, b) => {
    const pDiff = (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3);
    if (pDiff !== 0) return pDiff;

    const costA = a.evidence?.estimatedTotalCost || a.evidence?.capitalAtRisk || 0;
    const costB = b.evidence?.estimatedTotalCost || b.evidence?.capitalAtRisk || 0;
    return costB - costA;
  });

  return filtered;
};
