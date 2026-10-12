import '../config/testEnv.js';
import {
  evaluateRestockOutcome,
  aggregateWindowSales,
} from '../utils/auditEngine.js';
import {
  evaluateProductDemandRisk,
} from '../utils/forecastingEngine.js';
import {
  calculateReorderQuantity,
  evaluateProductDecliningSales,
  generateCandidateRecommendations,
} from '../utils/recommendationEngine.js';
import {
  simulateInventoryReorder,
} from '../utils/scenarioEngine.js';
import {
  parseAndValidateSalesCSV,
  parseAndValidateInventoryCSV,
} from '../utils/csvParser.js';
import {
  detectTransactionOutliers,
} from '../utils/anomalyEngine.js';

async function runPlatformFixesTests() {
  console.log('🧪 [START] Running Retail BI Platform Fixes Regression Suite (In-Memory, Non-Destructive)...\n');
  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  };

  try {
    // =========================================================================
    // 1. TASK 1: Currency Symbol & Simplified Explanation Verification
    // =========================================================================
    console.log('--- 1. Currency (₹) & Simplified User-Facing Explanations ---');
    const sampleTransactions = Array.from({ length: 12 }, (_, i) => ({
      _id: `tx-${i + 1}`,
      productName: 'Basmati Rice 5kg',
      quantitySold: 2,
      unitPrice: 100,
      totalRevenue: i === 11 ? 2500 : 200,
      paymentMethod: 'cash',
      date: new Date(`2026-03-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`),
    }));

    const outlierRes = detectTransactionOutliers(sampleTransactions, { outlierThreshold: 3.5 });
    assert(outlierRes.outliers.length === 1, 'Outlier engine flags extreme receipt');
    assert(outlierRes.outliers[0].explanation.includes('₹'), 'Outlier explanation uses ₹ currency symbol');
    assert(!outlierRes.outliers[0].explanation.includes('$'), 'Outlier explanation contains no $ symbol');
    assert(
      !outlierRes.outliers[0].explanation.includes('Modified Z-score'),
      'Outlier explanation uses business-friendly wording instead of technical jargon'
    );

    // =========================================================================
    // 2. TASK 2: Decision Audit Pending Stockout Status
    // =========================================================================
    console.log('\n--- 2. Decision Audit Pending Stockout Status (0 Post-Window Trading Days) ---');
    const preMetrics = aggregateWindowSales(
      [{ date: '2026-03-08', quantitySold: 6, unitPrice: 25, totalRevenue: 150 }],
      '2026-03-01',
      '2026-03-14',
      18
    );
    const emptyPostMetrics = aggregateWindowSales([], '2026-03-16', '2026-03-29', 18);

    const pendingRestockEval = evaluateRestockOutcome({
      preMetrics,
      postMetrics: emptyPostMetrics,
      quantityOrdered: 18,
      costPrice: 18,
      currentStock: 12,
      isMatured: true,
    });

    assert(
      pendingRestockEval.stockoutAverted === null,
      'Decision Audit: stockoutAverted is null (Pending) when post-window has 0 trading days and currentStock > 0'
    );
    assert(
      pendingRestockEval.investmentCost === 324,
      'Decision Audit: 18 units @ ₹18 unit cost produces ₹324 purchase outlay'
    );
    assert(
      pendingRestockEval.status === 'insufficient_data' && pendingRestockEval.roiPercent === null,
      'Decision Audit: Marks status as insufficient_data and roiPercent as null when post-window has 0 trading days'
    );

    const activePostMetrics = aggregateWindowSales(
      [
        { date: '2026-03-18', quantitySold: 5, unitPrice: 25, totalRevenue: 125 },
        { date: '2026-03-20', quantitySold: 5, unitPrice: 25, totalRevenue: 125 },
        { date: '2026-03-22', quantitySold: 5, unitPrice: 25, totalRevenue: 125 },
      ],
      '2026-03-16',
      '2026-03-29',
      18
    );
    const activeRestockEval = evaluateRestockOutcome({
      preMetrics,
      postMetrics: activePostMetrics,
      quantityOrdered: 18,
      costPrice: 18,
      currentStock: 15,
      isMatured: true,
    });
    assert(
      activeRestockEval.stockoutAverted === true,
      'Decision Audit: stockoutAverted is true when post-window has sales and positive stock'
    );

    // =========================================================================
    // 3. TASK 3: Recommendations — Zero-Unit Order Prevention & Latest Sales Date Anchor
    // =========================================================================
    console.log('\n--- 3. Recommendations: Zero-Unit Order Prevention & Latest Sales Date Anchor ---');
    const zeroStockLowDemand = calculateReorderQuantity({
      stockQuantity: 0,
      reorderThreshold: 0,
      leadTimeDays: 7,
      avgDailyDemand: 0,
      hasSufficientData: true,
    });
    assert(
      zeroStockLowDemand.suggestedQuantity > 0,
      `Out-of-stock item with 0 threshold and 0 demand still suggests > 0 units (got ${zeroStockLowDemand.suggestedQuantity})`
    );

    const thresholdStockZeroDemand = calculateReorderQuantity({
      stockQuantity: 10,
      reorderThreshold: 10,
      leadTimeDays: 7,
      avgDailyDemand: 0,
      hasSufficientData: true,
    });
    assert(
      thresholdStockZeroDemand.suggestedQuantity >= 10,
      `Low-stock item at threshold (10/10) with 0 demand suggests safety buffer >= 10 units (got ${thresholdStockZeroDemand.suggestedQuantity})`
    );

    // Test false 100% decline prevention when wall-clock date is months after latest sales date
    const historicalSalesMarch = [
      { date: new Date('2026-03-01T10:00:00.000Z'), quantitySold: 8, totalRevenue: 200 },
      { date: new Date('2026-03-03T10:00:00.000Z'), quantitySold: 7, totalRevenue: 175 },
      { date: new Date('2026-03-06T10:00:00.000Z'), quantitySold: 8, totalRevenue: 200 },
      { date: new Date('2026-03-08T10:00:00.000Z'), quantitySold: 9, totalRevenue: 225 },
      { date: new Date('2026-03-10T10:00:00.000Z'), quantitySold: 8, totalRevenue: 200 },
    ];
    const falseDeclineCheck = evaluateProductDecliningSales({
      productSales: historicalSalesMarch,
      distinctStoreTradingDays: 10,
      referenceDate: new Date('2026-10-11T12:00:00.000Z'), // Wall-clock months later
      latestSalesDate: new Date('2026-03-10T10:00:00.000Z'), // Latest store sale in March
    });
    assert(
      falseDeclineCheck === null,
      'Steady historical sales in March do NOT trigger a false 100% decline alert when evaluated in October'
    );

    // Test genuine decline anchored to latestSalesDate
    const genuineDeclineSales = [
      { date: new Date('2026-02-26T10:00:00.000Z'), quantitySold: 12, totalRevenue: 300 },
      { date: new Date('2026-03-01T10:00:00.000Z'), quantitySold: 10, totalRevenue: 250 },
      { date: new Date('2026-03-05T10:00:00.000Z'), quantitySold: 4, totalRevenue: 100 },
      { date: new Date('2026-03-09T10:00:00.000Z'), quantitySold: 2, totalRevenue: 50 },
    ];
    const genuineDeclineCheck = evaluateProductDecliningSales({
      productSales: genuineDeclineSales,
      distinctStoreTradingDays: 10,
      referenceDate: new Date('2026-10-11T12:00:00.000Z'),
      latestSalesDate: new Date('2026-03-10T10:00:00.000Z'),
    });
    assert(
      genuineDeclineCheck !== null && genuineDeclineCheck.declinePct === 72.7,
      `Genuine sales decline anchored to latestSalesDate is accurately detected (${genuineDeclineCheck?.declinePct}%)`
    );

    // =========================================================================
    // 4. TASK 4: Consistent Demand Calculations Across Forecast, Recommendations & What-If
    // =========================================================================
    console.log('\n--- 4. Consistent Demand Calculations (Forecast, Recommendations, What-If) ---');
    const sharedProduct = {
      _id: 'prod-soap-002',
      name: 'Soap',
      sku: 'S002',
      category: 'Personal Care',
      costPrice: 18,
      sellingPrice: 25,
      stockQuantity: 12,
      reorderThreshold: 10,
      leadTimeDays: 7,
      supplier: 'Hindustan Traders',
    };
    const sharedSales = [
      { _id: 's1', productId: 'prod-soap-002', productName: 'Soap', date: '2026-03-01', quantitySold: 6, totalRevenue: 150 },
      { _id: 's2', productId: null, productName: 'Soap', date: '2026-03-02', quantitySold: 7, totalRevenue: 175 },
      { _id: 's3', productId: 'prod-soap-002', productName: 'Soap', date: '2026-03-03', quantitySold: 8, totalRevenue: 200 },
      { _id: 's4', productId: null, productName: 'Soap', date: '2026-03-04', quantitySold: 6, totalRevenue: 150 },
      { _id: 's5', productId: 'prod-soap-002', productName: 'Soap', date: '2026-03-05', quantitySold: 7, totalRevenue: 175 },
      { _id: 's6', productId: 'prod-soap-002', productName: 'Soap', date: '2026-03-06', quantitySold: 8, totalRevenue: 200 },
      { _id: 's7', productId: 'prod-soap-002', productName: 'Soap', date: '2026-03-07', quantitySold: 7, totalRevenue: 175 },
    ];

    const forecast7 = evaluateProductDemandRisk({
      salesRecords: sharedSales.map((s) => ({ date: s.date, quantity: s.quantitySold })),
      stockQuantity: sharedProduct.stockQuantity,
      reorderThreshold: sharedProduct.reorderThreshold,
      leadTimeDays: sharedProduct.leadTimeDays,
      horizon: 7,
    });
    const forecast14 = evaluateProductDemandRisk({
      salesRecords: sharedSales.map((s) => ({ date: s.date, quantity: s.quantitySold })),
      stockQuantity: sharedProduct.stockQuantity,
      reorderThreshold: sharedProduct.reorderThreshold,
      leadTimeDays: sharedProduct.leadTimeDays,
      horizon: 14,
    });

    assert(
      forecast7.avgDailyDemand === forecast14.avgDailyDemand &&
        forecast7.runoutDays === forecast14.runoutDays &&
        forecast7.suggestedReorder === forecast14.suggestedReorder,
      `Operational metrics (avgDailyDemand=${forecast7.avgDailyDemand}, runoutDays=${forecast7.runoutDays}, suggestedReorder=${forecast7.suggestedReorder}) remain invariant across 7d and 14d chart horizons`
    );

    const recCandidates = generateCandidateRecommendations({
      products: [sharedProduct],
      sales: sharedSales,
      referenceDate: new Date('2026-03-08T10:00:00.000Z'),
    });
    const soapRec = recCandidates.find(
      (r) =>
        r.productId === 'prod-soap-002' &&
        (r.type === 'reorder_urgency' || r.type === 'high_demand_stockout_risk')
    );
    assert(
      Boolean(soapRec) &&
        soapRec.evidence.avgDailyDemand === forecast7.avgDailyDemand &&
        soapRec.evidence.runoutDays === forecast7.runoutDays &&
        soapRec.evidence.suggestedQuantity === forecast7.suggestedReorder,
      `Recommendations engine matches Forecast operational demand (${soapRec?.evidence?.avgDailyDemand}/d), runout (${soapRec?.evidence?.runoutDays}d), and suggested order (${soapRec?.evidence?.suggestedQuantity} units)`
    );

    // =========================================================================
    // 5. TASK 5: What-If Simulator Inventory Reorder Breakdown & Non-Destructive Guarantee
    // =========================================================================
    console.log('\n--- 5. What-If Simulator Inventory Reorder Calculation & Non-Destructive Check ---');
    const productSnapshotBefore = JSON.stringify(sharedProduct);
    const simResult = simulateInventoryReorder({
      product: sharedProduct,
      currentStock: sharedProduct.stockQuantity,
      proposedOrderQuantity: forecast7.suggestedReorder,
      leadTimeDays: sharedProduct.leadTimeDays,
      safetyStockTarget: sharedProduct.reorderThreshold,
      historicalDemand: forecast7,
    });
    const productSnapshotAfter = JSON.stringify(sharedProduct);

    assert(productSnapshotBefore === productSnapshotAfter, 'What-If simulation does not mutate product object');
    const expectedPreReceiptRemaining = Math.max(
      0,
      sharedProduct.stockQuantity - simResult.timeline.leadTimeDemand
    );
    const expectedNetArrival = expectedPreReceiptRemaining + forecast7.suggestedReorder;
    assert(
      simResult.timeline.stockAtReceipt === sharedProduct.stockQuantity + forecast7.suggestedReorder,
      `What-If stockAtReceipt (${simResult.timeline.stockAtReceipt}) equals Current (${sharedProduct.stockQuantity}) + Order (${forecast7.suggestedReorder})`
    );
    assert(
      simResult.timeline.stockPostDeliveryAndDemand === expectedNetArrival,
      `What-If stockPostDeliveryAndDemand (${simResult.timeline.stockPostDeliveryAndDemand}) equals remaining pre-receipt stock (${expectedPreReceiptRemaining}) + Order (${forecast7.suggestedReorder})`
    );
    assert(
      typeof simResult.timeline.formulaExplanation === 'string' &&
        simResult.timeline.formulaExplanation.includes('net units after arrival'),
      'What-If simulation includes clear formulaExplanation breakdown'
    );

    // =========================================================================
    // 6. TASKS 6 & 7: CSV Uploads (Header Aliases, Future Dates, Unknown Products, Lead Time)
    // =========================================================================
    console.log('\n--- 6. CSV Uploads: Header Aliases, Future-Date Rejection, Unknown Products & Lead Time ---');
    const salesCsvBuffer = Buffer.from(
      [
        'Transaction Date,Item Name,Qty Sold,Selling Price',
        '2026-03-05,Soap,3,25',
        '2026-03-06,Mystery Import Item,2,50',
        '2099-12-31,Soap,1,25',
      ].join('\n'),
      'utf8'
    );

    const salesParseRes = await parseAndValidateSalesCSV(salesCsvBuffer, {
      knownProducts: [{ name: 'Soap', sku: 'S002' }],
    });

    assert(salesParseRes.validCount === 2, 'Sales CSV accepts valid rows with alternative column headers');
    assert(salesParseRes.invalidCount === 1, 'Sales CSV rejects future-dated sales row');
    assert(
      salesParseRes.invalidRows[0].errors.some((e) => e.includes('Future sales date')),
      'Sales CSV future date error message clearly explains rejection'
    );
    assert(
      Array.isArray(salesParseRes.unknownProducts) &&
        salesParseRes.unknownProducts.includes('Mystery Import Item'),
      'Sales CSV detects and warns about unknown products not in catalog'
    );
    assert(
      Array.isArray(salesParseRes.columnMapping) &&
        salesParseRes.columnMapping.some((m) => m.originalHeader === 'Item Name' && m.mappedTo === 'productname'),
      'Sales CSV reports detected columnMapping'
    );

    // Inventory CSV with Lead Time column, omitted Lead Time (default 7), and invalid Lead Time (< 1)
    const invCsvBuffer = Buffer.from(
      [
        'Item Name,Product Code,Department,Buy Price,MRP,Opening Stock,Min Stock,Lead Time',
        'Sugar 1kg,SUG-01,Grocery,35,45,50,15,5',
        'Tea Dust 250g,TEA-01,Grocery,80,110,30,10,',
        'Invalid Lead Item,INV-01,Grocery,20,30,10,5,0',
      ].join('\n'),
      'utf8'
    );

    const invParseRes = await parseAndValidateInventoryCSV(invCsvBuffer);

    assert(invParseRes.validCount === 2, 'Inventory CSV accepts valid rows with alternative column names');
    assert(invParseRes.validRows[0].leadTimeDays === 5, 'Inventory CSV parses explicit Lead Time = 5 days');
    assert(invParseRes.validRows[1].leadTimeDays === 7, 'Inventory CSV defaults omitted Lead Time to 7 days');
    assert(
      invParseRes.invalidCount === 1 &&
        invParseRes.invalidRows[0].errors.some((e) => e.includes('Supplier lead time (leadTimeDays) must be at least 1 day')),
      'Inventory CSV rejects Lead Time < 1 day with clear error'
    );

    console.log(`\n=============================================================`);
    console.log(`🎯 Platform Fixes Regression Summary: ${passed} Passed | ${failed} Failed`);
    console.log(`=============================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ [UNEXPECTED TEST FAILURE]:', err);
    process.exit(1);
  }
}

runPlatformFixesTests();
