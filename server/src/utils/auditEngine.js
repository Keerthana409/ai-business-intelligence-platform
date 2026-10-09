/**
 * Native JavaScript Mathematical & Statistical Decision Audit Engine
 * AI-Powered Business Intelligence & Decision Intelligence Platform - Module 8
 *
 * Implements:
 * - Pure, deterministic paired-window baseline and post-implementation aggregation
 * - Non-overlapping calendar date boundaries strictly excluding implementation day t_impl
 * - Strict financial metric separation:
 *     1. Capital / Inventory Cost Value Sold (COGS)
 *     2. Total Revenue
 *     3. Gross Profit
 *     4. Incremental Net Financial Benefit (Delta Gross Profit)
 *     5. Defensible ROI (%) strictly requiring positive investment outlay
 * - Transparent handling of missing trading days and minimum data sufficiency gates
 * - Simulation-versus-actual calibration variance comparison
 * - Non-causal observational reporting
 *
 * Zero external LLMs or APIs. Pure native JavaScript.
 */

/**
 * Format Date to YYYY-MM-DD (ISO UTC string format)
 */
export const formatDateKey = (date) => {
  if (!date) return '';
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

/**
 * Add days to a YYYY-MM-DD string or Date object using UTC calendar math
 */
export const addDays = (dateInput, days) => {
  const key = formatDateKey(dateInput);
  if (!key) return '';
  const [year, month, day] = key.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
};

/**
 * Round number to exactly 2 decimal places (standard currency cents precision)
 */
export const roundCurrency = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  return Number((Math.round(Number(value) * 100) / 100).toFixed(2));
};

/**
 * Safe percentage change calculation.
 * Returns null if baseline is 0 or invalid to avoid division by zero.
 */
export const calculatePercentageChange = (baseline, simulated) => {
  if (
    baseline === null ||
    baseline === undefined ||
    isNaN(baseline) ||
    simulated === null ||
    simulated === undefined ||
    isNaN(simulated)
  ) {
    return null;
  }
  const b = Number(baseline);
  const s = Number(simulated);
  if (b === 0) return null;
  const pct = ((s - b) / Math.abs(b)) * 100;
  return Number((Math.round(pct * 10) / 10).toFixed(1));
};

/**
 * Calculate observation window date boundaries.
 * Pre-window:  [t_impl - k, t_impl - 1] (strictly ends day before implementation)
 * Impl-date:   t_impl (strictly excluded from both windows to prevent intra-day distortion)
 * Post-window: [t_impl + 1, t_impl + k] (strictly starts day after implementation)
 *
 * @param {Date|string} implementedAt
 * @param {number} windowDays - typically 7, 14, or 30
 * @returns {{ preStart: string, preEnd: string, implDate: string, postStart: string, postEnd: string, windowDays: number }}
 */
export const calculateWindowDates = (implementedAt, windowDays = 14) => {
  const k = parseInt(windowDays, 10) || 14;
  const implDate = formatDateKey(implementedAt);
  if (!implDate) {
    throw new Error('Valid implementation date is required to compute observation windows');
  }

  const preEnd = addDays(implDate, -1);
  const preStart = addDays(implDate, -k);
  const postStart = addDays(implDate, 1);
  const postEnd = addDays(implDate, k);

  return {
    preStart,
    preEnd,
    implDate,
    postStart,
    postEnd,
    windowDays: k,
  };
};

/**
 * Check whether an observation window has fully matured as of evaluation date.
 *
 * @param {Date|string} implementedAt
 * @param {number} windowDays
 * @param {Date|string} currentDate
 * @returns {{ isMatured: boolean, daysElapsed: number, daysRemaining: number, postEnd: string }}
 */
export const checkWindowMaturation = (implementedAt, windowDays = 14, currentDate = new Date()) => {
  const { postStart, postEnd, windowDays: k } = calculateWindowDates(implementedAt, windowDays);
  const currKey = formatDateKey(currentDate);

  if (!currKey) {
    return { isMatured: false, daysElapsed: 0, daysRemaining: k, postEnd };
  }

  if (currKey < postStart) {
    return { isMatured: false, daysElapsed: 0, daysRemaining: k, postEnd };
  }

  // Days elapsed in post-period
  const dStart = new Date(`${postStart}T00:00:00.000Z`);
  const dCurr = new Date(`${currKey}T00:00:00.000Z`);
  const diffDays = Math.max(0, Math.floor((dCurr - dStart) / (1000 * 60 * 60 * 24)) + 1);

  const daysElapsed = Math.min(k, diffDays);
  const isMatured = currKey >= postEnd;
  const daysRemaining = isMatured ? 0 : Math.max(0, k - daysElapsed);

  return {
    isMatured,
    daysElapsed,
    daysRemaining,
    postEnd,
  };
};

/**
 * Aggregate sales transactions over a specific calendar date window.
 *
 * @param {Array<Object>} salesRecords - [{ date, quantitySold, unitPrice, totalRevenue, productId, costPrice }]
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {number|null} unitCostPrice - Wholesale cost of product (if available)
 * @returns {Object} aggregated metrics
 */
export const aggregateWindowSales = (salesRecords = [], startDate, endDate, unitCostPrice = null) => {
  if (!startDate || !endDate) {
    return {
      distinctTradingDays: 0,
      totalUnitsSold: 0,
      totalRevenue: 0,
      totalCOGS: 0,
      grossProfit: null,
      averageDailyDemand: 0,
      hasSufficientData: false,
      dailyBreakdown: [],
    };
  }

  const sKey = formatDateKey(startDate);
  const eKey = formatDateKey(endDate);

  const dateMap = new Map();
  let totalUnits = 0;
  let totalRev = 0;

  for (const sale of salesRecords) {
    const saleKey = formatDateKey(sale.date);
    if (!saleKey || saleKey < sKey || saleKey > eKey) continue;

    const qty = Number(sale.quantitySold) || 0;
    const rev = Number(sale.totalRevenue !== undefined ? sale.totalRevenue : qty * (sale.unitPrice || 0));

    totalUnits += qty;
    totalRev += rev;

    const existing = dateMap.get(saleKey) || { date: saleKey, unitsSold: 0, revenue: 0 };
    existing.unitsSold += qty;
    existing.revenue = roundCurrency(existing.revenue + rev);
    dateMap.set(saleKey, existing);
  }

  const distinctTradingDays = dateMap.size;
  const dailyBreakdown = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Determine if wholesale cost is available
  const hasValidCost = unitCostPrice !== null && unitCostPrice !== undefined && !isNaN(unitCostPrice) && unitCostPrice >= 0;
  const totalCOGS = hasValidCost ? roundCurrency(totalUnits * Number(unitCostPrice)) : 0;
  const grossProfit = hasValidCost ? roundCurrency(totalRev - totalCOGS) : null;

  // Average daily demand: calculated across active trading days
  const averageDailyDemand = distinctTradingDays > 0 ? Number((totalUnits / distinctTradingDays).toFixed(2)) : 0;

  // Minimum data sufficiency gate: requires at least 3 distinct recorded trading days in window
  const hasSufficientData = distinctTradingDays >= 3;

  return {
    startDate: sKey,
    endDate: eKey,
    distinctTradingDays,
    totalUnitsSold: totalUnits,
    totalRevenue: roundCurrency(totalRev),
    totalCOGS,
    grossProfit,
    averageDailyDemand,
    hasSufficientData,
    dailyBreakdown,
  };
};

/**
 * Calculate incremental net financial benefit between pre-decision and post-decision windows.
 *
 * Incremental Net Benefit = Post Gross Profit - Pre Gross Profit
 * If wholesale cost is not available, falls back to Delta Revenue with clear disclosure.
 *
 * @param {Object} preMetrics
 * @param {Object} postMetrics
 * @returns {{ deltaRevenue: number, deltaUnits: number, deltaGrossProfit: number|null, incrementalNetBenefit: number|null, hasSufficientData: boolean }}
 */
export const calculateIncrementalBenefit = (preMetrics, postMetrics) => {
  if (!preMetrics || !postMetrics) {
    return {
      deltaRevenue: 0,
      deltaUnits: 0,
      deltaGrossProfit: null,
      incrementalNetBenefit: null,
      hasSufficientData: false,
    };
  }

  const deltaRevenue = roundCurrency(postMetrics.totalRevenue - preMetrics.totalRevenue);
  const deltaUnits = postMetrics.totalUnitsSold - preMetrics.totalUnitsSold;

  const hasCostData = preMetrics.grossProfit !== null && postMetrics.grossProfit !== null;
  const deltaGrossProfit = hasCostData ? roundCurrency(postMetrics.grossProfit - preMetrics.grossProfit) : null;

  const hasSufficientData = Boolean(preMetrics.hasSufficientData && postMetrics.hasSufficientData);
  const incrementalNetBenefit = hasCostData && hasSufficientData ? deltaGrossProfit : null;

  return {
    deltaRevenue,
    deltaUnits,
    deltaGrossProfit,
    incrementalNetBenefit,
    hasSufficientData,
  };
};

/**
 * Defensible ROI Calculation:
 *
 * ROI (%) = (Incremental Net Financial Benefit / Investment Cost) * 100
 *
 * Gating Rules:
 * 1. Investment cost must be strictly positive (> 0).
 * 2. Incremental net benefit must be defensibly measurable (both pre and post windows have sufficient data and valid unit costs).
 * 3. When investment cost <= 0 (e.g. price optimization with 0 incremental purchase capital), returns null with explicit explanation.
 * 4. When data is insufficient, returns null with explicit explanation.
 *
 * @param {number|null} incrementalNetBenefit - Delta gross profit (post - pre)
 * @param {number|null} investmentCost - Capital outlay (e.g. orderQuantity * costPrice)
 * @returns {{ roi: number|null, isApplicable: boolean, explanation: string }}
 */
export const calculateDefensibleROI = (incrementalNetBenefit, investmentCost) => {
  const inv = Number(investmentCost);

  if (isNaN(inv) || inv <= 0) {
    return {
      roi: null,
      isApplicable: false,
      explanation: 'N/A: Zero incremental capital investment. Decision evaluated via Δ Gross Profit and Δ Revenue.',
    };
  }

  if (incrementalNetBenefit === null || incrementalNetBenefit === undefined || isNaN(incrementalNetBenefit)) {
    return {
      roi: null,
      isApplicable: false,
      explanation: 'N/A: Insufficient baseline or post-period sales observations to defensibly measure incremental net return.',
    };
  }

  const roi = roundCurrency((Number(incrementalNetBenefit) / inv) * 100);
  return {
    roi,
    isApplicable: true,
    explanation: `ROI = (${incrementalNetBenefit} / ${inv}) * 100 = ${roi}% over the observation window.`,
  };
};

/**
 * Evaluate inventory restock decision outcome.
 *
 * Distinguishes:
 * - Averted Stockout: stock was replenished and remained above 0 while active demand was met.
 * - Outlay: Q * costPrice.
 * - Capital Value of Units Sold: COGS of sold units.
 * - Incremental Benefit: Post Gross Profit - Pre Gross Profit.
 * - ROI: Defensible calculation based on outlay.
 *
 * @param {Object} params
 * @returns {Object} evaluation outcome
 */
export const evaluateRestockOutcome = ({
  preMetrics,
  postMetrics,
  quantityOrdered = 0,
  costPrice = 0,
  minStockObserved = null,
  currentStock = 0,
  isMatured = false,
}) => {
  const investmentCost = roundCurrency(quantityOrdered * costPrice);
  const { deltaRevenue, deltaUnits, deltaGrossProfit, incrementalNetBenefit, hasSufficientData } =
    calculateIncrementalBenefit(preMetrics, postMetrics);

  const roiResult = calculateDefensibleROI(incrementalNetBenefit, investmentCost);

  // Stockout evaluation:
  // If minStockObserved was > 0 and post units were sold, stockout was successfully averted.
  // If stock reached 0 during observation, stockout was not fully averted.
  let stockoutAverted = null;
  if (minStockObserved !== null) {
    stockoutAverted = minStockObserved > 0 && postMetrics.totalUnitsSold > 0;
  } else {
    stockoutAverted = currentStock > 0 && postMetrics.totalUnitsSold > 0;
  }

  let status = 'in_observation';
  let outcomeRating = 'pending';
  let headline = 'Observation window in progress';

  if (!isMatured) {
    status = 'in_observation';
    outcomeRating = 'pending';
    headline = 'Restock observation window currently active; metrics maturing.';
  } else if (!hasSufficientData) {
    status = 'insufficient_data';
    outcomeRating = 'inconclusive';
    headline = 'Insufficient historical sales observations in evaluation window to finalize rating.';
  } else {
    status = 'evaluated_matured';
    if (stockoutAverted && (incrementalNetBenefit === null || incrementalNetBenefit >= 0)) {
      outcomeRating = 'favorable';
      headline = 'Stockout successfully averted while maintaining positive product demand.';
    } else if (!stockoutAverted && deltaUnits <= 0) {
      outcomeRating = 'unfavorable';
      headline = 'Product experienced stockout gap during window despite restock order.';
    } else {
      outcomeRating = 'neutral';
      headline = 'Restock completed with balanced demand patterns.';
    }
  }

  return {
    status,
    outcomeRating,
    headline,
    stockoutAverted,
    deadCapitalRecovered: null, // Not applicable for restock
    investmentCost,
    capitalValueSold: postMetrics.totalCOGS,
    deltaRevenue,
    deltaUnits,
    deltaGrossProfit,
    incrementalNetBenefit,
    roiPercent: roiResult.roi,
    roiExplanation: roiResult.explanation,
    hasSufficientData,
  };
};

/**
 * Evaluate overstock clearance / markdown decision outcome.
 *
 * CRITICAL ACCOUNTING DISTINCTION:
 * - Trapped Capital Recovered/Liquidated = Units Sold * Cost Price
 * - This represents cash unlocked from dead inventory, NOT net profit!
 * - Investment Cost = $0 (sunken capital; no new cash expended).
 * - ROI = null (not applicable for clearance liquidations).
 *
 * @param {Object} params
 * @returns {Object} evaluation outcome
 */
export const evaluateClearanceOutcome = ({
  preMetrics,
  postMetrics,
  costPrice = 0,
  isMatured = false,
}) => {
  const { deltaRevenue, deltaUnits, deltaGrossProfit, incrementalNetBenefit, hasSufficientData } =
    calculateIncrementalBenefit(preMetrics, postMetrics);

  const capitalRecovered = roundCurrency(postMetrics.totalUnitsSold * costPrice);

  let status = 'in_observation';
  let outcomeRating = 'pending';
  let headline = 'Clearance markdown observation window active.';

  if (!isMatured) {
    status = 'in_observation';
    outcomeRating = 'pending';
    headline = 'Clearance markdown tracking in progress; metrics maturing.';
  } else if (!hasSufficientData && postMetrics.totalUnitsSold === 0) {
    status = 'insufficient_data';
    outcomeRating = 'inconclusive';
    headline = 'Zero or insufficient transactions recorded during clearance period.';
  } else {
    status = 'evaluated_matured';
    if (capitalRecovered > 0 && deltaUnits > 0) {
      outcomeRating = 'favorable';
      headline = `Successfully liquidated ${postMetrics.totalUnitsSold} units, unlocking $${capitalRecovered.toFixed(2)} in trapped working capital.`;
    } else if (postMetrics.totalUnitsSold === 0) {
      outcomeRating = 'unfavorable';
      headline = 'Clearance markdown produced zero units sold; inventory remains stagnant.';
    } else {
      outcomeRating = 'neutral';
      headline = `Moderate clearance movement: $${capitalRecovered.toFixed(2)} recovered.`;
    }
  }

  return {
    status,
    outcomeRating,
    headline,
    stockoutAverted: null,
    deadCapitalRecovered: capitalRecovered,
    investmentCost: 0,
    capitalValueSold: postMetrics.totalCOGS,
    deltaRevenue,
    deltaUnits,
    deltaGrossProfit,
    incrementalNetBenefit,
    roiPercent: null,
    roiExplanation: 'N/A: Sunken working capital liquidation. Success measured by Trapped Capital Recovered ($) rather than new capital ROI.',
    hasSufficientData,
  };
};

/**
 * Evaluate general price optimization or promotional discount outcome.
 *
 * @param {Object} params
 * @returns {Object} evaluation outcome
 */
export const evaluatePriceOptimizationOutcome = ({
  preMetrics,
  postMetrics,
  isMatured = false,
}) => {
  const { deltaRevenue, deltaUnits, deltaGrossProfit, incrementalNetBenefit, hasSufficientData } =
    calculateIncrementalBenefit(preMetrics, postMetrics);

  let status = 'in_observation';
  let outcomeRating = 'pending';
  let headline = 'Price adjustment observation window active.';

  if (!isMatured) {
    status = 'in_observation';
    outcomeRating = 'pending';
    headline = 'Price adjustment tracking in progress; metrics maturing.';
  } else if (!hasSufficientData) {
    status = 'insufficient_data';
    outcomeRating = 'inconclusive';
    headline = 'Insufficient trading days observed to establish statistical price elasticity impact.';
  } else {
    status = 'evaluated_matured';
    if (deltaGrossProfit !== null && deltaGrossProfit > 0) {
      outcomeRating = 'favorable';
      headline = `Gross profit increased by $${deltaGrossProfit.toFixed(2)} following price modification.`;
    } else if (deltaGrossProfit !== null && deltaGrossProfit < 0) {
      outcomeRating = 'unfavorable';
      headline = `Gross profit declined by $${Math.abs(deltaGrossProfit).toFixed(2)} post-adjustment.`;
    } else {
      outcomeRating = 'neutral';
      headline = 'Financial metrics remained stable within normal volatility bounds.';
    }
  }

  return {
    status,
    outcomeRating,
    headline,
    stockoutAverted: null,
    deadCapitalRecovered: null,
    investmentCost: 0,
    capitalValueSold: postMetrics.totalCOGS,
    deltaRevenue,
    deltaUnits,
    deltaGrossProfit,
    incrementalNetBenefit,
    roiPercent: null,
    roiExplanation: 'N/A: Zero incremental capital investment. Evaluated via Δ Gross Profit and Δ Revenue.',
    hasSufficientData,
  };
};

/**
 * Compare Module 7 Simulated projections versus Actual post-decision reality.
 * Only compares when definitions and observation windows are compatible.
 *
 * @param {Object} simulatedResults - snapshot from Scenario.js
 * @param {Object} postMetrics - actual observed post-implementation metrics
 * @param {number} scenarioHorizon - scenario projection horizon in days
 * @param {number} observationDays - actual observation window in days
 * @returns {Object} simulation comparison metrics
 */
export const evaluateSimulationCalibration = (
  simulatedResults = {},
  postMetrics = {},
  scenarioHorizon = 14,
  observationDays = 14
) => {
  if (!simulatedResults || !postMetrics) {
    return {
      isLinked: false,
      isCompatible: false,
      calibrationAssessment: 'not_applicable',
      explanation: 'Simulation data not linked or incomplete.',
    };
  }

  // Verify horizon compatibility (allow direct comparison when horizons match or within reasonable range)
  const isCompatible = Math.abs(scenarioHorizon - observationDays) <= 3;

  const projectedRevenue = roundCurrency(simulatedResults.simulatedRevenue || 0);
  const actualRevenue = roundCurrency(postMetrics.totalRevenue || 0);
  const revenueVariance = roundCurrency(actualRevenue - projectedRevenue);
  const revenueVariancePercent = calculatePercentageChange(projectedRevenue, actualRevenue);

  const projectedProfit = simulatedResults.simulatedGrossProfit !== undefined ? roundCurrency(simulatedResults.simulatedGrossProfit) : null;
  const actualProfit = postMetrics.grossProfit !== null && postMetrics.grossProfit !== undefined ? roundCurrency(postMetrics.grossProfit) : null;
  const profitVariance = projectedProfit !== null && actualProfit !== null ? roundCurrency(actualProfit - projectedProfit) : null;

  const projectedUnits = Number(simulatedResults.simulatedQuantity || 0);
  const actualUnits = Number(postMetrics.totalUnitsSold || 0);
  const unitsVariance = actualUnits - projectedUnits;

  let calibrationAssessment = 'not_applicable';
  if (isCompatible && projectedRevenue > 0) {
    if (Math.abs(revenueVariancePercent || 0) <= 15) {
      calibrationAssessment = 'aligned';
    } else if ((revenueVariancePercent || 0) > 15) {
      calibrationAssessment = 'overperformed';
    } else {
      calibrationAssessment = 'underperformed';
    }
  }

  return {
    isLinked: true,
    isCompatible,
    projectedRevenue,
    actualRevenue,
    revenueVariance,
    revenueVariancePercent,
    projectedProfit,
    actualProfit,
    profitVariance,
    projectedUnits,
    actualUnits,
    unitsVariance,
    calibrationAssessment,
    explanation: isCompatible
      ? `Simulated $${projectedRevenue.toFixed(2)} vs Observed Actual $${actualRevenue.toFixed(2)} (${revenueVariancePercent !== null && revenueVariancePercent >= 0 ? '+' : ''}${revenueVariancePercent}% variance).`
      : `Horizon mismatch: Scenario modeled ${scenarioHorizon} days while audit tracked ${observationDays} days.`,
  };
};
