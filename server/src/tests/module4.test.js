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
  calculateHoltLinear,
  calculateEvaluationMetrics,
  runChronologicalBacktest,
  alignDailyTimeSeries,
} from '../utils/forecastingEngine.js';

async function runModule4Tests() {
  console.log('🧪 [START] Running Module 4: Predictive Analytics & ML Tests...\n');
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

    console.log('--- 1. Pure Mathematical & Statistical Engine Unit Tests ---');
    // Test 1.1: Holt's Linear Exponential Smoothing on linear upward trend
    const linearSeries = [10, 20, 30, 40, 50];
    const holtResult = calculateHoltLinear(linearSeries, 3, 0.5, 0.5);
    assert(holtResult.forecast.length === 3, 'Holt forecast returns exact horizon length (3)');
    assert(holtResult.forecast[0] > 50, 'Forecast continues upward trajectory beyond 50');
    assert(holtResult.forecast[1] > holtResult.forecast[0], 'Forecast step 2 is greater than step 1');
    assert(holtResult.forecast.every((v) => v >= 0), 'All forecast values are strictly non-negative');

    // Test 1.1b: Exact sample series [1200, 450, 640, 720, 300, 300, 0, 0, 11]
    const sampleSeries = [1200, 450, 640, 720, 300, 300, 0, 0, 11];
    const sampleHolt = calculateHoltLinear(sampleSeries, 7, 0.3, 0.1);
    assert(sampleHolt.finalLevel >= 0, `Sample series final level is non-negative (${sampleHolt.finalLevel})`);
    assert(sampleHolt.finalLevel === 3.3, `Sample series final level equals expected level 3.30 (${sampleHolt.finalLevel})`);
    assert(sampleHolt.finalTrend === 0.33, `Sample series final trend is positive 0.33 (${sampleHolt.finalTrend})`);
    assert(sampleHolt.forecast.length === 7, 'Sample series returns 7-day forecast');
    assert(sampleHolt.forecast.every((v) => v > 0), `Sample series forecast values are positive (${sampleHolt.forecast.join(', ')})`);
    const sample7DaySum = Number(sampleHolt.forecast.reduce((a, b) => a + b, 0).toFixed(2));
    assert(sample7DaySum === 32.34, `Sample series 7-day projected revenue is $32.34 ($${sample7DaySum})`);

    // Test 1.1c: Negative initial trend [100, 80, 70, 60, 50, 40, 30]
    const negTrendSeries = [100, 80, 70, 60, 50, 40, 30];
    const negTrendHolt = calculateHoltLinear(negTrendSeries, 5, 0.3, 0.1);
    assert(negTrendHolt.finalLevel >= 0, 'Negative trend series maintains non-negative level');
    assert(negTrendHolt.forecast.every((v) => v >= 0), 'Negative trend forecast never plunges below zero');

    // Test 1.1d: Strictly decreasing trend [50, 40, 30, 20, 10]
    const decSeries = [50, 40, 30, 20, 10];
    const decHolt = calculateHoltLinear(decSeries, 5, 0.3, 0.1);
    assert(decHolt.finalLevel === 10, 'Decreasing series final level matches baseline (10)');
    assert(decHolt.forecast.every((v) => v >= 0), 'Decreasing series forecast values are bounded non-negative (0)');

    // Test 1.1e: Constant sales [50, 50, 50, 50, 50]
    const constSeries = [50, 50, 50, 50, 50];
    const constHolt = calculateHoltLinear(constSeries, 5, 0.3, 0.1);
    assert(constHolt.finalLevel === 50, 'Constant sales final level is 50');
    assert(constHolt.finalTrend === 0, 'Constant sales final trend is 0');
    assert(constHolt.forecast.every((v) => v === 50), 'Constant sales forecasts all equal 50');

    // Test 1.1f: Zero-sales days intermittent [100, 0, 100, 0, 100]
    const zeroDaysSeries = [100, 0, 100, 0, 100];
    const zeroDaysHolt = calculateHoltLinear(zeroDaysSeries, 5, 0.3, 0.1);
    assert(zeroDaysHolt.finalLevel > 0, 'Intermittent zero-sales series maintains positive level');
    assert(zeroDaysHolt.forecast.every((v) => v >= 0), 'Intermittent series forecast is non-negative');

    // Test 1.2: Evaluation Metrics Calculation (MAE & RMSE)
    const actuals = [100, 110, 120];
    const predicted = [105, 108, 125];
    const evalMetrics = calculateEvaluationMetrics(actuals, predicted);
    // |100-105|=5, |110-108|=2, |120-125|=5 -> MAE = (5+2+5)/3 = 4.0
    assert(evalMetrics.mae === 4.0, 'MAE calculated accurately (4.0)');
    // sqrt((25 + 4 + 25) / 3) = sqrt(54 / 3) = sqrt(18) = 4.24
    assert(evalMetrics.rmse === 4.24, 'RMSE calculated accurately (4.24)');
    assert(evalMetrics.wape > 0, 'WAPE is calculated');
    assert(evalMetrics.normalizedAccuracy > 0, 'Normalized accuracy indicator is present');

    // Test 1.3: Zero Actuals Handling in MAPE (No Infinity or NaN)
    const zeroActuals = [0, 0, 10];
    const zeroPreds = [2, 1, 9];
    const zeroMetrics = calculateEvaluationMetrics(zeroActuals, zeroPreds);
    assert(Number.isFinite(zeroMetrics.mae), 'MAE is finite when actuals include 0');
    assert(Number.isFinite(zeroMetrics.rmse), 'RMSE is finite when actuals include 0');
    assert(zeroMetrics.mape !== Infinity && !isNaN(zeroMetrics.mape), 'MAPE does NOT divide by zero or evaluate to Infinity/NaN');
    assert(zeroMetrics.mapeExplanation.includes('non-zero sales'), 'Explanation details zero handling');

    // Test 1.4: Chronological Backtesting (No future data leakage)
    const backtestSeries = [10, 15, 20, 25, 30, 35, 40];
    const backtestRes = runChronologicalBacktest(backtestSeries, 2);
    assert(backtestRes.hasSufficientDataForBacktest === true, 'Backtest succeeds with 7 points');
    assert(backtestRes.trainSize === 5, 'Train set contains first 5 historical points');
    assert(backtestRes.testSize === 2, 'Test set contains last 2 holdout points');
    assert(backtestRes.testActuals.length === 2 && backtestRes.testPredictions.length === 2, 'Holdout actuals and predictions align');

    // Test 1.4b: Chronological Backtesting on sample series [1200, 450, 640, 720, 300, 300, 0, 0, 11]
    const sampleBacktest = runChronologicalBacktest(sampleSeries, 3);
    assert(sampleBacktest.hasSufficientDataForBacktest === true, 'Sample series backtest succeeds');
    assert(sampleBacktest.trainSize === 7, 'Sample backtest train size is 7 (days 1-7)');
    assert(sampleBacktest.testSize === 2, 'Sample backtest test size is 2 (days 8-9)');
    assert(sampleBacktest.metrics.mae === 5.5, `Sample backtest MAE is 5.5 (${sampleBacktest.metrics.mae})`);
    assert(sampleBacktest.metrics.rmse === 7.78, `Sample backtest RMSE is 7.78 (${sampleBacktest.metrics.rmse})`);
    assert(sampleBacktest.metrics.wape === 100, `Sample backtest WAPE is 100% (${sampleBacktest.metrics.wape}%)`);

    // Test 1.5: Continuous Time-Series Alignment & Zero-Sales Days
    const discreteRecords = [
      { date: '2026-10-01', amount: 50 },
      { date: '2026-10-03', amount: 80 }, // 2026-10-02 has 0 sales
    ];
    const aligned = alignDailyTimeSeries(discreteRecords);
    assert(aligned.series.length === 3, 'Aligned series contains 3 calendar days (Oct 1, 2, 3)');
    assert(aligned.series[1].date === '2026-10-02' && aligned.series[1].value === 0, 'Missing Oct 2 correctly filled with 0 recorded sales');
    assert(aligned.series[1].isRecorded === false, 'Oct 2 marked as unrecorded zero-sales day');
    assert(aligned.distinctRecordedDays === 2, 'Distinct recorded days count is 2');

    console.log('\n--- 2. Route Protection & Security ---');
    const emailA = 'm4_owner_a@test.com';
    const emailB = 'm4_owner_b@test.com';
    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    // Register User A
    const resRegA = await request(app).post('/api/auth/register').send({
      name: 'Retailer A',
      email: emailA,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Supermarket A',
      businessType: 'supermarket',
    });
    const tokenA = resRegA.body.data.token;
    const userAId = resRegA.body.data.user._id;

    // Register User B
    const resRegB = await request(app).post('/api/auth/register').send({
      name: 'Retailer B',
      email: emailB,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Boutique B',
      businessType: 'clothing',
    });
    const tokenB = resRegB.body.data.token;
    const userBId = resRegB.body.data.user._id;

    // Clean test collections
    await Product.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Sale.deleteMany({ userId: { $in: [userAId, userBId] } });

    // Verify 401 for unauthenticated calls
    const forecastEndpoints = [
      '/api/forecast/sales',
      '/api/forecast/demand',
      '/api/forecast/inventory-risk',
      '/api/forecast/evaluation',
    ];
    for (const ep of forecastEndpoints) {
      const res = await request(app).get(ep);
      assert(res.status === 401, `Unauthenticated ${ep} returns 401`);
    }

    console.log('\n--- 3. Insufficient Historical Data Gate (< 5 Days) ---');
    // Call forecast with 0 data
    const resEmptySales = await request(app)
      .get('/api/forecast/sales')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resEmptySales.status === 200, 'Empty sales forecast returns 200 status');
    assert(resEmptySales.body.data.hasSufficientData === false, 'hasSufficientData is false for new store');
    assert(resEmptySales.body.data.minRequiredDays === 5, 'Reports 5 minimum required days');
    assert(resEmptySales.body.data.distinctRecordedDays === 0, 'Reports 0 distinct days recorded');
    assert(resEmptySales.body.data.guidance !== undefined, 'Provides actionable guidance without fake numbers');

    // Add only 2 days of sales
    await Sale.create({
      userId: userAId,
      productName: 'Sample Milk',
      quantitySold: 2,
      unitPrice: 5.0,
      totalRevenue: 10.0,
      date: new Date('2026-10-01T10:00:00Z'),
    });
    await Sale.create({
      userId: userAId,
      productName: 'Sample Milk',
      quantitySold: 3,
      unitPrice: 5.0,
      totalRevenue: 15.0,
      date: new Date('2026-10-02T10:00:00Z'),
    });

    const res2Days = await request(app)
      .get('/api/forecast/sales')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(res2Days.body.data.hasSufficientData === false, 'hasSufficientData remains false with only 2 days');
    assert(res2Days.body.data.distinctRecordedDays === 2, 'Reports 2 distinct days recorded');

    console.log('\n--- 4. End-to-End Sales Forecast (>= 5 Days) ---');
    // Add 5 more days (Total 7 distinct days: 2026-10-01 to 2026-10-07)
    const moreSales = [
      { date: '2026-10-03', qty: 4, rev: 20 },
      { date: '2026-10-04', qty: 5, rev: 25 },
      { date: '2026-10-05', qty: 6, rev: 30 },
      { date: '2026-10-06', qty: 7, rev: 35 },
      { date: '2026-10-07', qty: 8, rev: 40 },
    ];
    for (const s of moreSales) {
      await Sale.create({
        userId: userAId,
        productName: 'Sample Milk',
        quantitySold: s.qty,
        unitPrice: 5.0,
        totalRevenue: s.rev,
        date: new Date(`${s.date}T10:00:00Z`),
      });
    }

    const res7Days = await request(app)
      .get('/api/forecast/sales?horizon=7')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(res7Days.status === 200, 'Sales forecast returns 200');
    assert(res7Days.body.data.hasSufficientData === true, 'hasSufficientData is true with 7 days');
    assert(res7Days.body.data.algorithm === "Holt's Linear Exponential Smoothing", 'Algorithm name is transparent');
    assert(res7Days.body.data.predictions.length === 7, 'Generates exactly 7 days of predictions');
    assert(res7Days.body.data.predictions[0].date === '2026-10-08', 'First forecast date is day after latest actual (2026-10-08)');
    assert(res7Days.body.data.predictions[6].date === '2026-10-14', 'Seventh forecast date is 2026-10-14');
    assert(res7Days.body.data.predictions[0].forecastRevenue > 0, 'Forecast revenue is positive');
    assert(res7Days.body.data.predictions[0].lowerBound >= 0, 'Lower uncertainty bound is bounded non-negative');
    assert(res7Days.body.data.predictions[0].upperBound >= res7Days.body.data.predictions[0].forecastRevenue, 'Upper bound is greater than or equal to forecast');
    assert(res7Days.body.data.modelEvaluation !== null, 'Chronological backtest evaluation metrics are included');
    assert(Number.isFinite(res7Days.body.data.modelEvaluation.mae), 'Backtest MAE is finite');
    assert(Number.isFinite(res7Days.body.data.modelEvaluation.rmse), 'Backtest RMSE is finite');
    assert(res7Days.body.data.transparency.uncertaintyMethod.includes('Approximate Uncertainty Range'), 'Uncertainty band clearly labelled as approximate empirical variation');

    console.log('\n--- 5. Product Demand Prediction & Inventory Risk ---');
    // Product 1: In stock with steady sales -> High risk / low stock soon
    const prod1 = await Product.create({
      userId: userAId,
      sku: 'MILK-M4',
      name: 'Sample Milk',
      category: 'Dairy',
      costPrice: 3.0,
      sellingPrice: 5.0,
      stockQuantity: 12,
      reorderThreshold: 10,
      leadTimeDays: 5,
    });

    // Product 2: Completely Out of Stock
    const prod2 = await Product.create({
      userId: userAId,
      sku: 'BREAD-M4',
      name: 'Whole Wheat Bread',
      category: 'Bakery',
      costPrice: 2.0,
      sellingPrice: 4.0,
      stockQuantity: 0,
      reorderThreshold: 8,
      leadTimeDays: 3,
    });

    // Product 3: High Stock / Safe
    const prod3 = await Product.create({
      userId: userAId,
      sku: 'RICE-M4',
      name: 'Basmati Rice 5kg',
      category: 'Grains',
      costPrice: 8.0,
      sellingPrice: 15.0,
      stockQuantity: 200,
      reorderThreshold: 15,
      leadTimeDays: 7,
    });

    // Product 4: Zero Sales History
    const prod4 = await Product.create({
      userId: userAId,
      sku: 'TEA-M4',
      name: 'Herbal Green Tea',
      category: 'Beverages',
      costPrice: 4.0,
      sellingPrice: 8.0,
      stockQuantity: 25,
      reorderThreshold: 10,
      leadTimeDays: 4,
    });

    // Test /api/forecast/demand
    const resDemand = await request(app)
      .get('/api/forecast/demand')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(resDemand.status === 200, '/demand returns 200');
    assert(resDemand.body.data.length === 4, 'Evaluates all 4 products');

    const milkDemand = resDemand.body.data.find((p) => p.sku === 'MILK-M4');
    assert(milkDemand.hasSufficientData === true, 'Milk has sufficient sales history');
    assert(milkDemand.avgDailyDemand > 0, 'Milk average daily demand is positive');
    assert(milkDemand.runoutDays > 0, 'Milk runout days is calculated');

    const teaDemand = resDemand.body.data.find((p) => p.sku === 'TEA-M4');
    assert(teaDemand.hasSufficientData === false, 'Tea with zero sales honestly reports hasSufficientData: false');
    assert(teaDemand.projectedDailyDemand === 0, 'Tea demand is not fabricated');

    // Test /api/forecast/inventory-risk
    const resRisk = await request(app)
      .get('/api/forecast/inventory-risk')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(resRisk.status === 200, '/inventory-risk returns 200');
    const riskItems = resRisk.body.data;
    assert(riskItems.length === 4, 'Returns all products prioritized by risk');
    assert(riskItems[0].status === 'Out of Stock', 'Out of stock item (Bread) is sorted first');
    assert(riskItems[0].runoutDays === 0, 'Out of stock runout days is 0');

    console.log('\n--- 6. Multi-Tenant Data Isolation ---');
    // User B calls sales forecast -> has 0 sales -> must get insufficient data
    const resBSales = await request(app)
      .get('/api/forecast/sales')
      .set('Authorization', `Bearer ${tokenB}`);
    assert(resBSales.body.data.hasSufficientData === false, 'User B hasSufficientData is false');
    assert(resBSales.body.data.distinctRecordedDays === 0, 'User B has 0 recorded days');

    // User B calls inventory risk -> User B has 0 products
    const resBRisk = await request(app)
      .get('/api/forecast/inventory-risk')
      .set('Authorization', `Bearer ${tokenB}`);
    assert(resBRisk.body.data.length === 0, 'User B sees 0 products in inventory risk');

    // User A still has valid forecasts unaffected by User B
    const resAConfirm = await request(app)
      .get('/api/forecast/sales')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resAConfirm.body.data.hasSufficientData === true, 'User A forecast remains fully intact');

    console.log('\n--- 7. Product-Level Demand & Inventory Risk Regression Tests ---');

    // Regression 7.1 & 7.4: One distinct sales day with MULTIPLE sales on the same day
    // - Must aggregate quantities correctly (5 + 7 = 12)
    // - Must count that date as ONLY ONE distinct sales day
    // - hasSufficientData must be FALSE
    const prodReg1 = await Product.create({
      userId: userAId,
      sku: 'REG-1DAY',
      name: 'Single Day Widget',
      category: 'Hardware',
      costPrice: 5.0,
      sellingPrice: 10.0,
      stockQuantity: 50,
      reorderThreshold: 10,
      leadTimeDays: 5,
    });
    // Two sales on same day: 2026-10-15 (quantities 5 and 7)
    await Sale.create({
      userId: userAId,
      productId: prodReg1._id,
      productName: 'Single Day Widget',
      quantitySold: 5,
      unitPrice: 10.0,
      totalRevenue: 50.0,
      date: new Date('2026-10-15T09:00:00Z'),
    });
    await Sale.create({
      userId: userAId,
      productId: prodReg1._id,
      productName: 'Single Day Widget',
      quantitySold: 7,
      unitPrice: 10.0,
      totalRevenue: 70.0,
      date: new Date('2026-10-15T15:30:00Z'),
    });

    // Regression 7.2: Product history with TWO distinct sales days
    // - hasSufficientData must be FALSE
    const prodReg2 = await Product.create({
      userId: userAId,
      sku: 'REG-2DAY',
      name: 'Two Day Gadget',
      category: 'Electronics',
      costPrice: 15.0,
      sellingPrice: 25.0,
      stockQuantity: 40,
      reorderThreshold: 10,
      leadTimeDays: 4,
    });
    await Sale.create({
      userId: userAId,
      productId: prodReg2._id,
      productName: 'Two Day Gadget',
      quantitySold: 4,
      unitPrice: 25.0,
      totalRevenue: 100.0,
      date: new Date('2026-10-15T10:00:00Z'),
    });
    await Sale.create({
      userId: userAId,
      productId: prodReg2._id,
      productName: 'Two Day Gadget',
      quantitySold: 6,
      unitPrice: 25.0,
      totalRevenue: 150.0,
      date: new Date('2026-10-16T10:00:00Z'),
    });

    // Regression 7.3: Product history with THREE distinct sales days
    // - Verify minimum-history rule: hasSufficientData must be TRUE
    const prodReg3 = await Product.create({
      userId: userAId,
      sku: 'REG-3DAY',
      name: 'Three Day Device',
      category: 'Electronics',
      costPrice: 20.0,
      sellingPrice: 35.0,
      stockQuantity: 60,
      reorderThreshold: 15,
      leadTimeDays: 5,
    });
    await Sale.create({
      userId: userAId,
      productId: prodReg3._id,
      productName: 'Three Day Device',
      quantitySold: 3,
      unitPrice: 35.0,
      totalRevenue: 105.0,
      date: new Date('2026-10-15T10:00:00Z'),
    });
    await Sale.create({
      userId: userAId,
      productId: prodReg3._id,
      productName: 'Three Day Device',
      quantitySold: 5,
      unitPrice: 35.0,
      totalRevenue: 175.0,
      date: new Date('2026-10-16T10:00:00Z'),
    });
    await Sale.create({
      userId: userAId,
      productId: prodReg3._id,
      productName: 'Three Day Device',
      quantitySold: 4,
      unitPrice: 35.0,
      totalRevenue: 140.0,
      date: new Date('2026-10-17T10:00:00Z'),
    });

    // Regression 7.5 & 7.6: Product-name fallback with differing capitalization AND whitespace
    // - Sale has productId = null
    // - Sale productName differs in case ('cheddar cheese' vs 'Cheddar Cheese') and has whitespace
    const prodReg4 = await Product.create({
      userId: userAId,
      sku: 'REG-CHEESE',
      name: '  Cheddar Cheese  ',
      category: 'Dairy',
      costPrice: 3.0,
      sellingPrice: 6.0,
      stockQuantity: 45,
      reorderThreshold: 10,
      leadTimeDays: 3,
    });
    await Sale.create({
      userId: userAId,
      productId: null,
      productName: 'cheddar cheese',
      quantitySold: 2,
      unitPrice: 6.0,
      totalRevenue: 12.0,
      date: new Date('2026-10-15T10:00:00Z'),
    });
    await Sale.create({
      userId: userAId,
      productId: null,
      productName: '  CHEDDAR CHEESE  ',
      quantitySold: 4,
      unitPrice: 6.0,
      totalRevenue: 24.0,
      date: new Date('2026-10-16T10:00:00Z'),
    });
    await Sale.create({
      userId: userAId,
      productId: null,
      productName: 'Cheddar Cheese',
      quantitySold: 3,
      unitPrice: 6.0,
      totalRevenue: 18.0,
      date: new Date('2026-10-17T10:00:00Z'),
    });

    // Regression 7.7: Regex special characters in product name (e.g. parentheses, plus sign)
    // - Must be treated literally, not as regex control patterns
    const prodReg5 = await Product.create({
      userId: userAId,
      sku: 'REG-SPECIAL',
      name: 'Energy Drink (500ml) + Calcium',
      category: 'Beverages',
      costPrice: 2.0,
      sellingPrice: 4.5,
      stockQuantity: 50,
      reorderThreshold: 12,
      leadTimeDays: 4,
    });
    await Sale.create({
      userId: userAId,
      productId: null, // Test name fallback with special characters
      productName: 'energy drink (500ml) + calcium',
      quantitySold: 5,
      unitPrice: 4.5,
      totalRevenue: 22.5,
      date: new Date('2026-10-15T10:00:00Z'),
    });
    await Sale.create({
      userId: userAId,
      productId: null,
      productName: 'ENERGY DRINK (500ML) + CALCIUM',
      quantitySold: 6,
      unitPrice: 4.5,
      totalRevenue: 27.0,
      date: new Date('2026-10-16T10:00:00Z'),
    });
    await Sale.create({
      userId: userAId,
      productId: null,
      productName: 'Energy Drink (500ml) + Calcium',
      quantitySold: 7,
      unitPrice: 4.5,
      totalRevenue: 31.5,
      date: new Date('2026-10-17T10:00:00Z'),
    });

    // Regression 7.8: Zero-stock product with INSUFFICIENT sales history (1 day)
    // - Must remain marked "Out of Stock"
    // - Must have runoutDays = 0
    // - Must retain hasSufficientData = false
    // - Must sort to highest priority in inventory risk
    const prodReg6 = await Product.create({
      userId: userAId,
      sku: 'REG-ZERO-INSUF',
      name: 'Zero Stock Deficit Item',
      category: 'Bakery',
      costPrice: 1.0,
      sellingPrice: 3.0,
      stockQuantity: 0,
      reorderThreshold: 10,
      leadTimeDays: 2,
    });
    await Sale.create({
      userId: userAId,
      productId: prodReg6._id,
      productName: 'Zero Stock Deficit Item',
      quantitySold: 8,
      unitPrice: 3.0,
      totalRevenue: 24.0,
      date: new Date('2026-10-15T10:00:00Z'),
    });

    // Regression 7.9: Cross-tenant sales contamination protection
    // - Create product for User B with identical name as prodReg3
    const prodReg7B = await Product.create({
      userId: userBId,
      sku: 'REG-3DAY-USERB',
      name: 'Three Day Device',
      category: 'Electronics',
      costPrice: 20.0,
      sellingPrice: 35.0,
      stockQuantity: 80,
      reorderThreshold: 15,
      leadTimeDays: 5,
    });

    // Fetch /api/forecast/demand for User A
    const resRegDemand = await request(app)
      .get('/api/forecast/demand')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resRegDemand.status === 200, 'Regression /demand endpoint returns 200');

    // 1 & 4. Single sales day item with multiple transactions on same day
    const r1Item = resRegDemand.body.data.find((p) => p.sku === 'REG-1DAY');
    assert(r1Item.hasSufficientData === false, '1-day product honestly reports hasSufficientData: false');
    assert(r1Item.distinctRecordedDays === 1, 'Multiple sales on same date count as exactly 1 distinct sales day (5+7=12 units)');
    assert(r1Item.projectedDailyDemand === 0, '1-day product does not fabricate projected daily demand');

    // 2. Two distinct sales days item
    const r2Item = resRegDemand.body.data.find((p) => p.sku === 'REG-2DAY');
    assert(r2Item.hasSufficientData === false, '2-day product honestly reports hasSufficientData: false');
    assert(r2Item.distinctRecordedDays === 2, '2-day product accurately reports distinctRecordedDays: 2');

    // 3. Three distinct sales days item
    const r3Item = resRegDemand.body.data.find((p) => p.sku === 'REG-3DAY');
    assert(r3Item.hasSufficientData === true, '3-day product satisfies minimum-history rule (hasSufficientData: true)');
    assert(r3Item.distinctRecordedDays === 3, '3-day product reports distinctRecordedDays: 3');
    assert(r3Item.avgDailyDemand > 0, '3-day product generates valid positive daily demand projection');
    assert(r3Item.totalProjectedDemand > 0, '3-day product generates valid total projected demand');

    // 5 & 6. Product-name fallback with differing case and whitespace
    const r4Item = resRegDemand.body.data.find((p) => p.sku === 'REG-CHEESE');
    assert(r4Item.hasSufficientData === true, 'Name fallback matches sales despite case variations and catalog whitespace');
    assert(r4Item.distinctRecordedDays === 3, 'Name fallback matches all 3 distinct sales days');
    assert(r4Item.avgDailyDemand > 0, 'Name fallback computes positive daily demand');

    // 7. Regex special characters handling
    const r5Item = resRegDemand.body.data.find((p) => p.sku === 'REG-SPECIAL');
    assert(r5Item.hasSufficientData === true, 'Special character product name treated literally and matches all sales');
    assert(r5Item.distinctRecordedDays === 3, 'Special character product reports distinctRecordedDays: 3');

    // 8. Zero-stock product with insufficient history in /inventory-risk
    const resRegRisk = await request(app)
      .get('/api/forecast/inventory-risk')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resRegRisk.status === 200, 'Regression /inventory-risk endpoint returns 200');

    const r6Risk = resRegRisk.body.data.find((p) => p.sku === 'REG-ZERO-INSUF');
    assert(r6Risk.status === 'Out of Stock', 'Zero-stock item with 1 sales day remains marked "Out of Stock"');
    assert(r6Risk.runoutDays === 0, 'Zero-stock item reports runoutDays = 0');
    assert(r6Risk.hasSufficientData === false, 'Zero-stock item retains hasSufficientData: false');

    // Check that all Out of Stock items are prioritized first in /inventory-risk
    const outOfStockItems = resRegRisk.body.data.filter((p) => p.status === 'Out of Stock');
    const firstItems = resRegRisk.body.data.slice(0, outOfStockItems.length);
    assert(firstItems.every((p) => p.status === 'Out of Stock'), 'All Out of Stock products are sorted with Priority 1 at the top of inventory risk');

    // 9. Tenant isolation
    const resRegDemandB = await request(app)
      .get('/api/forecast/demand')
      .set('Authorization', `Bearer ${tokenB}`);
    const r7BDemand = resRegDemandB.body.data.find((p) => p.sku === 'REG-3DAY-USERB');
    assert(r7BDemand.distinctRecordedDays === 0, 'User B product does NOT inherit User A sales of same product name');
    assert(r7BDemand.hasSufficientData === false, 'User B product hasSufficientData remains false');

    // Clean up
    await Product.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Sale.deleteMany({ userId: { $in: [userAId, userBId] } });
    await User.deleteMany({ _id: { $in: [userAId, userBId] } });

    console.log(`\n========================================`);
    console.log(`🎉 [COMPLETED] Module 4 Tests: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('💥 [TEST ERROR]:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

runModule4Tests();
