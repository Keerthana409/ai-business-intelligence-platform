import '../config/testEnv.js';
import 'dotenv/config';
import http from 'http';
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
    assert(sampleHolt.dampingPhi === 0.5, `Default damping parameter phi is 0.5 (${sampleHolt.dampingPhi})`);
    assert(sampleHolt.finalLevel >= 0, `Sample series final level is non-negative (${sampleHolt.finalLevel})`);
    assert(sampleHolt.finalLevel === 3.3, `Sample series final level equals expected level 3.30 (${sampleHolt.finalLevel})`);
    assert(sampleHolt.finalTrend === 0.33, `Sample series final trend is positive 0.33 (${sampleHolt.finalTrend})`);
    assert(sampleHolt.forecast.length === 7, 'Sample series returns 7-day forecast');
    assert(sampleHolt.forecast.every((v) => v > 0), `Sample series forecast values are positive (${sampleHolt.forecast.join(', ')})`);
    const sample7DaySum = Number(sampleHolt.forecast.reduce((a, b) => a + b, 0).toFixed(2));
    assert(sample7DaySum === 25.08, `Sample series 7-day damped (phi=0.5) projected revenue is ₹25.08 (₹${sample7DaySum})`);

    const sampleUndampedHolt = calculateHoltLinear(sampleSeries, 7, 0.3, 0.1, 1.0);
    const sampleUndamped7DaySum = Number(sampleUndampedHolt.forecast.reduce((a, b) => a + b, 0).toFixed(2));
    assert(sampleUndamped7DaySum === 32.34, `Sample series 7-day undamped (phi=1.0) projected revenue is ₹32.34 (₹${sampleUndamped7DaySum})`);

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
    assert(sampleBacktest.metrics.mae === 12.39, `Sample damped backtest MAE is 12.39 (${sampleBacktest.metrics.mae})`);
    assert(sampleBacktest.metrics.rmse === 16.88, `Sample damped backtest RMSE is 16.88 (${sampleBacktest.metrics.rmse})`);
    assert(sampleBacktest.metrics.wape === 225.4, `Sample damped backtest WAPE is 225.4% (${sampleBacktest.metrics.wape}%)`);
    assert(sampleBacktest.formulationComparison.undamped.mae === 5.5, `Sample undamped comparison MAE is 5.5 (${sampleBacktest.formulationComparison.undamped.mae})`);
    assert(sampleBacktest.formulationComparison.undamped.rmse === 7.78, `Sample undamped comparison RMSE is 7.78 (${sampleBacktest.formulationComparison.undamped.rmse})`);
    assert(sampleBacktest.formulationComparison.undamped.wape === 100, `Sample undamped comparison WAPE is 100% (${sampleBacktest.formulationComparison.undamped.wape}%)`);

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

    console.log('\n--- 8. Random Forest Status, Reliability Separation & Fallback Message Verification ---');
    const prevMlUrl = process.env.ML_SERVICE_URL;
    const prevMlTimeout = process.env.ML_SERVICE_TIMEOUT_MS;

    // Spin up a controllable local HTTP stub server to simulate Python ML service states
    let stubMode = 'rf_success';
    let lastReceivedForecastPayload = null;
    const mlStubServer = http.createServer((req, res) => {
      res.setHeader('Connection', 'close');
      if (req.method === 'GET' && req.url === '/health') {
        if (stubMode === 'health_offline') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'unavailable' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            service: 'ai-bi-ml-service',
            sklearnVersion: '1.5.2',
            algorithms: {
              salesForecasting: 'RandomForestRegressor',
              productDemandForecasting: 'RandomForestRegressor',
              transactionAnomalyDetection: 'IsolationForest',
            },
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/api/ml/forecast/sales') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            lastReceivedForecastPayload = JSON.parse(body);
          } catch {
            lastReceivedForecastPayload = null;
          }

          if (stubMode === 'forecast_http_500') {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ detail: 'Simulated internal Random Forest training error' }));
            return;
          }

          if (stubMode === 'rf_failed_untrained') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                status: 'success',
                data: {
                  hasSufficientData: false,
                  mlTrained: false,
                  minRequiredDays: 14,
                  distinctRecordedDays: 30,
                  dateSpanDays: 30,
                  supervisedSampleCount: 0,
                  reason: 'Random Forest feature matrix singular during training.',
                },
              })
            );
            return;
          }

          // Default: rf_success (when >= 14 days) or <14 days gate
          const recs = lastReceivedForecastPayload?.records || [];
          const distinctDates = new Set(recs.map((r) => r.date)).size;
          const horizonReq = lastReceivedForecastPayload?.horizon || 7;
          if (distinctDates < 14) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                status: 'success',
                data: {
                  hasSufficientData: false,
                  mlTrained: false,
                  minRequiredDays: 14,
                  distinctRecordedDays: distinctDates,
                  dateSpanDays: distinctDates,
                  supervisedSampleCount: Math.max(0, distinctDates - 7),
                  reason: `Random Forest Regression requires at least 14 distinct recorded trading days (${14 - distinctDates} more day(s) needed).`,
                },
              })
            );
            return;
          }

          const preds = Array.from({ length: horizonReq }, (_, idx) => ({
            date: `2026-10-${String(idx + 1).padStart(2, '0')}`,
            forecastRevenue: Number((1800 + idx * 25).toFixed(2)),
            lowerBound: Number((1600 + idx * 25).toFixed(2)),
            upperBound: Number((2000 + idx * 25).toFixed(2)),
            uncertaintyMargin: 200,
          }));
          const totalProj = Number(preds.reduce((s, p) => s + p.forecastRevenue, 0).toFixed(2));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'success',
              data: {
                hasSufficientData: true,
                mlTrained: true,
                horizon: horizonReq,
                algorithm: 'Random Forest Regression (scikit-learn)',
                parameters: {
                  n_estimators: 100,
                  max_depth: 6,
                  min_samples_leaf: 2,
                  finalLevel: 1790,
                  finalTrend: 25,
                  featureImportances: { lag_1: 0.42, rolling_mean_7: 0.31 },
                  artifactPath: 'rf_sales_test.joblib',
                },
                historicalCoverage: {
                  startDate: '2026-09-01',
                  endDate: '2026-09-30',
                  distinctRecordedDays: distinctDates,
                  totalCalendarDays: distinctDates,
                  supervisedTrainingSamples: distinctDates - 7,
                },
                historicalActuals: recs.slice(-30).map((r) => ({
                  date: r.date,
                  value: r.amount,
                  isRecorded: true,
                })),
                predictions: preds,
                totalProjectedRevenue: totalProj,
                modelEvaluation: {
                  mae: 64.2,
                  rmse: 78.5,
                  wape: 3.6,
                  mape: 3.5,
                  mapeExplanation: 'Calculated across all historical holdout test observations.',
                  normalizedAccuracy: 96.4,
                  validationMethod: 'Random Forest Chronological Holdout',
                  isMLValidated: true,
                  isProvisional: false,
                  accuracyStatus: 'Verified (Random Forest Holdout)',
                  backtestTrainDays: 27,
                  supervisedTrainSamples: 20,
                  backtestTestDays: 3,
                  backtestActuals: [1750, 1800, 1820],
                  backtestPredictions: [1710, 1765, 1795],
                },
              },
            })
          );
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Not Found' }));
    });

    await new Promise((resolve) => mlStubServer.listen(0, '127.0.0.1', resolve));
    const stubPort = mlStubServer.address().port;
    process.env.ML_SERVICE_URL = `http://127.0.0.1:${stubPort}`;
    process.env.ML_SERVICE_TIMEOUT_MS = '2000';

    try {
      // 8A. Fewer than 14 trading days (8 distinct trading days for User B)
      await Sale.deleteMany({ userId: userBId });
      for (let d = 1; d <= 8; d++) {
        await Sale.create({
          userId: userBId,
          productName: 'Three Day Device',
          quantitySold: 5 + d,
          unitPrice: 100,
          totalRevenue: (5 + d) * 100,
          date: new Date(`2026-09-${String(d).padStart(2, '0')}T10:00:00Z`),
        });
      }

      stubMode = 'rf_success';
      const res8Days = await request(app)
        .get('/api/forecast/sales?horizon=7')
        .set('Authorization', `Bearer ${tokenB}`);

      assert(res8Days.status === 200, '8-day forecast returns HTTP 200');
      const d8 = res8Days.body.data;
      assert(d8.mlMetadata.distinctRecordedDays === 8, '8-day store reports distinctRecordedDays = 8');
      assert(d8.mlMetadata.minRequiredDaysForML === 14, '8-day store reports minRequiredDaysForML = 14');
      assert(d8.mlMetadata.additionalDaysNeededForML === 6, '8-day store reports additionalDaysNeededForML = 6');
      assert(d8.mlMetadata.meetsMinDaysRequirement === false, '8-day store reports meetsMinDaysRequirement = false');
      assert(d8.mlMetadata.mlAttempted === false, '8-day store reports mlAttempted = false (< 14 days)');
      assert(d8.mlMetadata.mlSucceeded === false, '8-day store reports mlSucceeded = false');
      assert(d8.mlMetadata.mlActive === false, '8-day store reports mlActive = false');
      assert(d8.mlMetadata.mlServiceOnline === true, '8-day store separately reports mlServiceOnline = true');
      assert(
        d8.mlMetadata.fallbackReason.includes('8 distinct recorded trading days') &&
          d8.mlMetadata.fallbackReason.includes('6 more days needed'),
        '8-day fallbackReason accurately reports 8 days recorded and 6 more days needed'
      );
      assert(
        d8.modelEvaluation.isMLValidated === false &&
          d8.modelEvaluation.accuracyStatus === 'Pending (Needs 14+ Days)',
        '8-day store does not claim verified ML reliability'
      );

      // Seed 30 distinct trading days for User B (2026-09-01 to 2026-09-30)
      await Sale.deleteMany({ userId: userBId });
      for (let d = 1; d <= 30; d++) {
        const rev = 1500 + d * 10;
        await Sale.create({
          userId: userBId,
          productName: 'Three Day Device',
          quantitySold: 15,
          unitPrice: rev / 15,
          totalRevenue: rev,
          date: new Date(`2026-09-${String(d).padStart(2, '0')}T10:00:00Z`),
        });
      }

      // 8B. 30 trading days with successful Random Forest training
      stubMode = 'rf_success';
      lastReceivedForecastPayload = null;
      const res30Success = await request(app)
        .get('/api/forecast/sales?horizon=7')
        .set('Authorization', `Bearer ${tokenB}`);

      assert(res30Success.status === 200, '30-day RF success returns HTTP 200');
      const d30Success = res30Success.body.data;
      assert(
        lastReceivedForecastPayload &&
          Array.isArray(lastReceivedForecastPayload.records) &&
          lastReceivedForecastPayload.records.length === 30 &&
          lastReceivedForecastPayload.records.every(
            (r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && typeof r.amount === 'number'
          ),
        'Backend sends all 30 normalized historical revenue records (YYYY-MM-DD + numeric amount) to Python ML service'
      );
      assert(d30Success.algorithm === 'Random Forest Regression (scikit-learn)', '30-day RF success uses Random Forest algorithm');
      assert(d30Success.mlMetadata.mlActive === true, '30-day RF success sets mlMetadata.mlActive = true');
      assert(d30Success.mlMetadata.mlAttempted === true, '30-day RF success sets mlMetadata.mlAttempted = true');
      assert(d30Success.mlMetadata.mlSucceeded === true, '30-day RF success sets mlMetadata.mlSucceeded = true');
      assert(d30Success.mlMetadata.mlServiceOnline === true, '30-day RF success sets mlMetadata.mlServiceOnline = true');
      assert(d30Success.mlMetadata.meetsMinDaysRequirement === true, '30-day RF success sets meetsMinDaysRequirement = true');
      assert(d30Success.mlMetadata.distinctRecordedDays === 30, '30-day RF success reports 30 distinct trading days');
      assert(d30Success.mlMetadata.additionalDaysNeededForML === 0, '30-day RF success reports 0 additional days needed');
      assert(d30Success.mlMetadata.fallbackReason === null, '30-day RF success has fallbackReason = null');
      assert(
        d30Success.modelEvaluation.isMLValidated === true &&
          d30Success.modelEvaluation.accuracyStatus === 'Verified (Random Forest Holdout)' &&
          d30Success.modelEvaluation.normalizedAccuracy === 96.4,
        '30-day RF success reports verified Random Forest holdout reliability score (96.4%)'
      );

      // 8C. 30 trading days with failed ML training (mlTrained: false) and statistical fallback
      stubMode = 'rf_failed_untrained';
      const res30Untrained = await request(app)
        .get('/api/forecast/sales?horizon=7')
        .set('Authorization', `Bearer ${tokenB}`);

      assert(res30Untrained.status === 200, '30-day failed ML training fallback returns HTTP 200');
      const d30Untrained = res30Untrained.body.data;
      assert(d30Untrained.algorithm === "Holt's Linear Exponential Smoothing", '30-day failed ML training falls back to Holt Linear');
      assert(d30Untrained.mlMetadata.mlActive === false, '30-day failed ML training sets mlActive = false (never forced true)');
      assert(d30Untrained.mlMetadata.mlAttempted === true, '30-day failed ML training sets mlAttempted = true');
      assert(d30Untrained.mlMetadata.mlSucceeded === false, '30-day failed ML training sets mlSucceeded = false');
      assert(d30Untrained.mlMetadata.meetsMinDaysRequirement === true, '30-day failed ML training sets meetsMinDaysRequirement = true');
      assert(d30Untrained.mlMetadata.distinctRecordedDays === 30, '30-day failed ML training reports 30 distinct trading days');
      assert(
        !d30Untrained.mlMetadata.fallbackReason.includes('more days needed') &&
          !d30Untrained.mlMetadata.fallbackReason.includes('0 more days') &&
          d30Untrained.mlMetadata.fallbackReason.includes('Random Forest feature matrix singular'),
        `30-day failed ML fallbackReason reports actual backend reason and never claims more days are needed (got: "${d30Untrained.mlMetadata.fallbackReason}")`
      );
      assert(
        d30Untrained.modelEvaluation.isMLValidated === false &&
          d30Untrained.modelEvaluation.accuracyStatus === 'Statistical Holdout Only (ML Inactive)' &&
          d30Untrained.modelEvaluation.statisticalBacktestStatus === 'Verified (Statistical Holdout)' &&
          d30Untrained.modelEvaluation.mlValidationStatus === 'Unavailable (Random Forest Fallback)',
        '30-day failed ML fallback separates statistical backtest status from ML validation status and does NOT display a verified ML reliability score'
      );

      // 8D. 30 trading days with Python service online (/health 200) but forecast request failing (HTTP 500)
      stubMode = 'forecast_http_500';
      const res30Http500 = await request(app)
        .get('/api/forecast/sales?horizon=7')
        .set('Authorization', `Bearer ${tokenB}`);

      assert(res30Http500.status === 200, '30-day HTTP 500 forecast failure gracefully returns HTTP 200 fallback');
      const d30Http500 = res30Http500.body.data;
      assert(
        d30Http500.mlMetadata.mlServiceOnline === true,
        'Python service health status remains online (true) when /health succeeds even if forecast endpoint fails'
      );
      assert(
        d30Http500.mlMetadata.mlAttempted === true &&
          d30Http500.mlMetadata.mlSucceeded === false &&
          d30Http500.mlMetadata.mlActive === false,
        'Reports mlAttempted = true, mlSucceeded = false, mlActive = false when forecast request fails'
      );
      assert(
        d30Http500.mlMetadata.fallbackReason.includes('30 distinct trading days') &&
          d30Http500.mlMetadata.fallbackReason.includes('HTTP 500') &&
          !d30Http500.mlMetadata.fallbackReason.includes('more days needed'),
        `Reports exact HTTP 500 failure reason without claiming more days are needed (got: "${d30Http500.mlMetadata.fallbackReason}")`
      );
    } finally {
      mlStubServer.closeAllConnections?.();
      await new Promise((resolve) => mlStubServer.close(resolve));
      if (prevMlUrl === undefined) {
        delete process.env.ML_SERVICE_URL;
      } else {
        process.env.ML_SERVICE_URL = prevMlUrl;
      }
      if (prevMlTimeout === undefined) {
        delete process.env.ML_SERVICE_TIMEOUT_MS;
      } else {
        process.env.ML_SERVICE_TIMEOUT_MS = prevMlTimeout;
      }
    }

    // Clean up
    await Product.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Sale.deleteMany({ userId: { $in: [userAId, userBId] } });
    await User.deleteMany({ _id: { $in: [userAId, userBId] } });

    console.log(`\n========================================`);
    console.log(`🎉 [COMPLETED] Module 4 Tests: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    process.exitCode = failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('💥 [TEST ERROR]:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

runModule4Tests();
