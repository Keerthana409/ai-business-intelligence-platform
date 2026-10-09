import '../config/testEnv.js';
import 'dotenv/config';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Recommendation from '../models/Recommendation.js';
import Scenario from '../models/Scenario.js';
import DecisionAudit from '../models/DecisionAudit.js';
import { connectDB } from '../config/db.js';
import {
  formatDateKey,
  addDays,
  roundCurrency,
  calculatePercentageChange,
  calculateWindowDates,
  checkWindowMaturation,
  aggregateWindowSales,
  calculateIncrementalBenefit,
  calculateDefensibleROI,
  evaluateRestockOutcome,
  evaluateClearanceOutcome,
  evaluatePriceOptimizationOutcome,
  evaluateSimulationCalibration,
} from '../utils/auditEngine.js';

async function runModule8Tests() {
  console.log('🧪 [START] Running Module 8: Decision Audit & Outcome Tracking Engine Tests...\n');
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

    console.log('--- 1. Pure Mathematical & Statistical Audit Engine Tests ---');

    // 1.1 Date Formatting & Utilities
    assert(formatDateKey('2026-10-01T15:30:00.000Z') === '2026-10-01', 'formatDateKey correctly parses ISO string');
    assert(addDays('2026-10-01', 7) === '2026-10-08', 'addDays correctly calculates forward date');
    assert(addDays('2026-10-01', -7) === '2026-09-24', 'addDays correctly calculates backward date');

    // 1.2 Window Boundary Rules (Strictly excluding t_impl)
    const window14 = calculateWindowDates('2026-10-15', 14);
    assert(window14.implDate === '2026-10-15', 'Impl date is exactly 2026-10-15');
    assert(window14.preEnd === '2026-10-14', 'Pre-window strictly ends on day before t_impl (2026-10-14)');
    assert(window14.preStart === '2026-10-01', 'Pre-window starts 14 days before t_impl (2026-10-01)');
    assert(window14.postStart === '2026-10-16', 'Post-window strictly starts on day after t_impl (2026-10-16)');
    assert(window14.postEnd === '2026-10-29', 'Post-window ends 14 days after t_impl (2026-10-29)');

    // 1.3 Observation Window Maturation Rule
    // Check when current date is inside window (unfinished)
    const unfinishedMat = checkWindowMaturation('2026-10-15', 14, '2026-10-20');
    assert(unfinishedMat.isMatured === false, 'Maturation: Unfinished window returns isMatured = false');
    assert(unfinishedMat.daysElapsed === 5, 'Maturation: Correctly reports 5 days elapsed');
    assert(unfinishedMat.daysRemaining === 9, 'Maturation: Correctly reports 9 days remaining');

    // Check when current date is past postEnd (matured)
    const maturedMat = checkWindowMaturation('2026-10-15', 14, '2026-10-30');
    assert(maturedMat.isMatured === true, 'Maturation: Completed window returns isMatured = true');
    assert(maturedMat.daysElapsed === 14, 'Maturation: Correctly reports full 14 days elapsed');
    assert(maturedMat.daysRemaining === 0, 'Maturation: Reports 0 days remaining');

    // 1.4 Sales Window Aggregation & Financial Metric Separation
    const mockSales = [
      { date: '2026-10-02', quantitySold: 5, unitPrice: 10, totalRevenue: 50 },
      { date: '2026-10-05', quantitySold: 8, unitPrice: 10, totalRevenue: 80 },
      { date: '2026-10-10', quantitySold: 7, unitPrice: 10, totalRevenue: 70 },
      { date: '2026-10-15', quantitySold: 100, unitPrice: 10, totalRevenue: 1000 }, // t_impl day
      { date: '2026-10-18', quantitySold: 10, unitPrice: 10, totalRevenue: 100 },
    ];
    // Pre-window: 2026-10-01 to 2026-10-14, unit cost $6
    const preAgg = aggregateWindowSales(mockSales, '2026-10-01', '2026-10-14', 6);
    assert(preAgg.distinctTradingDays === 3, 'Pre-window: 3 distinct trading days aggregated');
    assert(preAgg.totalUnitsSold === 20, 'Pre-window: Total units sold is 5+8+7 = 20');
    assert(preAgg.totalRevenue === 200, 'Pre-window: Total revenue is $200.00');
    assert(preAgg.totalCOGS === 120, 'Pre-window: Total COGS (capital value sold) is 20 * $6 = $120.00');
    assert(preAgg.grossProfit === 80, 'Pre-window: Gross profit is $200 - $120 = $80.00');
    assert(preAgg.hasSufficientData === true, 'Pre-window: 3 distinct trading days satisfies data gate');

    // 1.5 Insufficient Data Handling (< 3 trading days)
    const weakSales = [
      { date: '2026-10-02', quantitySold: 4, unitPrice: 10, totalRevenue: 40 },
    ];
    const weakAgg = aggregateWindowSales(weakSales, '2026-10-01', '2026-10-14', 6);
    assert(weakAgg.distinctTradingDays === 1, 'Weak sales: 1 distinct trading day');
    assert(weakAgg.hasSufficientData === false, 'Weak sales: < 3 distinct days flags hasSufficientData as false');

    // 1.6 Incremental Net Financial Benefit Calculation
    const postAgg = aggregateWindowSales(
      [
        { date: '2026-10-18', quantitySold: 12, unitPrice: 10, totalRevenue: 120 },
        { date: '2026-10-20', quantitySold: 15, unitPrice: 10, totalRevenue: 150 },
        { date: '2026-10-25', quantitySold: 13, unitPrice: 10, totalRevenue: 130 },
      ],
      '2026-10-16',
      '2026-10-29',
      6
    );
    // Post units: 40, revenue: $400, COGS: $240, gross profit: $160
    const benefit = calculateIncrementalBenefit(preAgg, postAgg);
    assert(benefit.deltaRevenue === 200, 'Delta revenue is $400 - $200 = +$200.00');
    assert(benefit.deltaUnits === 20, 'Delta units is 40 - 20 = +20 units');
    assert(benefit.deltaGrossProfit === 80, 'Delta gross profit is $160 - $80 = +$80.00');
    assert(benefit.incrementalNetBenefit === 80, 'Incremental net benefit is exactly Delta Gross Profit ($80.00)');

    // 1.7 Defensible ROI Accounting Rules
    // Scenario A: Valid Investment Cost (Restock with outlay $400, incremental benefit $80)
    const validROI = calculateDefensibleROI(80, 400);
    assert(validROI.isApplicable === true, 'ROI: Valid outlay marks isApplicable = true');
    assert(validROI.roi === 20.0, 'ROI: (80 / 400) * 100 = 20.0% correctly computed');

    // Scenario B: Zero Incremental Capital Outlay (Price adjustment with $0 investment)
    const zeroInvROI = calculateDefensibleROI(80, 0);
    assert(zeroInvROI.isApplicable === false, 'ROI: Zero investment marks isApplicable = false');
    assert(zeroInvROI.roi === null, 'ROI: Zero investment returns null (N/A)');
    assert(zeroInvROI.explanation.includes('Zero incremental capital investment'), 'ROI: Discloses zero investment explanation');

    // Scenario C: Negative Investment Cost
    const negInvROI = calculateDefensibleROI(80, -100);
    assert(negInvROI.roi === null, 'ROI: Negative investment safely returns null');

    // Scenario D: Insufficient Data (incremental net benefit is null)
    const nullBenefitROI = calculateDefensibleROI(null, 400);
    assert(nullBenefitROI.roi === null, 'ROI: Null incremental benefit returns null');
    assert(nullBenefitROI.explanation.includes('Insufficient baseline'), 'ROI: Discloses insufficient data limitation');

    // 1.8 Inventory Restock Outcome Evaluation
    const restockEval = evaluateRestockOutcome({
      preMetrics: preAgg,
      postMetrics: postAgg,
      quantityOrdered: 50,
      costPrice: 6,
      currentStock: 25,
      isMatured: true,
    });
    assert(restockEval.status === 'evaluated_matured', 'Restock: Matured window sets evaluated_matured');
    assert(restockEval.outcomeRating === 'favorable', 'Restock: Averted stockout + positive incremental benefit = favorable');
    assert(restockEval.stockoutAverted === true, 'Restock: Flags stockoutAverted as true');
    assert(restockEval.investmentCost === 300, 'Restock: Investment outlay is 50 * $6 = $300.00');
    assert(restockEval.capitalValueSold === 240, 'Restock: Distinct capital value sold is $240.00');
    assert(restockEval.roiPercent === 26.67, 'Restock: Defensible ROI is (80 / 300) * 100 = 26.67%');

    // 1.9 Dead Inventory Clearance Accounting (Trapped Capital Recovered vs Profit)
    const clearancePostAgg = {
      totalUnitsSold: 30,
      totalRevenue: 300,
      totalCOGS: 300, // Sold at cost $10
      grossProfit: 0,
      hasSufficientData: true,
    };
    const clearanceEval = evaluateClearanceOutcome({
      preMetrics: { ...preAgg, totalUnitsSold: 2 },
      postMetrics: clearancePostAgg,
      costPrice: 10,
      isMatured: true,
    });
    assert(clearanceEval.deadCapitalRecovered === 300, 'Clearance: Trapped capital recovered is 30 * $10 = $300.00');
    assert(clearanceEval.investmentCost === 0, 'Clearance: Investment cost is $0 (sunken capital)');
    assert(clearanceEval.roiPercent === null, 'Clearance: ROI is strictly null for clearance liquidations');
    assert(clearanceEval.outcomeRating === 'favorable', 'Clearance: Unlocked capital rated favorable');

    // 1.10 Price Optimization Outcome Evaluation
    const priceOptEval = evaluatePriceOptimizationOutcome({
      preMetrics: preAgg,
      postMetrics: postAgg,
      isMatured: true,
    });
    assert(priceOptEval.investmentCost === 0, 'Price Opt: Investment cost is $0');
    assert(priceOptEval.roiPercent === null, 'Price Opt: ROI is null');
    assert(priceOptEval.deltaGrossProfit === 80, 'Price Opt: Tracks Delta Gross Profit (+$80.00)');
    assert(priceOptEval.outcomeRating === 'favorable', 'Price Opt: Positive gross profit delta rated favorable');

    // 1.11 Simulation vs Actual Calibration Comparison
    const simCalibration = evaluateSimulationCalibration(
      { simulatedRevenue: 380, simulatedGrossProfit: 150, simulatedQuantity: 38 },
      postAgg,
      14,
      14
    );
    assert(simCalibration.isLinked === true, 'Sim Calibration: Marked as linked');
    assert(simCalibration.isCompatible === true, 'Sim Calibration: 14D vs 14D is compatible');
    assert(simCalibration.projectedRevenue === 380, 'Sim Calibration: Projected revenue is $380.00');
    assert(simCalibration.actualRevenue === 400, 'Sim Calibration: Actual revenue is $400.00');
    assert(simCalibration.revenueVariance === 20, 'Sim Calibration: Revenue variance is +$20.00');
    assert(simCalibration.revenueVariancePercent === 5.3, 'Sim Calibration: Variance is +5.3%');
    assert(simCalibration.calibrationAssessment === 'aligned', 'Sim Calibration: Within 15% rated aligned');

    console.log('--- 2. Database Integration & Explicit Implementation Tests ---');

    // Setup Test Users - Scoped strictly to dedicated test users
    const existingTestUsers = await User.find({ email: { $in: ['audit_user_a@test.com', 'audit_user_b@test.com'] } });
    const preTestIds = existingTestUsers.map((u) => u._id);
    if (preTestIds.length > 0) {
      await Product.deleteMany({ userId: { $in: preTestIds } });
      await Sale.deleteMany({ userId: { $in: preTestIds } });
      await Recommendation.deleteMany({ userId: { $in: preTestIds } });
      await Scenario.deleteMany({ userId: { $in: preTestIds } });
      await DecisionAudit.deleteMany({ userId: { $in: preTestIds } });
      await User.deleteMany({ _id: { $in: preTestIds } });
    }

    const userA = await User.create({
      name: 'Retailer A Audit',
      email: 'audit_user_a@test.com',
      password: 'password123',
      businessName: 'Store A Audit Mart',
      businessType: 'supermarket',
    });

    const userB = await User.create({
      name: 'Retailer B Audit',
      email: 'audit_user_b@test.com',
      password: 'password123',
      businessName: 'Store B Isolated Shop',
      businessType: 'clothing',
    });

    // Authenticate test users
    const loginResA = await request(app).post('/api/auth/login').send({
      email: 'audit_user_a@test.com',
      password: 'password123',
    });
    const tokenA = loginResA.body.data.token;

    const loginResB = await request(app).post('/api/auth/login').send({
      email: 'audit_user_b@test.com',
      password: 'password123',
    });
    const tokenB = loginResB.body.data.token;

    // Create Product for User A
    const productA = await Product.create({
      userId: userA._id,
      sku: 'AUDIT-MILK-01',
      name: 'Organic Whole Milk 1L',
      category: 'Dairy',
      costPrice: 2.5,
      sellingPrice: 4.0,
      stockQuantity: 15,
      reorderThreshold: 10,
    });

    // Seed Pre-Window Sales for User A (relative to implementation date 2026-10-15)
    await Sale.insertMany([
      { userId: userA._id, productId: productA._id, productName: productA.name, quantitySold: 10, unitPrice: 4.0, totalRevenue: 40.0, date: new Date('2026-10-02T10:00:00.000Z') },
      { userId: userA._id, productId: productA._id, productName: productA.name, quantitySold: 12, unitPrice: 4.0, totalRevenue: 48.0, date: new Date('2026-10-05T10:00:00.000Z') },
      { userId: userA._id, productId: productA._id, productName: productA.name, quantitySold: 8, unitPrice: 4.0, totalRevenue: 32.0, date: new Date('2026-10-10T10:00:00.000Z') },
    ]);

    // Create an Accepted Recommendation for User A
    const recA = await Recommendation.create({
      userId: userA._id,
      productId: productA._id,
      dedupKey: `${userA._id}-reorder_urgency-${productA._id}`,
      title: 'Restock Urgency: Organic Whole Milk 1L',
      type: 'reorder_urgency',
      category: 'Restock Urgency',
      priority: 'critical',
      actionProposed: 'Issue purchase order for 40 units',
      status: 'accepted',
      explanation: { ruleTriggered: 'test_rule', factors: [] },
    });

    // Create a Saved What-If Scenario for User A
    const scenarioA = await Scenario.create({
      userId: userA._id,
      name: 'Milk Price Increase Simulation',
      scenarioType: 'price_change',
      productId: productA._id,
      productName: productA.name,
      inputs: { proposedPrice: 4.5 },
      baselineResults: { sellingPrice: 4.0, simulatedRevenue: 120.0 },
      simulatedResults: { simulatedRevenue: 135.0, simulatedGrossProfit: 60.0, simulatedQuantity: 30 },
      isSnapshot: true,
    });

    // 2.1 Unauthenticated Security Gating
    const unauthRes = await request(app).get('/api/audit');
    assert(unauthRes.status === 401, 'Unauthenticated GET /api/audit returns 401 Unauthorized');

    const unauthImpl = await request(app).post('/api/audit/implement').send({});
    assert(unauthImpl.status === 401, 'Unauthenticated POST /api/audit/implement returns 401 Unauthorized');

    // 2.2 Explicit Implementation Workflow (Accepted != Implemented)
    // Acceptance in Recommendation did not auto-create an audit
    const initialAudits = await DecisionAudit.find({ userId: userA._id });
    assert(initialAudits.length === 0, 'Zero audits exist prior to explicit confirmation workflow');

    // Explicitly confirm implementation of Recommendation
    const implRes = await request(app)
      .post('/api/audit/implement')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        decisionSource: 'recommendation',
        recommendationId: recA._id,
        decisionType: 'inventory_restock',
        title: 'Restock Organic Whole Milk 1L',
        productId: productA._id,
        implementedAt: '2026-10-15',
        observationWindowDays: 14,
        implementationNotes: 'PO #8841 confirmed with dairy supplier',
        implementedParameters: {
          quantityOrdered: 40,
          costPrice: 2.5,
        },
      });

    assert(implRes.status === 201, 'Explicit implementation returns 201 Created');
    const auditRecord = implRes.body.data.audit;
    assert(auditRecord.decisionSource === 'recommendation', 'Audit records correct decision source');
    assert(auditRecord.implementedParameters.quantityOrdered === 40, 'Records quantity ordered (40)');
    assert(auditRecord.implementedParameters.capitalInvested === 100, 'Calculates capital invested: 40 * $2.50 = $100.00');
    assert(auditRecord.baselineMetrics.distinctTradingDays === 3, 'Baseline metrics capture 3 distinct trading days');
    assert(auditRecord.baselineMetrics.totalUnitsSold === 30, 'Baseline units sold is 10+12+8 = 30');
    assert(auditRecord.baselineMetrics.totalRevenue === 120, 'Baseline revenue is $120.00');
    assert(auditRecord.baselineMetrics.grossProfit === 45, 'Baseline gross profit is $120 - (30 * $2.50) = $45.00');

    // Verify Recommendation transitions to completed upon confirmed implementation
    const updatedRecA = await Recommendation.findById(recA._id);
    assert(updatedRecA.status === 'completed', 'Recommendation status auto-completes upon confirmed implementation');
    assert(updatedRecA.outcomeTracking.actionTakenDate !== undefined, 'Recommendation outcomeTracking timestamp recorded');

    // 2.3 Duplicate Prevention for Same Recommendation
    const dupRes = await request(app)
      .post('/api/audit/implement')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        decisionSource: 'recommendation',
        recommendationId: recA._id,
        decisionType: 'inventory_restock',
        title: 'Duplicate Restock Attempt',
        implementedAt: '2026-10-15',
      });
    assert(dupRes.status === 409, 'Duplicate implementation attempt returns 409 Conflict');

    // 2.4 Linking Saved Scenario & Snapshot Immutability Verification
    const scenarioImplRes = await request(app)
      .post('/api/audit/implement')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        decisionSource: 'scenario',
        scenarioId: scenarioA._id,
        decisionType: 'price_optimization',
        title: 'Price Optimization: Organic Milk to $4.50',
        productId: productA._id,
        implementedAt: '2026-10-15',
        observationWindowDays: 14,
        implementedParameters: {
          oldPrice: 4.0,
          newPrice: 4.5,
          costPrice: 2.5,
        },
      });

    assert(scenarioImplRes.status === 201, 'Linking saved scenario returns 201 Created');
    const scenarioAudit = scenarioImplRes.body.data.audit;
    assert(scenarioAudit.simulationComparison.isLinked === true, 'Simulation comparison marked isLinked = true');
    assert(scenarioAudit.simulationComparison.projectedRevenue === 135.0, 'Pulls projected revenue ($135.00) from scenario');

    // Verify Scenario Snapshot was NOT mutated
    const unmodifiedScenario = await Scenario.findById(scenarioA._id);
    assert(unmodifiedScenario.isSnapshot === true, 'Scenario snapshot remains strictly immutable');
    assert(unmodifiedScenario.name === 'Milk Price Increase Simulation', 'Scenario name strictly preserved');
    assert(unmodifiedScenario.simulatedResults.simulatedRevenue === 135.0, 'Scenario simulated results intact');

    // 2.5 Multi-Tenant Data Isolation
    // User A has 2 audits
    const userAAudits = await request(app).get('/api/audit').set('Authorization', `Bearer ${tokenA}`);
    assert(userAAudits.status === 200, 'User A GET /api/audit returns 200 OK');
    assert(userAAudits.body.count === 2, 'User A sees exactly 2 audits');

    // User B queries /api/audit -> must see 0 audits
    const userBAudits = await request(app).get('/api/audit').set('Authorization', `Bearer ${tokenB}`);
    assert(userBAudits.status === 200, 'User B GET /api/audit returns 200 OK');
    assert(userBAudits.body.count === 0, 'User B sees 0 audits (complete isolation)');

    // User B attempts to access User A's audit by ID -> 404 Access Denied
    const crossAccess = await request(app)
      .get(`/api/audit/${auditRecord._id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert(crossAccess.status === 404, 'User B querying User A audit returns 404 Access Denied');

    // User B attempts to delete User A's audit -> 404 Access Denied
    const crossDelete = await request(app)
      .delete(`/api/audit/${auditRecord._id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert(crossDelete.status === 404, 'User B deleting User A audit returns 404 Access Denied');

    // 2.6 Executive Summary Endpoint
    const summaryRes = await request(app).get('/api/audit/summary').set('Authorization', `Bearer ${tokenA}`);
    assert(summaryRes.status === 200, 'GET /api/audit/summary returns 200 OK');
    assert(summaryRes.body.data.summary.totalImplemented === 2, 'Summary reports 2 total implemented decisions');

    // 2.7 Recalculate Endpoint
    const recalcRes = await request(app)
      .patch(`/api/audit/${auditRecord._id}/recalculate`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert(recalcRes.status === 200, 'PATCH /api/audit/:id/recalculate returns 200 OK');
    assert(recalcRes.body.data.audit.auditHistory.length >= 2, 'Appends recalculation entry to auditHistory');

    // 2.8 Delete Endpoint
    const deleteRes = await request(app)
      .delete(`/api/audit/${auditRecord._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert(deleteRes.status === 200, 'DELETE /api/audit/:id returns 200 OK');

    const remainingAudits = await DecisionAudit.find({ userId: userA._id });
    assert(remainingAudits.length === 1, 'Audit record successfully removed from database');

    console.log(`\n🎉 Module 8 Tests Completed: ${passed} Passed, ${failed} Failed`);

    // Clean up test data - Scoped strictly to dedicated test users
    const cleanupUserIds = [userA?._id, userB?._id].filter(Boolean);
    if (cleanupUserIds.length > 0) {
      await Product.deleteMany({ userId: { $in: cleanupUserIds } });
      await Sale.deleteMany({ userId: { $in: cleanupUserIds } });
      await Recommendation.deleteMany({ userId: { $in: cleanupUserIds } });
      await Scenario.deleteMany({ userId: { $in: cleanupUserIds } });
      await DecisionAudit.deleteMany({ userId: { $in: cleanupUserIds } });
      await User.deleteMany({ _id: { $in: cleanupUserIds } });
    }

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ Test Runner Exception:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runModule8Tests();
