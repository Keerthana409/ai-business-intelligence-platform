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
  calculateQuantile,
  calculateQuartiles,
  calculateMAD,
  calculateModifiedZScores,
  calculateTrailingBaseline,
  detectDailyAnomalies,
  detectTransactionOutliers,
} from '../utils/anomalyEngine.js';

async function runModule5Tests() {
  console.log('🧪 [START] Running Module 5: Anomaly Detection Tests...\n');
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

    console.log('--- 1. Pure Statistical Engine Unit Tests ---');

    // 1.1: NIST Type 7 Quantile Interpolation
    const sortedSample = [10, 20, 30, 40, 50];
    assert(calculateQuantile(sortedSample, 0) === 10, 'NIST Type 7 p=0 returns minimum value (10)');
    assert(calculateQuantile(sortedSample, 1) === 50, 'NIST Type 7 p=1 returns maximum value (50)');
    assert(calculateQuantile(sortedSample, 0.5) === 30, 'NIST Type 7 p=0.5 returns exact median (30)');
    assert(calculateQuantile(sortedSample, 0.25) === 20, 'NIST Type 7 p=0.25 on 5 items returns Q1 (20)');
    assert(calculateQuantile(sortedSample, 0.75) === 40, 'NIST Type 7 p=0.75 on 5 items returns Q3 (40)');

    // Even length array interpolation [10, 20, 30, 40]
    const evenSorted = [10, 20, 30, 40];
    assert(calculateQuantile(evenSorted, 0.5) === 25, 'NIST Type 7 p=0.5 on [10, 20, 30, 40] returns 25.0');
    assert(calculateQuantile(evenSorted, 0.25) === 17.5, 'NIST Type 7 p=0.25 on [10, 20, 30, 40] returns 17.5');
    assert(calculateQuantile(evenSorted, 0.75) === 32.5, 'NIST Type 7 p=0.75 on [10, 20, 30, 40] returns 32.5');

    // Edge cases for Quantile
    assert(calculateQuantile([], 0.5) === 0, 'Quantile on empty array returns 0');
    assert(calculateQuantile([42], 0.5) === 42, 'Quantile on single-item array returns single value');
    assert(calculateQuantile([10, 20], -0.5) === 10, 'Quantile on p < 0 clamps to min');
    assert(calculateQuantile([10, 20], 1.5) === 20, 'Quantile on p > 1 clamps to max');

    // 1.2: Quartiles and IQR calculations
    const series10 = [100, 110, 105, 115, 120, 100, 110, 105, 450, 10];
    const qRes = calculateQuartiles(series10);
    assert(qRes.count === 10, 'calculateQuartiles handles 10 items');
    assert(qRes.min === 10, 'Quartiles min is 10');
    assert(qRes.max === 450, 'Quartiles max is 450');
    assert(qRes.median > qRes.q1, 'Median is strictly greater than Q1');
    assert(qRes.q3 > qRes.median, 'Q3 is strictly greater than Median');
    assert(qRes.iqr === Number((qRes.q3 - qRes.q1).toFixed(2)), 'IQR equals Q3 - Q1');

    // 1.3: Zero Variance / Constant Series Handling
    const flatSeries = [50, 50, 50, 50, 50, 50, 50];
    const flatQ = calculateQuartiles(flatSeries);
    assert(flatQ.iqr === 0, 'Flat series produces raw IQR = 0');
    assert(flatQ.median === 50, 'Flat series produces median = 50');

    // 1.4: Median and MAD
    const sampleMAD = calculateMAD([2, 4, 6, 8, 10]);
    assert(sampleMAD.median === 6, 'Median of [2, 4, 6, 8, 10] is 6');
    assert(sampleMAD.mad === 2, 'MAD of [2, 4, 6, 8, 10] is 2');

    // 1.5: Zero-MAD fallback (Boris Iglewicz & David Hoaglin 1993)
    // Series where > 50% are identical: [10, 10, 10, 10, 10, 10, 50]
    const skewedSample = [10, 10, 10, 10, 10, 10, 50];
    const skewedMAD = calculateMAD(skewedSample);
    assert(skewedMAD.mad === 0, 'Skewed sample with identical majority produces MAD = 0');
    assert(skewedMAD.meanAD > 0, 'MeanAD is positive when MAD = 0');
    const modScores = calculateModifiedZScores(skewedSample);
    assert(modScores.length === 7, 'Modified Z-scores returns scores for all elements');
    assert(modScores[6] > 3.5, `Outlier value 50 produces Modified Z-score > 3.5 (${modScores[6]})`);
    assert(modScores.slice(0, 6).every((s) => s === 0), 'Identical baseline elements receive score of 0');
    assert(modScores.every((s) => !isNaN(s) && isFinite(s)), 'All Modified Z-scores are strictly finite numbers');

    // 1.6: All identical elements in Modified Z-score
    const allIdentical = [25, 25, 25, 25, 25];
    const identScores = calculateModifiedZScores(allIdentical);
    assert(identScores.every((s) => s === 0), 'All identical elements produce score 0 with zero division protection');

    // 1.7: Trailing Rolling Baseline (Temporal Separation Rule)
    const testDailySeries = [
      { date: '2026-01-01', value: 100, isRecorded: true },
      { date: '2026-01-02', value: 120, isRecorded: true },
      { date: '2026-01-03', value: 110, isRecorded: true },
      { date: '2026-01-04', value: 130, isRecorded: true },
      { date: '2026-01-05', value: 115, isRecorded: true },
      { date: '2026-01-06', value: 1000, isRecorded: true }, // Spike day t=5
    ];
    // Baseline for day t=5 should use t=0..4 and EXCLUDE day 5 (1000)
    const baseline5 = calculateTrailingBaseline(testDailySeries, 5, 7, 3);
    assert(baseline5.baseline !== null, 'Trailing baseline computed for day index 5');
    assert(baseline5.recordedCount === 5, 'Trailing baseline uses 5 prior recorded observations');
    assert(baseline5.baseline <= 130 && baseline5.baseline >= 100, `Baseline strictly excludes target day 1000 ($${baseline5.baseline})`);

    // Day 0 has no prior days:
    const baseline0 = calculateTrailingBaseline(testDailySeries, 0, 7, 3);
    assert(baseline0.baseline === null, 'Day 0 has null trailing baseline');

    // Fewer than 3 recorded prior days:
    const baseline2 = calculateTrailingBaseline(testDailySeries, 2, 7, 3);
    assert(baseline2.baseline === null, 'Day 2 with only 2 prior days returns null baseline');

    // 1.8: Daily Anomaly Detection (IQR Corridor + Sudden Drop + Spikes)
    const syntheticSales = [
      { date: '2026-01-01', value: 100, isRecorded: true },
      { date: '2026-01-02', value: 105, isRecorded: true },
      { date: '2026-01-03', value: 95, isRecorded: true },
      { date: '2026-01-04', value: 110, isRecorded: true },
      { date: '2026-01-05', value: 100, isRecorded: true },
      { date: '2026-01-06', value: 102, isRecorded: true },
      { date: '2026-01-07', value: 500, isRecorded: true }, // Extreme spike
      { date: '2026-01-08', value: 0, isRecorded: false }, // Unrecorded date
      { date: '2026-01-09', value: 10, isRecorded: true }, // Severe sudden drop
      { date: '2026-01-10', value: 100, isRecorded: true },
    ];
    const anomalyResult = detectDailyAnomalies(syntheticSales, { sensitivity: 'standard' });
    assert(anomalyResult.hasSufficientData === true, 'detectDailyAnomalies flags sufficient data for 9 distinct recorded days');
    assert(anomalyResult.summary.spikesCount >= 1, 'detectDailyAnomalies correctly identifies revenue spike on 2026-01-07');
    assert(anomalyResult.summary.dropsCount >= 1, 'detectDailyAnomalies correctly identifies sales drop on 2026-01-09');

    // Check that unrecorded date is NOT flagged as an anomaly
    const unrecordedPoint = anomalyResult.dailyPoints.find((p) => p.date === '2026-01-08');
    assert(unrecordedPoint && !unrecordedPoint.isAnomaly, 'Unrecorded calendar date is NOT flagged as an anomaly');
    assert(unrecordedPoint.explanation.includes('No sales records'), 'Unrecorded date explanation states no sales records');

    // Check spike point details
    const spikePoint = anomalyResult.dailyPoints.find((p) => p.date === '2026-01-07');
    assert(spikePoint && spikePoint.isAnomaly, 'Day 2026-01-07 is marked as anomaly');
    assert(spikePoint.anomalyType === 'revenue_spike', 'Day 2026-01-07 is marked as revenue_spike');
    assert(spikePoint.severity === 'High', '500 vs ~100 normal is High severity');

    // Check drop point details
    const dropPoint = anomalyResult.dailyPoints.find((p) => p.date === '2026-01-09');
    assert(dropPoint && dropPoint.isAnomaly, 'Day 2026-01-09 is marked as anomaly');
    assert(dropPoint.anomalyType === 'sales_drop', 'Day 2026-01-09 is marked as sales_drop');
    assert(dropPoint.severity === 'High', 'Drop of 90% is High severity');

    // 1.9: Sensitivity multipliers
    const sensStandard = detectDailyAnomalies(syntheticSales, { sensitivity: 'standard' });
    const sensSensitive = detectDailyAnomalies(syntheticSales, { sensitivity: 'sensitive' });
    const sensConservative = detectDailyAnomalies(syntheticSales, { sensitivity: 'conservative' });
    assert(sensSensitive.kMultiplier === 1.2, 'Sensitive mode sets k = 1.2');
    assert(sensStandard.kMultiplier === 1.5, 'Standard mode sets k = 1.5');
    assert(sensConservative.kMultiplier === 2.0, 'Conservative mode sets k = 2.0');
    assert(sensSensitive.thresholds.upperThreshold < sensConservative.thresholds.upperThreshold, 'Sensitive upper threshold is lower than conservative threshold');

    // 1.10: Safe Handling of Zero Variance / IQR = 0 in Daily Anomalies
    const flatDailySeries = [
      { date: '2026-01-01', value: 50, isRecorded: true },
      { date: '2026-01-02', value: 50, isRecorded: true },
      { date: '2026-01-03', value: 50, isRecorded: true },
      { date: '2026-01-04', value: 50, isRecorded: true },
      { date: '2026-01-05', value: 50, isRecorded: true },
      { date: '2026-01-06', value: 50, isRecorded: true },
      { date: '2026-01-07', value: 50, isRecorded: true },
      { date: '2026-01-08', value: 250, isRecorded: true }, // Spike
    ];
    const flatResult = detectDailyAnomalies(flatDailySeries);
    assert(flatResult.quartiles.rawIQR === 0, 'Raw IQR is 0 for flat series');
    assert(flatResult.quartiles.iqr > 0, 'Effective IQR is positive floor (> 0)');
    assert(flatResult.thresholds.upperThreshold > 50, 'Upper threshold does not collapse to 50');
    assert(flatResult.summary.spikesCount === 1, 'Spike of 250 detected even with flat baseline');

    // 1.11: Transaction Outlier Detection
    const sampleTxs = [
      { _id: '1', date: '2026-01-01', totalRevenue: 15, productName: 'Item A', quantitySold: 1, unitPrice: 15 },
      { _id: '2', date: '2026-01-01', totalRevenue: 18, productName: 'Item B', quantitySold: 1, unitPrice: 18 },
      { _id: '3', date: '2026-01-02', totalRevenue: 14, productName: 'Item A', quantitySold: 1, unitPrice: 14 },
      { _id: '4', date: '2026-01-02', totalRevenue: 20, productName: 'Item C', quantitySold: 2, unitPrice: 10 },
      { _id: '5', date: '2026-01-03', totalRevenue: 16, productName: 'Item B', quantitySold: 1, unitPrice: 16 },
      { _id: '6', date: '2026-01-03', totalRevenue: 15, productName: 'Item A', quantitySold: 1, unitPrice: 15 },
      { _id: '7', date: '2026-01-04', totalRevenue: 17, productName: 'Item C', quantitySold: 1, unitPrice: 17 },
      { _id: '8', date: '2026-01-04', totalRevenue: 16, productName: 'Item A', quantitySold: 1, unitPrice: 16 },
      { _id: '9', date: '2026-01-05', totalRevenue: 19, productName: 'Item B', quantitySold: 1, unitPrice: 19 },
      { _id: '10', date: '2026-01-05', totalRevenue: 15, productName: 'Item A', quantitySold: 1, unitPrice: 15 },
      { _id: '11', date: '2026-01-06', totalRevenue: 350, productName: 'Bulk Wholesale Order', quantitySold: 20, unitPrice: 17.5 }, // Outlier!
    ];
    const txOutlierResult = detectTransactionOutliers(sampleTxs, { outlierThreshold: 3.5 });
    assert(txOutlierResult.hasSufficientData === true, 'Transaction outliers evaluates sufficient data (11 >= 10)');
    assert(txOutlierResult.summary.totalOutliers === 1, 'Exactly 1 transaction outlier identified');
    assert(txOutlierResult.outliers[0].totalRevenue === 350, 'Outlier identified is $350 transaction');
    assert(txOutlierResult.outliers[0].modifiedZScore >= 3.5, 'Outlier has Modified Z-score >= 3.5');
    assert(txOutlierResult.outliers[0].severity === 'High', '$350 transaction has High severity');
    assert(txOutlierResult.outliers[0].explanation.includes('deviation score') || txOutlierResult.outliers[0].explanation.includes('Modified Z-score'), 'Explanation cites deviation score');

    console.log('\n--- 2. Data Sufficiency Gate Tests ---');
    // 2.1: Daily anomalies insufficient data (< 7 recorded days)
    const shortDaily = [
      { date: '2026-01-01', value: 100, isRecorded: true },
      { date: '2026-01-02', value: 105, isRecorded: true },
      { date: '2026-01-03', value: 110, isRecorded: true },
      { date: '2026-01-04', value: 115, isRecorded: true },
    ];
    const shortDailyRes = detectDailyAnomalies(shortDaily);
    assert(shortDailyRes.hasSufficientData === false, 'Fewer than 7 distinct days correctly flags hasSufficientData: false');
    assert(shortDailyRes.minRequiredDays === 7, 'minRequiredDays is explicitly reported as 7');
    assert(shortDailyRes.distinctRecordedDays === 4, 'distinctRecordedDays is reported as 4');

    // 2.2: Transaction outliers insufficient data (< 10 transactions)
    const shortTxs = sampleTxs.slice(0, 5);
    const shortTxRes = detectTransactionOutliers(shortTxs);
    assert(shortTxRes.hasSufficientData === false, 'Fewer than 10 transactions flags hasSufficientData: false');
    assert(shortTxRes.minRequiredTransactions === 10, 'minRequiredTransactions is reported as 10');
    assert(shortTxRes.totalTransactions === 5, 'totalTransactions is reported as 5');

    console.log('\n--- 3. API Integration & Security Tests ---');

    // Setup Test Users and Tokens
    const testEmailUserA = `test_mod5_userA_${Date.now()}@test.com`;
    const testEmailUserB = `test_mod5_userB_${Date.now()}@test.com`;

    const userARes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User A',
        email: testEmailUserA,
        password: 'password123',
        confirmPassword: 'password123',
        businessName: 'Store A',
        businessType: 'supermarket',
      });
    const tokenA = userARes.body.data.token;
    const userAId = userARes.body.data.user._id;

    const userBRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User B',
        email: testEmailUserB,
        password: 'password123',
        confirmPassword: 'password123',
        businessName: 'Store B',
        businessType: 'clothing',
      });
    const tokenB = userBRes.body.data.token;
    const userBId = userBRes.body.data.user._id;

    // 3.1: 401 Unauthorized for unauthenticated requests
    const unauthDaily = await request(app).get('/api/anomalies/daily');
    assert(unauthDaily.status === 401, 'GET /api/anomalies/daily unauthenticated returns 401');

    const unauthTx = await request(app).get('/api/anomalies/transactions');
    assert(unauthTx.status === 401, 'GET /api/anomalies/transactions unauthenticated returns 401');

    const unauthSummary = await request(app).get('/api/anomalies/summary');
    assert(unauthSummary.status === 401, 'GET /api/anomalies/summary unauthenticated returns 401');

    // 3.2: Insufficient data response via API for empty user
    const emptyDailyRes = await request(app)
      .get('/api/anomalies/daily')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(emptyDailyRes.status === 200, 'GET /api/anomalies/daily with empty sales returns 200 OK');
    assert(emptyDailyRes.body.data.hasSufficientData === false, 'API reports hasSufficientData: false for empty user');

    const emptyTxRes = await request(app)
      .get('/api/anomalies/transactions')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(emptyTxRes.status === 200, 'GET /api/anomalies/transactions with empty sales returns 200 OK');
    assert(emptyTxRes.body.data.hasSufficientData === false, 'API reports hasSufficientData: false for empty transactions');

    // 3.3: Seed sales for User A (8 distinct days with 1 spike and 1 sudden drop, total 12 transactions)
    const baseDate = new Date('2026-02-01T10:00:00.000Z');
    const salesToInsertUserA = [];

    // Days 1..6: normal sales of ~$100/day
    for (let day = 0; day < 6; day++) {
      const d = new Date(baseDate);
      d.setUTCDate(d.getUTCDate() + day);
      salesToInsertUserA.push({
        userId: userAId,
        productName: 'Organic Milk 1L',
        quantitySold: 5,
        unitPrice: 20,
        totalRevenue: 100,
        date: d,
        paymentMethod: 'cash',
      });
    }

    // Day 7: Extreme Spike $600
    const spikeDate = new Date(baseDate);
    spikeDate.setUTCDate(spikeDate.getUTCDate() + 6);
    salesToInsertUserA.push({
      userId: userAId,
      productName: 'Bulk Espresso Beans',
      quantitySold: 20,
      unitPrice: 30,
      totalRevenue: 600,
      date: spikeDate,
      paymentMethod: 'card',
    });

    // Day 8: Severe sudden drop $10
    const dropDate = new Date(baseDate);
    dropDate.setUTCDate(dropDate.getUTCDate() + 7);
    salesToInsertUserA.push({
      userId: userAId,
      productName: 'Matchbox',
      quantitySold: 2,
      unitPrice: 5,
      totalRevenue: 10,
      date: dropDate,
      paymentMethod: 'cash',
    });

    // Extra small transactions to satisfy transaction count >= 10
    for (let extra = 0; extra < 4; extra++) {
      const d = new Date(baseDate);
      d.setUTCDate(d.getUTCDate() + extra);
      salesToInsertUserA.push({
        userId: userAId,
        productName: 'Candy Bar',
        quantitySold: 2,
        unitPrice: 5,
        totalRevenue: 10,
        date: d,
        paymentMethod: 'cash',
      });
    }

    await Sale.insertMany(salesToInsertUserA);

    // 3.4: Seed sales for User B (User B only has 2 days, isolated)
    const salesToInsertUserB = [
      {
        userId: userBId,
        productName: 'Product B1',
        quantitySold: 1,
        unitPrice: 50,
        totalRevenue: 50,
        date: new Date('2026-02-01T10:00:00.000Z'),
        paymentMethod: 'cash',
      },
      {
        userId: userBId,
        productName: 'Product B2',
        quantitySold: 1,
        unitPrice: 60,
        totalRevenue: 60,
        date: new Date('2026-02-02T10:00:00.000Z'),
        paymentMethod: 'cash',
      },
    ];
    await Sale.insertMany(salesToInsertUserB);

    // 3.5: User A Daily Anomalies via API
    const userADailyRes = await request(app)
      .get('/api/anomalies/daily')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(userADailyRes.status === 200, 'GET /api/anomalies/daily for User A returns 200');
    assert(userADailyRes.body.data.hasSufficientData === true, 'User A has sufficient daily data (8 days >= 7)');
    assert(userADailyRes.body.data.distinctRecordedDays === 8, 'User A distinct recorded days is 8');
    assert(userADailyRes.body.data.summary.spikesCount >= 1, 'User A detects revenue spike on day 7');
    assert(userADailyRes.body.data.summary.dropsCount >= 1, 'User A detects sales drop on day 8');
    assert(userADailyRes.body.data.dailyPoints.length === 8, 'User A dailyPoints contains all 8 calendar days');

    // 3.6: User A Transaction Outliers via API
    const userATxRes = await request(app)
      .get('/api/anomalies/transactions?minScore=3.5')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(userATxRes.status === 200, 'GET /api/anomalies/transactions for User A returns 200');
    assert(userATxRes.body.data.hasSufficientData === true, 'User A has sufficient transaction data (12 >= 10)');
    assert(userATxRes.body.data.summary.totalOutliers >= 1, 'User A detects at least 1 transaction outlier');
    assert(userATxRes.body.data.outliers[0].totalRevenue === 600, 'User A top outlier is $600 transaction');
    assert(userATxRes.body.data.outliers[0].severity === 'High', 'User A top outlier has High severity');

    // 3.7: User A Anomaly Summary via API
    const userASummaryRes = await request(app)
      .get('/api/anomalies/summary')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(userASummaryRes.status === 200, 'GET /api/anomalies/summary returns 200');
    assert(userASummaryRes.body.data.totalAnomalies >= 2, 'Summary reports combined anomalies count >= 2');
    assert(userASummaryRes.body.data.hasSufficientDailyData === true, 'Summary reports hasSufficientDailyData: true');
    assert(userASummaryRes.body.data.hasSufficientTxData === true, 'Summary reports hasSufficientTxData: true');
    assert(userASummaryRes.body.data.latestAnomaly !== null, 'Summary reports a latestAnomaly object');

    // 3.8: Multi-Tenant Isolation: User B cannot see User A's data
    const userBDailyRes = await request(app)
      .get('/api/anomalies/daily')
      .set('Authorization', `Bearer ${tokenB}`);
    assert(userBDailyRes.body.data.hasSufficientData === false, 'User B hasSufficientData is false (only 2 days)');
    assert(userBDailyRes.body.data.distinctRecordedDays === 2, 'User B distinctRecordedDays is exactly 2 (completely isolated from User A)');

    const userBTxRes = await request(app)
      .get('/api/anomalies/transactions')
      .set('Authorization', `Bearer ${tokenB}`);
    assert(userBTxRes.body.data.hasSufficientData === false, 'User B transaction data is insufficient (2 < 10)');
    assert(userBTxRes.body.data.totalTransactions === 2, 'User B total transactions is exactly 2');

    // Cleanup test users and sales
    await Sale.deleteMany({ userId: { $in: [userAId, userBId] } });
    await User.deleteMany({ _id: { $in: [userAId, userBId] } });

    console.log(`\n🎉 Module 5 Tests Completed: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error in Module 5 tests:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

runModule5Tests();
