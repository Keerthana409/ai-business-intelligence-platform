import '../config/testEnv.js';
import 'dotenv/config';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import { connectDB } from '../config/db.js';
import {
  alignDailyTimeSeries,
  calculateHoltLinear,
  runChronologicalBacktest,
  evaluateProductDemandRisk,
} from '../utils/forecastingEngine.js';
import { calculateReorderQuantity } from '../utils/recommendationEngine.js';

async function runActualSalesAuditSuite() {
  console.log('🧪 [START] Running Retail BI Actual Sales & Inventory Audit Test Suite...\n');
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
    await connectDB();
    assert(
      mongoose.connection.name === 'retail_bi_test_db',
      `Connected strictly to isolated test database (${mongoose.connection.name})`
    );

    const testEmail = 'actual_sales_audit_owner@test.com';
    await User.deleteMany({ email: testEmail });

    const regRes = await request(app).post('/api/auth/register').send({
      name: 'Actual Sales Owner',
      email: testEmail,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Retail BI Test Store',
      businessType: 'supermarket',
    });
    const token = regRes.body.data.token;
    const userId = new mongoose.Types.ObjectId(regRes.body.data.user._id);

    // =========================================================================
    // 1. INVENTORY SETUP: The Six Products from User Audit Specification
    // =========================================================================
    console.log('\n--- 1. Inventory Catalog Setup ---');
    const catalogSpecs = [
      { sku: 'B001', name: 'Biscuits', costPrice: 7, sellingPrice: 10, stockQuantity: 80, reorderThreshold: 20, leadTimeDays: 7, category: 'Packaged Food' },
      { sku: 'S002', name: 'Soap', costPrice: 18, sellingPrice: 25, stockQuantity: 12, reorderThreshold: 15, leadTimeDays: 7, category: 'Personal Care' },
      { sku: 'M001', name: 'Milk', costPrice: 25, sellingPrice: 30, stockQuantity: 40, reorderThreshold: 10, leadTimeDays: 7, category: 'Dairy' },
      { sku: 'W001', name: 'Wheat Flour', costPrice: 30, sellingPrice: 40, stockQuantity: 50, reorderThreshold: 10, leadTimeDays: 7, category: 'Grains' },
      { sku: 'S001', name: 'Sugar', costPrice: 35, sellingPrice: 45, stockQuantity: 15, reorderThreshold: 25, leadTimeDays: 7, category: 'Pantry' },
      { sku: 'R001', name: 'Rice', costPrice: 45, sellingPrice: 60, stockQuantity: 100, reorderThreshold: 20, leadTimeDays: 7, category: 'Grains' },
    ];

    const createdProducts = new Map();
    for (const spec of catalogSpecs) {
      const prod = await Product.create({ userId, ...spec });
      createdProducts.set(spec.sku, prod);
    }
    assert(createdProducts.size === 6, 'All 6 inventory catalog products created successfully');

    // =========================================================================
    // 2. SALES DATA SETUP: The Exact Six Historical Transactions
    // =========================================================================
    console.log('\n--- 2. Historical Sales Ingestion & Verification ---');
    const actualSalesRecords = [
      { dateStr: '2026-10-01', sku: 'R001', name: 'Rice', qty: 10, unitPrice: 60, expectedRev: 600 },
      { dateStr: '2026-10-02', sku: 'S001', name: 'Sugar', qty: 5, unitPrice: 45, expectedRev: 225 },
      { dateStr: '2026-10-03', sku: 'W001', name: 'Wheat Flour', qty: 8, unitPrice: 40, expectedRev: 320 },
      { dateStr: '2026-10-04', sku: 'M001', name: 'Milk', qty: 12, unitPrice: 30, expectedRev: 360 },
      { dateStr: '2026-10-05', sku: 'S002', name: 'Soap', qty: 6, unitPrice: 25, expectedRev: 150 },
      { dateStr: '2026-10-06', sku: 'B001', name: 'Biscuits', qty: 15, unitPrice: 10, expectedRev: 150 },
    ];

    let totalRecordedRevenue = 0;
    let totalRecordedQuantity = 0;

    for (const r of actualSalesRecords) {
      const prod = createdProducts.get(r.sku);
      const totalCost = r.qty * prod.costPrice;
      const totalRevenue = r.qty * r.unitPrice;
      totalRecordedRevenue += totalRevenue;
      totalRecordedQuantity += r.qty;

      await Sale.create({
        userId,
        productId: prod._id,
        productName: r.name,
        category: prod.category,
        quantitySold: r.qty,
        unitPrice: r.unitPrice,
        totalCost,
        totalRevenue,
        profit: totalRevenue - totalCost,
        paymentMethod: 'cash',
        date: new Date(`${r.dateStr}T10:00:00.000Z`),
      });
    }

    assert(totalRecordedRevenue === 1805, `Total historical revenue equals ₹1,805 (got ₹${totalRecordedRevenue})`);
    assert(totalRecordedQuantity === 56, `Total historical quantity sold equals 56 units (got ${totalRecordedQuantity})`);

    // =========================================================================
    // 3. STORE-WIDE TIME SERIES ALIGNMENT & UNITS VERIFICATION
    // =========================================================================
    console.log('\n--- 3. Time Series Alignment & Units Audit ---');
    const dbSales = await Sale.find({ userId }).sort({ date: 1 });
    const formattedSales = dbSales.map((s) => ({ date: s.date, amount: s.totalRevenue }));
    const alignedStore = alignDailyTimeSeries(formattedSales);

    assert(alignedStore.distinctRecordedDays === 6, 'Store-wide distinct trading days equals exactly 6');
    assert(alignedStore.dateSpanDays === 6, 'Continuous calendar span equals exactly 6 days (Oct 1 to Oct 6)');
    assert(alignedStore.series.length === 6, 'Aligned series contains exactly 6 daily observations');
    assert(alignedStore.series.every((s) => s.isRecorded === true), 'All 6 dates are recorded trading days');

    const expectedRevenues = [600, 225, 320, 360, 150, 150];
    const actualDailyValues = alignedStore.series.map((s) => s.value);
    assert(
      JSON.stringify(actualDailyValues) === JSON.stringify(expectedRevenues),
      `Daily series values strictly match daily revenue ₹[${expectedRevenues.join(', ')}]`
    );

    // =========================================================================
    // 4. PREDICTIVE SALES FORECAST CALCULATION AUDIT (DAMPED TREND phi = 0.5)
    // =========================================================================
    console.log('\n--- 4. Damped Trend Sales Forecast Math, Horizon Sum & Backtest Comparison ---');
    const salesForecastRes = await request(app)
      .get('/api/forecast/sales?horizon=7')
      .set('Authorization', `Bearer ${token}`);

    assert(salesForecastRes.status === 200, 'GET /api/forecast/sales?horizon=7 returns HTTP 200');
    const forecastData = salesForecastRes.body.data;

    assert(
      forecastData.algorithm === "Holt's Linear Exponential Smoothing",
      'Uses provisional statistical fallback (Holt Linear) because trading history is 6/14 days'
    );
    assert(forecastData.parameters?.phi === 0.5, `Configured damping parameter phi is 0.5 (got ${forecastData.parameters?.phi})`);
    assert(forecastData.mlMetadata?.mlActive === false, 'mlMetadata.mlActive is false (insufficient days for RF)');
    assert(forecastData.mlMetadata?.distinctRecordedDays === 6, 'mlMetadata correctly reports 6 distinct trading days');
    assert(forecastData.predictions?.length === 7, 'Forecast horizon produces exactly 7 daily prediction objects');

    // Keep actual sales strictly separate from forecast values
    assert(
      Array.isArray(forecastData.historicalActuals) && forecastData.historicalActuals.length === 6,
      'Historical actuals (6 days) are kept strictly separate from future predictions (7 days)'
    );
    assert(
      forecastData.historicalActuals[5].date === '2026-10-06' && forecastData.predictions[0].date === '2026-10-07',
      'Forecast timeline begins on 2026-10-07 immediately after last historical date 2026-10-06'
    );

    // Verify dynamic damped trend predictions for 7 days: [71.52, 52.80, 43.45, 38.77, 36.43, 35.26, 34.67]
    const expectedDamped7Day = [71.52, 52.8, 43.45, 38.77, 36.43, 35.26, 34.67];
    const actualPredValues = forecastData.predictions.map((p) => p.forecastRevenue);
    assert(
      JSON.stringify(actualPredValues) === JSON.stringify(expectedDamped7Day),
      `7-day damped predictions dynamically match [${expectedDamped7Day.join(', ')}] (got [${actualPredValues.join(', ')}])`
    );
    assert(
      actualPredValues.every((v) => v > 0),
      'All 7 future daily predictions remain strictly positive (no zero collapse on Days 2-7)'
    );

    const sumOfPredictions = Number(
      forecastData.predictions.reduce((sum, p) => sum + p.forecastRevenue, 0).toFixed(2)
    );
    assert(
      forecastData.totalProjectedRevenue === 312.9 && forecastData.totalProjectedRevenue === sumOfPredictions,
      `Displayed 7-day projected revenue dynamically equals ₹312.90 cumulative sum (got ₹${forecastData.totalProjectedRevenue})`
    );

    // Multi-horizon consistency check: 14-day and 30-day horizons
    const forecast14Res = await request(app)
      .get('/api/forecast/sales?horizon=14')
      .set('Authorization', `Bearer ${token}`);
    assert(forecast14Res.status === 200 && forecast14Res.body.data.predictions.length === 14, '14-day horizon returns 14 daily predictions');
    assert(
      forecast14Res.body.data.predictions.every((p) => p.forecastRevenue >= 34.09),
      'All 14-day damped predictions remain strictly positive (>= ₹34.09 asymptotic floor)'
    );

    const forecast30Res = await request(app)
      .get('/api/forecast/sales?horizon=30')
      .set('Authorization', `Bearer ${token}`);
    assert(forecast30Res.status === 200 && forecast30Res.body.data.predictions.length === 30, '30-day horizon returns 30 daily predictions');
    assert(
      forecast30Res.body.data.predictions.every((p) => p.forecastRevenue >= 34.09),
      'All 30-day damped predictions remain strictly positive (>= ₹34.09 asymptotic floor)'
    );

    // Verify Holt mathematical recursion parameters
    const holtMath = calculateHoltLinear(actualDailyValues, 7, 0.3, 0.1, 0.5);
    assert(holtMath.finalLevel === 108.95, `Holt final level is ₹108.95 (got ${holtMath.finalLevel})`);
    assert(holtMath.finalTrend === -74.8607, `Holt final trend is -74.8607 (got ${holtMath.finalTrend})`);
    assert(holtMath.dampingPhi === 0.5, `Holt dampingPhi is 0.5 (got ${holtMath.dampingPhi})`);

    // Compare Undamped (phi = 1.0) vs Damped (phi = 0.5) via chronological backtest
    const backtest = forecastData.modelEvaluation;
    assert(backtest !== null, 'Model evaluation metrics object is present');
    assert(
      backtest.accuracyStatus === 'Pending (Needs 14+ Days)',
      'Reliability status is marked Pending (Needs 14+ Days) rather than claiming verified confidence'
    );
    assert(backtest.isProvisional === true, 'Model evaluation is flagged isProvisional: true (< 14 days)');

    const comp = backtest.formulationComparison;
    assert(comp !== undefined, 'Chronological backtest includes formulationComparison (damped vs undamped)');
    assert(
      comp.damped.phi === 0.5 && comp.damped.mae === 78.54 && comp.damped.wape === 52.4,
      `Damped (phi=0.5) holdout backtest reports MAE=₹78.54, WAPE=52.4% (got MAE=₹${comp?.damped?.mae}, WAPE=${comp?.damped?.wape}%)`
    );
    assert(
      comp.undamped.phi === 1.0 && comp.undamped.mae === 31.48 && comp.undamped.wape === 21,
      `Undamped (phi=1.0) holdout backtest reports MAE=₹31.48, WAPE=21% (got MAE=₹${comp?.undamped?.mae}, WAPE=${comp?.undamped?.wape}%)`
    );

    // =========================================================================
    // 5. PRODUCT-LEVEL DEMAND AGGREGATION AUDIT (1/3 DAYS EXPLANATION)
    // =========================================================================
    console.log('\n--- 5. Product-Level Demand & History Gating Audit ---');
    const demandRes = await request(app)
      .get('/api/forecast/demand?horizon=7')
      .set('Authorization', `Bearer ${token}`);

    assert(demandRes.status === 200, 'GET /api/forecast/demand returns HTTP 200');
    const demandList = demandRes.body.data;
    assert(demandList.length === 6, 'Evaluated demand for all 6 catalog products');

    for (const item of demandList) {
      assert(
        item.distinctRecordedDays === 1,
        `${item.name} has exactly 1 distinct recorded sales day (only sold on 1 calendar date)`
      );
      assert(
        item.hasSufficientData === false,
        `${item.name} honestly reports hasSufficientData: false (1 < 3 days threshold)`
      );
      assert(
        item.minRequiredDaysForBaseline === 3,
        `${item.name} reports minimum 3 days required for baseline demand`
      );
      assert(
        item.additionalDaysNeededForBaseline === 2,
        `${item.name} indicates 2 additional days needed for baseline`
      );
      assert(
        item.totalProjectedDemand === 0 && item.projectedDailyDemand === 0,
        `${item.name} does not fabricate demand projections when history is insufficient`
      );
    }

    // =========================================================================
    // 6. STOCKOUT RISK MATRIX & DOCUMENTED REORDER FORMULAS
    // =========================================================================
    console.log('\n--- 6. Stockout Risk Matrix & Reorder Calculations Audit ---');
    const riskRes = await request(app)
      .get('/api/forecast/inventory-risk?horizon=7')
      .set('Authorization', `Bearer ${token}`);

    assert(riskRes.status === 200, 'GET /api/forecast/inventory-risk returns HTTP 200');
    const riskItems = riskRes.body.data;

    const sugarRisk = riskItems.find((r) => r.sku === 'S001');
    const soapRisk = riskItems.find((r) => r.sku === 'S002');
    const riceRisk = riskItems.find((r) => r.sku === 'R001');
    const wheatRisk = riskItems.find((r) => r.sku === 'W001');
    const milkRisk = riskItems.find((r) => r.sku === 'M001');
    const biscuitsRisk = riskItems.find((r) => r.sku === 'B001');

    // Sugar: Stock 15 <= Threshold 25 -> Buffer Target = 2 * 25 = 50 -> Suggested = 50 - 15 = 35 units
    assert(
      sugarRisk.status === 'Low Stock (Buffer Alert)',
      'Sugar is flagged as "Low Stock (Buffer Alert)" (Stock 15 <= Threshold 25)'
    );
    assert(
      sugarRisk.suggestedReorder === 35,
      `Sugar suggested reorder equals 35 units from formula 2*threshold - stock (got ${sugarRisk.suggestedReorder})`
    );

    // Soap: Stock 12 <= Threshold 15 -> Buffer Target = 2 * 15 = 30 -> Suggested = 30 - 12 = 18 units
    assert(
      soapRisk.status === 'Low Stock (Buffer Alert)',
      'Soap is flagged as "Low Stock (Buffer Alert)" (Stock 12 <= Threshold 15)'
    );
    assert(
      soapRisk.suggestedReorder === 18,
      `Soap suggested reorder equals 18 units from formula 2*threshold - stock (got ${soapRisk.suggestedReorder})`
    );

    // Products above threshold: Suggested Reorder = 0
    assert(riceRisk.status === 'Pending History' && riceRisk.suggestedReorder === 0, 'Rice (Stock 100 > Threshold 20) suggests 0 units');
    assert(wheatRisk.status === 'Pending History' && wheatRisk.suggestedReorder === 0, 'Wheat Flour (Stock 50 > Threshold 10) suggests 0 units');
    assert(milkRisk.status === 'Pending History' && milkRisk.suggestedReorder === 0, 'Milk (Stock 40 > Threshold 10) suggests 0 units');
    assert(biscuitsRisk.status === 'Pending History' && biscuitsRisk.suggestedReorder === 0, 'Biscuits (Stock 80 > Threshold 20) suggests 0 units');

    // Verify recommendations engine matches inventory risk suggested reorders
    const sugarFormulaReorder = calculateReorderQuantity({
      stockQuantity: 15,
      reorderThreshold: 25,
      leadTimeDays: 7,
      avgDailyDemand: 0,
      hasSufficientData: false,
    });
    assert(sugarFormulaReorder.suggestedQuantity === 35, 'Recommendations formula produces exact 35 units for Sugar');

    const soapFormulaReorder = calculateReorderQuantity({
      stockQuantity: 12,
      reorderThreshold: 15,
      leadTimeDays: 7,
      avgDailyDemand: 0,
      hasSufficientData: false,
    });
    assert(soapFormulaReorder.suggestedQuantity === 18, 'Recommendations formula produces exact 18 units for Soap');

    // =========================================================================
    // 7. EDGE CASE TESTS: Zero-Sales Days, Short Histories, Negative Trends, Missing Dates & Empty Input
    // =========================================================================
    console.log('\n--- 7. Edge Case Tests: Zero-Sales, Short Histories, Negative Trends, Missing Dates & Empty Input ---');

    // 7.1: Missing Calendar Dates & Zero-Sales Days
    const intermittentRecords = [
      { date: '2026-10-01', amount: 100 },
      { date: '2026-10-03', amount: 200 }, // Oct 2 is missing
    ];
    const intermittentAligned = alignDailyTimeSeries(intermittentRecords);
    assert(intermittentAligned.series.length === 3, 'Intermittent records filled with 0 on missing Oct 2');
    assert(intermittentAligned.series[1].value === 0 && intermittentAligned.series[1].isRecorded === false, 'Missing day correctly set to value 0 with isRecorded false');
    assert(intermittentAligned.distinctRecordedDays === 2, 'Distinct recorded days strictly counts only recorded dates (2)');

    const zeroSalesSeries = [200, 0, 180, 0, 160, 0, 150];
    const zeroSalesDamped = calculateHoltLinear(zeroSalesSeries, 7, 0.3, 0.1, 0.5);
    assert(
      zeroSalesDamped.forecast.length === 7 && zeroSalesDamped.forecast.every((v) => v >= 0),
      'Zero-sales intermittent series produces 7 non-negative damped predictions'
    );

    // 7.2: Negative Trends & Non-Negative Constraints
    const steepNegativeSeries = [500, 400, 300, 200, 120];
    const negDamped = calculateHoltLinear(steepNegativeSeries, 7, 0.3, 0.1, 0.5);
    assert(
      negDamped.forecast.every((v) => v >= 0),
      `Steep negative trend series maintains non-negative damped predictions ([${negDamped.forecast.join(', ')}])`
    );

    // 7.3: Empty Input & Single Observation Handling
    const emptyAligned = alignDailyTimeSeries([]);
    assert(
      emptyAligned.series.length === 0 && emptyAligned.distinctRecordedDays === 0 && emptyAligned.startDate === null,
      'Empty input array to alignDailyTimeSeries safely returns empty series and 0 distinct days'
    );

    let emptyHoltThrew = false;
    try {
      calculateHoltLinear([], 7);
    } catch (e) {
      emptyHoltThrew = true;
    }
    assert(emptyHoltThrew === true, 'Empty input array to calculateHoltLinear throws clear validation error');

    let singlePointThrew = false;
    try {
      calculateHoltLinear([250], 7);
    } catch (e) {
      singlePointThrew = true;
    }
    assert(singlePointThrew === true, 'Single-observation array to calculateHoltLinear throws clear validation error');

    const shortBacktest = runChronologicalBacktest([100, 200, 300, 400], 2);
    assert(
      shortBacktest.hasSufficientDataForBacktest === false,
      'runChronologicalBacktest with < 5 observations returns hasSufficientDataForBacktest: false'
    );

    // 7.4: Less Than 5 Days Store History Gate via API
    const shortUserEmail = 'short_history_owner@test.com';
    await User.deleteMany({ email: shortUserEmail });
    const shortReg = await request(app).post('/api/auth/register').send({
      name: 'Short History Owner',
      email: shortUserEmail,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Short History Store',
      businessType: 'supermarket',
    });
    const shortToken = shortReg.body.data.token;
    const shortUserId = shortReg.body.data.user._id;

    // Add only 3 sales days
    for (let i = 1; i <= 3; i++) {
      await Sale.create({
        userId: shortUserId,
        productName: 'Sample Item',
        quantitySold: 2,
        unitPrice: 50,
        totalCost: 60,
        totalRevenue: 100,
        profit: 40,
        date: new Date(`2026-10-0${i}T10:00:00.000Z`),
      });
    }

    const shortForecastRes = await request(app)
      .get('/api/forecast/sales?horizon=7')
      .set('Authorization', `Bearer ${shortToken}`);

    assert(shortForecastRes.status === 200, 'Under-5-day store returns HTTP 200 with honest status');
    assert(
      shortForecastRes.body.data.hasSufficientData === false,
      'Under-5-day store returns hasSufficientData: false'
    );
    assert(
      shortForecastRes.body.data.minRequiredDays === 5,
      'Reports minimum 5 days required for statistical forecasting'
    );
    assert(
      shortForecastRes.body.data.distinctRecordedDays === 3,
      'Accurately reports distinctRecordedDays: 3'
    );

    // Clean up test data in isolated test database
    await Sale.deleteMany({ userId: { $in: [userId, shortUserId] } });
    await Product.deleteMany({ userId });
    await User.deleteMany({ _id: { $in: [userId, shortUserId] } });

    console.log(`\n🎉 [SUMMARY] Actual Sales Audit Suite: ${passed} Passed | ${failed} Failed`);
    if (failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error('❌ [FATAL ERROR in Actual Sales Audit Suite]:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

runActualSalesAuditSuite();
