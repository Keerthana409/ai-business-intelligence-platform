/**
 * Native JavaScript What-If Scenario Simulation Engine
 * AI-Powered Business Intelligence & Decision Intelligence Platform
 *
 * Implements:
 * - Deterministic, non-destructive what-if simulation calculations
 * - Price change simulation (constant-demand and assumption-based demand modes)
 * - Demand change simulation with integer quantity bounds
 * - Chronological inventory reorder simulation with lead-time demand depletion
 * - Promotional discount simulation with unit contribution margin & profit-matching volume
 * - Decimal rounding policy for monetary values (2 decimals, cents precision)
 * - Safe null-handling for undefined percentage deltas (zero-baseline protection)
 *
 * Strictly traditional mathematics & deterministic business rules.
 * Zero LLMs, generative APIs, or synthetic data.
 */

/**
 * Format monetary amount to standard currency precision (2 decimal places, cents).
 * Never rounds to whole dollar integers.
 *
 * @param {number} val
 * @returns {number}
 */
export const roundCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return 0;
  return Number((Math.round((Number(val) + Number.EPSILON) * 100) / 100).toFixed(2));
};

/**
 * Round sales or inventory item quantities to non-negative whole units.
 *
 * @param {number} val
 * @returns {number}
 */
export const roundQuantity = (val) => {
  if (val === null || val === undefined || isNaN(val)) return 0;
  return Math.max(0, Math.round(Number(val)));
};

/**
 * Calculate percentage difference between baseline and simulated values.
 * Returns null if baseline is zero, non-finite, or mathematically undefined.
 *
 * @param {number|null} baseline
 * @param {number|null} simulated
 * @returns {number|null}
 */
export const calculatePercentageChange = (baseline, simulated) => {
  if (
    baseline === null ||
    baseline === undefined ||
    simulated === null ||
    simulated === undefined ||
    isNaN(baseline) ||
    isNaN(simulated) ||
    baseline === 0
  ) {
    return null;
  }
  const diff = Number(simulated) - Number(baseline);
  const pct = (diff / Math.abs(Number(baseline))) * 100;
  return Number(pct.toFixed(1));
};

/**
 * Validate that product cost price is a valid, non-negative finite number.
 *
 * @param {any} cost
 * @returns {boolean}
 */
export const isValidCost = (cost) => {
  return cost !== null && cost !== undefined && !isNaN(cost) && isFinite(cost) && Number(cost) >= 0;
};

/**
 * A. Simulate Price Change
 *
 * @param {object} params
 * @param {object} params.product - Product document { sellingPrice, costPrice, name, sku }
 * @param {number} [params.proposedPrice] - Proposed unit selling price
 * @param {number} [params.priceChangePercent] - Percentage price change if proposedPrice not directly given
 * @param {'constant'|'assumption'} [params.demandMode='constant'] - Demand response mode
 * @param {number} [params.demandChangePercent=0] - Explicit user-assumed demand shift (%)
 * @param {Array<{ quantitySold: number, totalRevenue?: number }>} [params.historicalSales=[]]
 * @returns {object} Simulation results
 */
export const simulatePriceChange = ({
  product = {},
  proposedPrice,
  priceChangePercent,
  demandMode = 'constant',
  demandChangePercent = 0,
  historicalSales = [],
}) => {
  const baselinePrice = roundCurrency(product.sellingPrice || 0);
  const hasCost = isValidCost(product.costPrice);
  const unitCost = hasCost ? roundCurrency(product.costPrice) : null;

  // Determine proposed selling price
  let simulatedPrice;
  if (proposedPrice !== undefined && proposedPrice !== null && !isNaN(proposedPrice)) {
    simulatedPrice = roundCurrency(proposedPrice);
  } else if (priceChangePercent !== undefined && !isNaN(priceChangePercent)) {
    simulatedPrice = roundCurrency(baselinePrice * (1 + Number(priceChangePercent) / 100));
  } else {
    simulatedPrice = baselinePrice;
  }

  if (simulatedPrice < 0) {
    throw new Error('Proposed selling price cannot be negative.');
  }

  // Aggregate historical baseline sales volume and revenue
  let baselineQuantity = 0;
  let baselineRevenue = 0;
  const hasSalesHistory = Array.isArray(historicalSales) && historicalSales.length > 0;

  if (hasSalesHistory) {
    for (const s of historicalSales) {
      baselineQuantity += Number(s.quantitySold || 0);
      baselineRevenue += Number(s.totalRevenue || (s.quantitySold * baselinePrice));
    }
  }

  baselineQuantity = roundQuantity(baselineQuantity);
  baselineRevenue = roundCurrency(baselineRevenue > 0 ? baselineRevenue : baselineQuantity * baselinePrice);

  const baselineGrossProfit = hasCost
    ? roundCurrency((baselinePrice - unitCost) * baselineQuantity)
    : null;

  // Evaluate simulated demand quantity
  const isAssumption = demandMode === 'assumption';
  const assumedDemandPct = isAssumption ? Number(demandChangePercent || 0) : 0;

  let simulatedQuantity;
  if (isAssumption) {
    simulatedQuantity = roundQuantity(baselineQuantity * (1 + assumedDemandPct / 100));
  } else {
    simulatedQuantity = baselineQuantity;
  }

  const simulatedRevenue = roundCurrency(simulatedPrice * simulatedQuantity);
  const simulatedGrossProfit = hasCost
    ? roundCurrency((simulatedPrice - unitCost) * simulatedQuantity)
    : null;

  // Comparisons & deltas
  const deltaQuantity = simulatedQuantity - baselineQuantity;
  const pctDeltaQuantity = calculatePercentageChange(baselineQuantity, simulatedQuantity);

  const deltaRevenue = roundCurrency(simulatedRevenue - baselineRevenue);
  const pctDeltaRevenue = calculatePercentageChange(baselineRevenue, simulatedRevenue);

  const deltaGrossProfit = hasCost ? roundCurrency(simulatedGrossProfit - baselineGrossProfit) : null;
  const pctDeltaGrossProfit = hasCost ? calculatePercentageChange(baselineGrossProfit, simulatedGrossProfit) : null;

  // Transparent assumptions & limitations
  const assumptions = [
    `Selling price modified from ₹${baselinePrice.toFixed(2)} to ₹${simulatedPrice.toFixed(2)}.`,
    isAssumption
      ? `Hypothetical demand shift of ${assumedDemandPct > 0 ? '+' : ''}${assumedDemandPct.toFixed(1)}% explicitly assumed.`
      : `Constant-demand mode: sales volume assumed invariant (${baselineQuantity} units) regardless of price adjustment.`,
    'Hypothetical scenario projection based on deterministic arithmetic. Real-world consumer demand elasticity may vary.',
  ];

  const limitations = [];
  if (!hasCost) {
    limitations.push('Unit cost price is missing or invalid in product catalog. Gross profit cannot be calculated reliably.');
  }
  if (!hasSalesHistory) {
    limitations.push('No historical sales records found for this product. Baseline quantity is 0 units.');
  }

  return {
    scenarioType: 'price_change',
    product: {
      id: product._id || product.id,
      name: product.name,
      sku: product.sku,
      currentPrice: baselinePrice,
      unitCost,
      hasValidCost: hasCost,
    },
    inputs: {
      proposedPrice: simulatedPrice,
      priceChangePercent: calculatePercentageChange(baselinePrice, simulatedPrice),
      demandMode,
      demandChangePercent: assumedDemandPct,
    },
    baseline: {
      sellingPrice: baselinePrice,
      quantitySold: baselineQuantity,
      revenue: baselineRevenue,
      grossProfit: baselineGrossProfit,
    },
    simulated: {
      sellingPrice: simulatedPrice,
      quantitySold: simulatedQuantity,
      revenue: simulatedRevenue,
      grossProfit: simulatedGrossProfit,
    },
    comparison: {
      quantity: { absolute: deltaQuantity, percentage: pctDeltaQuantity },
      revenue: { absolute: deltaRevenue, percentage: pctDeltaRevenue },
      grossProfit: { absolute: deltaGrossProfit, percentage: pctDeltaGrossProfit },
    },
    assumptions,
    limitations,
  };
};

/**
 * B. Simulate Demand Shift
 *
 * @param {object} params
 * @param {object} params.product
 * @param {number} params.demandChangePercent - Hypothetical demand change (%)
 * @param {Array<{ quantitySold: number, totalRevenue?: number }>} [params.historicalSales=[]]
 * @param {number} [params.simulationPeriodDays=30]
 * @returns {object}
 */
export const simulateDemandChange = ({
  product = {},
  demandChangePercent = 0,
  historicalSales = [],
  simulationPeriodDays = 30,
}) => {
  const sellingPrice = roundCurrency(product.sellingPrice || 0);
  const hasCost = isValidCost(product.costPrice);
  const unitCost = hasCost ? roundCurrency(product.costPrice) : null;

  const demandPct = Number(demandChangePercent);
  if (isNaN(demandPct)) {
    throw new Error('Demand change percentage must be a valid number.');
  }

  let baselineQuantity = 0;
  let baselineRevenue = 0;
  const hasSalesHistory = Array.isArray(historicalSales) && historicalSales.length > 0;

  if (hasSalesHistory) {
    for (const s of historicalSales) {
      baselineQuantity += Number(s.quantitySold || 0);
      baselineRevenue += Number(s.totalRevenue || (s.quantitySold * sellingPrice));
    }
  }

  baselineQuantity = roundQuantity(baselineQuantity);
  baselineRevenue = roundCurrency(baselineRevenue > 0 ? baselineRevenue : baselineQuantity * sellingPrice);

  const baselineGrossProfit = hasCost
    ? roundCurrency((sellingPrice - unitCost) * baselineQuantity)
    : null;

  const simulatedQuantity = roundQuantity(baselineQuantity * (1 + demandPct / 100));
  const simulatedRevenue = roundCurrency(sellingPrice * simulatedQuantity);
  const simulatedGrossProfit = hasCost
    ? roundCurrency((sellingPrice - unitCost) * simulatedQuantity)
    : null;

  const deltaQuantity = simulatedQuantity - baselineQuantity;
  const pctDeltaQuantity = calculatePercentageChange(baselineQuantity, simulatedQuantity);

  const deltaRevenue = roundCurrency(simulatedRevenue - baselineRevenue);
  const pctDeltaRevenue = calculatePercentageChange(baselineRevenue, simulatedRevenue);

  const deltaGrossProfit = hasCost ? roundCurrency(simulatedGrossProfit - baselineGrossProfit) : null;
  const pctDeltaGrossProfit = hasCost ? calculatePercentageChange(baselineGrossProfit, simulatedGrossProfit) : null;

  const assumptions = [
    `Hypothetical demand shift of ${demandPct > 0 ? '+' : ''}${demandPct.toFixed(1)}% applied over a ${simulationPeriodDays}-day timeframe.`,
    `Unit selling price maintained constant at ₹${sellingPrice.toFixed(2)}.`,
    'Simulated outcome is a hypothetical projection, not a guaranteed sales forecast.',
  ];

  const limitations = [];
  if (!hasCost) {
    limitations.push('Unit cost price is missing. Gross profit impact is unavailable.');
  }
  if (!hasSalesHistory) {
    limitations.push('No recorded sales records in the baseline period. Quantities evaluate from 0.');
  }

  return {
    scenarioType: 'demand_change',
    product: {
      id: product._id || product.id,
      name: product.name,
      sku: product.sku,
      sellingPrice,
      unitCost,
      hasValidCost: hasCost,
    },
    inputs: {
      demandChangePercent: demandPct,
      simulationPeriodDays,
    },
    baseline: {
      sellingPrice,
      quantitySold: baselineQuantity,
      revenue: baselineRevenue,
      grossProfit: baselineGrossProfit,
    },
    simulated: {
      sellingPrice,
      quantitySold: simulatedQuantity,
      revenue: simulatedRevenue,
      grossProfit: simulatedGrossProfit,
    },
    comparison: {
      quantity: { absolute: deltaQuantity, percentage: pctDeltaQuantity },
      revenue: { absolute: deltaRevenue, percentage: pctDeltaRevenue },
      grossProfit: { absolute: deltaGrossProfit, percentage: pctDeltaGrossProfit },
    },
    assumptions,
    limitations,
  };
};

/**
 * C. Simulate Inventory Reorder & Lead-Time Depletion
 *
 * @param {object} params
 * @param {object} params.product
 * @param {number} [params.currentStock] - Current stock (defaults to product.stockQuantity)
 * @param {number} params.proposedOrderQuantity - Proposed replenishment units
 * @param {number} [params.leadTimeDays] - Supplier transit lead time in days
 * @param {number} [params.safetyStockTarget] - Target safety buffer
 * @param {object} [params.historicalDemand] - Demand velocity from forecasting engine
 * @returns {object}
 */
export const simulateInventoryReorder = ({
  product = {},
  currentStock,
  proposedOrderQuantity = 0,
  leadTimeDays,
  safetyStockTarget,
  historicalDemand = {},
}) => {
  const stockNow = roundQuantity(
    currentStock !== undefined && currentStock !== null ? currentStock : product.stockQuantity || 0
  );
  const orderQty = roundQuantity(proposedOrderQuantity);
  const leadTime = Math.max(1, Math.round(Number(leadTimeDays || product.leadTimeDays || 7)));
  const safetyTarget = roundQuantity(
    safetyStockTarget !== undefined && safetyStockTarget !== null
      ? safetyStockTarget
      : product.reorderThreshold || 10
  );

  const hasCost = isValidCost(product.costPrice);
  const unitCost = hasCost ? roundCurrency(product.costPrice) : null;
  const estimatedInvestment = hasCost ? roundCurrency(orderQty * unitCost) : null;

  // Chronological Timing Evaluation
  const hasDemandHistory = Boolean(
    historicalDemand.hasSufficientData &&
    historicalDemand.avgDailyDemand !== undefined &&
    historicalDemand.avgDailyDemand !== null &&
    !isNaN(historicalDemand.avgDailyDemand)
  );

  let leadTimeDemand = null;
  let preReceiptRemainingStock = stockNow;
  let preReceiptStockoutUnits = null;
  let isStockoutBeforeArrival = null;
  let postReceiptStock = stockNow + orderQty;

  const limitations = [];

  if (hasDemandHistory) {
    const dailyDemand = Math.max(0, Number(historicalDemand.avgDailyDemand));
    leadTimeDemand = roundQuantity(dailyDemand * leadTime);

    if (leadTimeDemand > stockNow) {
      preReceiptStockoutUnits = leadTimeDemand - stockNow;
      preReceiptRemainingStock = 0;
      isStockoutBeforeArrival = true;
    } else {
      preReceiptRemainingStock = stockNow - leadTimeDemand;
      preReceiptStockoutUnits = 0;
      isStockoutBeforeArrival = false;
    }

    // Post-receipt stock incorporates lead-time demand depletion
    postReceiptStock = preReceiptRemainingStock + orderQty;
  } else {
    // Insufficient historical data: do not fabricate depletion velocity
    limitations.push(
      'Insufficient historical sales records (<3 trading days) to project lead-time demand depletion. Stockout exposure and depletion cannot be reliably estimated.'
    );
  }

  const isBelowSafetyThreshold = postReceiptStock < safetyTarget;
  const avgDailyDemandVal = hasDemandHistory
    ? Number(Number(historicalDemand.avgDailyDemand).toFixed(2))
    : null;
  const formulaExplanation = hasDemandHistory
    ? `Current Stock (${stockNow}) - Expected Lead-Time Demand (${leadTimeDemand} over ${leadTime}d) = ${preReceiptRemainingStock} remaining before arrival; + Order Quantity (${orderQty}) = ${postReceiptStock} net units after arrival.`
    : `Current Stock (${stockNow}) + Order Quantity (${orderQty}) = ${postReceiptStock} units (lead-time demand not deducted due to <3 trading days).`;

  const assumptions = [
    `Assumes purchase order of ${orderQty} units placed today and received after ${leadTime} days supplier lead time.`,
    `Gross stock committed (Current Stock ${stockNow} + Order ${orderQty}) = ${stockNow + orderQty} units.`,
    hasDemandHistory
      ? `Expected demand during ${leadTime}-day supplier lead time is ${leadTimeDemand} units (${avgDailyDemandVal} units/day × ${leadTime} days).`
      : 'Depletion rate omitted due to limited historical trading days.',
    formulaExplanation,
    'Simulation runs strictly in-memory and does not modify actual inventory, sales, or product records.',
  ];

  if (!hasCost) {
    limitations.push('Product unit cost is missing. Capital outlay cannot be determined.');
  }

  return {
    scenarioType: 'inventory_reorder',
    product: {
      id: product._id || product.id,
      name: product.name,
      sku: product.sku,
      unitCost,
      hasValidCost: hasCost,
    },
    inputs: {
      currentStock: stockNow,
      proposedOrderQuantity: orderQty,
      leadTimeDays: leadTime,
      safetyStockTarget: safetyTarget,
    },
    timeline: {
      stockBeforeArrival: stockNow,
      avgDailyDemand: avgDailyDemandVal,
      leadTimeDemand,
      hasDemandHistory,
      preReceiptRemainingStock,
      preReceiptStockoutUnits,
      isStockoutBeforeArrival,
      orderQuantity: orderQty,
      stockAtReceipt: stockNow + orderQty,
      stockPostDeliveryAndDemand: postReceiptStock,
      safetyStockTarget: safetyTarget,
      isBelowSafetyThreshold,
      formulaExplanation,
    },
    financialImpact: {
      unitCost,
      estimatedInvestment,
    },
    assumptions,
    limitations,
  };
};

/**
 * D. Simulate Promotional Discount & Profit-Neutral Volume
 *
 * @param {object} params
 * @param {object} params.product
 * @param {number} params.discountPercent - Proposed discount percentage (0 <= d < 100)
 * @param {number} [params.hypotheticalDemandChangePercent=0] - Optional hypothetical volume bump (%)
 * @param {Array<{ quantitySold: number, totalRevenue?: number }>} [params.historicalSales=[]]
 * @returns {object}
 */
export const simulateDiscount = ({
  product = {},
  discountPercent = 0,
  hypotheticalDemandChangePercent = 0,
  historicalSales = [],
}) => {
  const originalPrice = roundCurrency(product.sellingPrice || 0);
  const dPct = Number(discountPercent);

  if (isNaN(dPct) || dPct < 0 || dPct >= 100) {
    throw new Error('Discount percentage must be greater than or equal to 0% and strictly less than 100%.');
  }

  const hasCost = isValidCost(product.costPrice);
  const unitCost = hasCost ? roundCurrency(product.costPrice) : null;

  // Preserve 2-decimal cents precision: never round to whole dollar integer
  const discountedPrice = roundCurrency(originalPrice * (1 - dPct / 100));

  let baselineQuantity = 0;
  let baselineRevenue = 0;
  const hasSalesHistory = Array.isArray(historicalSales) && historicalSales.length > 0;

  if (hasSalesHistory) {
    for (const s of historicalSales) {
      baselineQuantity += Number(s.quantitySold || 0);
      baselineRevenue += Number(s.totalRevenue || (s.quantitySold * originalPrice));
    }
  }

  baselineQuantity = roundQuantity(baselineQuantity);
  baselineRevenue = roundCurrency(baselineRevenue > 0 ? baselineRevenue : baselineQuantity * originalPrice);

  const baselineUnitMargin = hasCost ? roundCurrency(originalPrice - unitCost) : null;
  const baselineGrossProfit = hasCost
    ? roundCurrency(baselineUnitMargin * baselineQuantity)
    : null;

  // Contribution margin at discounted price
  const discountedUnitMargin = hasCost ? roundCurrency(discountedPrice - unitCost) : null;
  const isMarginZeroOrNegative = hasCost && discountedUnitMargin <= 0;

  // Profit-Matching Quantity (Baseline Profit-Neutral Sales Volume)
  // Strictly requires baseline gross profit > 0 AND discounted unit margin > 0
  let profitMatchQuantity = null;
  let isProfitMatchPossible = false;
  let profitMatchExplanation = '';
  let pctVolumeIncreaseNeeded = null;

  if (!hasCost) {
    isProfitMatchPossible = false;
    profitMatchExplanation = 'Unit cost is missing. Contribution margin and profit-matching volume cannot be computed.';
  } else if (baselineGrossProfit === null || baselineGrossProfit <= 0) {
    isProfitMatchPossible = false;
    profitMatchExplanation = 'Baseline gross profit is zero or negative. Profit-matching quantity is not applicable.';
  } else if (discountedUnitMargin <= 0) {
    isProfitMatchPossible = false;
    profitMatchExplanation = `Discounted price (₹${discountedPrice.toFixed(2)}) does not exceed unit cost (₹${unitCost.toFixed(2)}). Unit margin is ₹${discountedUnitMargin.toFixed(2)}; profit-matching is mathematically impossible.`;
  } else {
    // Q_match = ceil(Pi_0 / M_d)
    profitMatchQuantity = Math.ceil(baselineGrossProfit / discountedUnitMargin);
    isProfitMatchPossible = true;
    pctVolumeIncreaseNeeded = baselineQuantity > 0
      ? calculatePercentageChange(baselineQuantity, profitMatchQuantity)
      : null;
    profitMatchExplanation = `To match historical baseline gross profit of ₹${baselineGrossProfit.toFixed(2)} at the reduced unit margin of ₹${discountedUnitMargin.toFixed(2)}, sales volume must reach ${profitMatchQuantity} units (${pctVolumeIncreaseNeeded !== null && pctVolumeIncreaseNeeded > 0 ? '+' : ''}${pctVolumeIncreaseNeeded !== null ? pctVolumeIncreaseNeeded.toFixed(1) : 0}% vs baseline).`;
  }

  // Simulated results under user's hypothetical volume response
  const assumedDemandBump = Number(hypotheticalDemandChangePercent || 0);
  const simulatedQuantity = roundQuantity(baselineQuantity * (1 + assumedDemandBump / 100));
  const simulatedRevenue = roundCurrency(discountedPrice * simulatedQuantity);
  const simulatedGrossProfit = hasCost
    ? roundCurrency(discountedUnitMargin * simulatedQuantity)
    : null;

  const deltaQuantity = simulatedQuantity - baselineQuantity;
  const pctDeltaQuantity = calculatePercentageChange(baselineQuantity, simulatedQuantity);

  const deltaRevenue = roundCurrency(simulatedRevenue - baselineRevenue);
  const pctDeltaRevenue = calculatePercentageChange(baselineRevenue, simulatedRevenue);

  const deltaGrossProfit = hasCost ? roundCurrency(simulatedGrossProfit - baselineGrossProfit) : null;
  const pctDeltaGrossProfit = hasCost ? calculatePercentageChange(baselineGrossProfit, simulatedGrossProfit) : null;

  const assumptions = [
    `Discount of ${dPct.toFixed(1)}% reduces unit selling price from ₹${originalPrice.toFixed(2)} to ₹${discountedPrice.toFixed(2)}.`,
    assumedDemandBump !== 0
      ? `Hypothetical sales volume response of ${assumedDemandBump > 0 ? '+' : ''}${assumedDemandBump.toFixed(1)}% assumed.`
      : 'Zero automatic volume elasticity assumed without user-specified demand response.',
    'Profit-matching models unit volume to maintain previous gross profit; it is distinct from store-level fixed-overhead break-even.',
  ];

  const limitations = [];
  if (!hasCost) {
    limitations.push('Unit cost price is missing. Profit metrics cannot be evaluated.');
  }
  if (!hasSalesHistory) {
    limitations.push('No sales records in baseline window. Baseline units evaluate to 0.');
  }
  if (isMarginZeroOrNegative) {
    limitations.push(`Warning: Selling at ₹${discountedPrice.toFixed(2)} with unit cost ₹${unitCost.toFixed(2)} yields zero or negative gross profit.`);
  }

  return {
    scenarioType: 'discount',
    product: {
      id: product._id || product.id,
      name: product.name,
      sku: product.sku,
      originalPrice,
      unitCost,
      hasValidCost: hasCost,
    },
    inputs: {
      discountPercent: dPct,
      hypotheticalDemandChangePercent: assumedDemandBump,
      discountedPrice,
    },
    baseline: {
      sellingPrice: originalPrice,
      unitCost,
      unitMargin: baselineUnitMargin,
      quantitySold: baselineQuantity,
      revenue: baselineRevenue,
      grossProfit: baselineGrossProfit,
    },
    simulated: {
      sellingPrice: discountedPrice,
      unitCost,
      unitMargin: discountedUnitMargin,
      quantitySold: simulatedQuantity,
      revenue: simulatedRevenue,
      grossProfit: simulatedGrossProfit,
    },
    profitMatch: {
      targetGrossProfit: baselineGrossProfit,
      discountedUnitMargin,
      profitMatchQuantity,
      isProfitMatchPossible,
      pctVolumeIncreaseNeeded,
      explanation: profitMatchExplanation,
      isMarginZeroOrNegative,
    },
    comparison: {
      quantity: { absolute: deltaQuantity, percentage: pctDeltaQuantity },
      revenue: { absolute: deltaRevenue, percentage: pctDeltaRevenue },
      grossProfit: { absolute: deltaGrossProfit, percentage: pctDeltaGrossProfit },
    },
    assumptions,
    limitations,
  };
};
