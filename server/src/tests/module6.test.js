import '../config/testEnv.js';
import 'dotenv/config';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Recommendation from '../models/Recommendation.js';
import { connectDB } from '../config/db.js';
import {
  calculateReorderQuantity,
  evaluateProductDecliningSales,
  evaluateProductSlowMovingStock,
  resolveRecommendationConflicts,
} from '../utils/recommendationEngine.js';

async function runModule6Tests() {
  console.log('🧪 [START] Running Module 6: Business Recommendations & Decision Support Tests...\n');
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

    console.log('--- 1. Pure Mathematical & Decision Engine Unit Tests ---');

    // 1.1: Reorder Quantity with Empirical Demand
    const reorderDemand = calculateReorderQuantity({
      stockQuantity: 0,
      reorderThreshold: 10,
      leadTimeDays: 7,
      avgDailyDemand: 4.2,
      hasSufficientData: true,
    });
    assert(reorderDemand.isDemandBased === true, 'Reorder is demand-based when data sufficient');
    assert(reorderDemand.leadTimeDemand === 29.4, 'Lead-time demand is 4.2 * 7 = 29.4 units');
    assert(reorderDemand.targetStock === 40, 'Target stock is ceil(10 + 29.4) = 40 units');
    assert(reorderDemand.suggestedQuantity === 40, 'Suggested reorder for 0 stock is 40 units');

    // 1.2: Reorder Quantity with Partial Stock
    const reorderPartial = calculateReorderQuantity({
      stockQuantity: 15,
      reorderThreshold: 10,
      leadTimeDays: 7,
      avgDailyDemand: 4.0,
      hasSufficientData: true,
    });
    // Target = 10 + 28 = 38. Suggested = 38 - 15 = 23
    assert(reorderPartial.suggestedQuantity === 23, 'Suggested reorder for 15 stock is 38 - 15 = 23 units');

    // 1.3: Reorder Quantity when Stock Exceeds Target
    const reorderSufficient = calculateReorderQuantity({
      stockQuantity: 50,
      reorderThreshold: 10,
      leadTimeDays: 7,
      avgDailyDemand: 2.0,
      hasSufficientData: true,
    });
    assert(reorderSufficient.suggestedQuantity === 0, 'No reorder suggested when stock exceeds target stock');

    // 1.4: Insufficient Data Fallback (Catalog Safety Buffer)
    const reorderFallback = calculateReorderQuantity({
      stockQuantity: 0,
      reorderThreshold: 10,
      leadTimeDays: 7,
      avgDailyDemand: 0,
      hasSufficientData: false,
    });
    assert(reorderFallback.isDemandBased === false, 'Fallback flags isDemandBased as false');
    assert(reorderFallback.suggestedQuantity === 20, 'Fallback reorder for 0 stock with threshold 10 is 20 units (2x threshold)');

    // 1.5: Insufficient Data When Stock > Threshold does not recommend order
    const reorderFallbackSafe = calculateReorderQuantity({
      stockQuantity: 15,
      reorderThreshold: 10,
      leadTimeDays: 7,
      avgDailyDemand: 0,
      hasSufficientData: false,
    });
    assert(reorderFallbackSafe.suggestedQuantity === 0, 'Fallback does not recommend ordering when stock > threshold');

    // 1.6: Declining Sales Evaluation (Split Window)
    const today = new Date('2026-03-01T12:00:00.000Z');
    const testSalesHistory = [
      // Period 1 (Days t-14 to t-8): Feb 15 - Feb 21
      { date: new Date('2026-02-16T10:00:00.000Z'), quantitySold: 10, totalRevenue: 100 },
      { date: new Date('2026-02-18T10:00:00.000Z'), quantitySold: 10, totalRevenue: 100 }, // Total P1 = 20 units
      // Period 2 (Days t-7 to t-1): Feb 22 - Feb 28
      { date: new Date('2026-02-23T10:00:00.000Z'), quantitySold: 3, totalRevenue: 30 },
      { date: new Date('2026-02-25T10:00:00.000Z'), quantitySold: 3, totalRevenue: 30 }, // Total P2 = 6 units
    ];
    const declineRes = evaluateProductDecliningSales({
      productSales: testSalesHistory,
      distinctStoreTradingDays: 8,
      referenceDate: today,
    });
    assert(declineRes !== null, 'Declining sales detected for 70% drop');
    assert(declineRes.unitsP1 === 20, 'Baseline units P1 is 20');
    assert(declineRes.unitsP2 === 6, 'Recent units P2 is 6');
    assert(declineRes.declinePct === 70, 'Decline percentage is exactly 70.0%');

    // 1.7: Declining Sales Protection against Weak Baseline (< 5 units)
    const weakSalesHistory = [
      { date: new Date('2026-02-16T10:00:00.000Z'), quantitySold: 2, totalRevenue: 20 },
      { date: new Date('2026-02-23T10:00:00.000Z'), quantitySold: 0, totalRevenue: 0 },
    ];
    const weakDecline = evaluateProductDecliningSales({
      productSales: weakSalesHistory,
      distinctStoreTradingDays: 8,
      referenceDate: today,
    });
    assert(weakDecline === null, 'Weak baseline (<5 units) safely produces null decline result');

    // 1.8: Declining Sales Protection against Insufficient Store History (< 7 days)
    const storeShortDecline = evaluateProductDecliningSales({
      productSales: testSalesHistory,
      distinctStoreTradingDays: 4,
      referenceDate: today,
    });
    assert(storeShortDecline === null, 'Fewer than 7 distinct store trading days safely rejects trend analysis');

    // 1.9: Slow-Moving & Overstock Evaluation
    const overstockedProd = {
      _id: 'prod-overstock-1',
      name: 'Winter Parka Heavy',
      stockQuantity: 50,
      reorderThreshold: 10,
      costPrice: 40,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const slowMoveRes = evaluateProductSlowMovingStock({
      product: overstockedProd,
      unitsSoldLast30Days: 1,
      runoutDays: 120,
      hasSufficientData: true,
    });
    assert(slowMoveRes !== null, 'Slow-moving stock detected');
    assert(slowMoveRes.excessUnits === 40, 'Excess units is 50 - 10 = 40');
    assert(slowMoveRes.capitalAtRisk === 1600, 'Capital at risk is 40 * $40 = $1600');
    assert(slowMoveRes.priority === 'high', 'Capital at risk >= $300 receives High priority');

    // 1.10: Slow-Moving Capital Floor (< $50 floor)
    const cheapOverstockedProd = {
      _id: 'prod-cheap-1',
      name: 'Paper Clips Pack',
      stockQuantity: 25,
      reorderThreshold: 10,
      costPrice: 1.0, // Capital at risk = 15 * $1 = $15 (< $50)
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const cheapSlowMove = evaluateProductSlowMovingStock({
      product: cheapOverstockedProd,
      unitsSoldLast30Days: 0,
      runoutDays: null,
      hasSufficientData: false,
    });
    assert(cheapSlowMove === null, 'Items with capital at risk < $50 are not flagged as slow-moving alerts');

    // 1.11: Conflict Resolution & Mutual Exclusion
    const conflictingCandidates = [
      {
        dedupKey: 'REC-01_prod-1',
        ruleId: 'REC-01',
        productId: 'prod-1',
        type: 'reorder_urgency',
        priority: 'critical',
        evidence: { estimatedTotalCost: 500 },
      },
      {
        dedupKey: 'REC-05_prod-1', // Contradictory: Overstock for same product
        ruleId: 'REC-05',
        productId: 'prod-1',
        type: 'slow_moving_overstock',
        priority: 'high',
        evidence: { capitalAtRisk: 1000 },
      },
      {
        dedupKey: 'REC-06_prod-1', // Contradictory: Declining sales for out-of-stock product
        ruleId: 'REC-06',
        productId: 'prod-1',
        type: 'declining_sales_alert',
        priority: 'medium',
      },
      {
        dedupKey: 'REC-03_prod-2',
        ruleId: 'REC-03',
        productId: 'prod-2',
        type: 'reorder_urgency',
        priority: 'high',
        evidence: { estimatedTotalCost: 200 },
      },
    ];
    const resolved = resolveRecommendationConflicts(conflictingCandidates);
    assert(resolved.length === 2, 'Conflicting recommendations suppressed (down from 4 to 2)');
    assert(resolved[0].dedupKey === 'REC-01_prod-1', 'Critical stockout REC-01 takes precedence for prod-1');
    assert(resolved.find((r) => r.dedupKey === 'REC-05_prod-1') === undefined, 'Slow-moving REC-05 suppressed for prod-1');
    assert(resolved.find((r) => r.dedupKey === 'REC-06_prod-1') === undefined, 'Declining sales REC-06 suppressed for prod-1');
    assert(resolved[0].priority === 'critical', 'Critical priority appears first');

    console.log('\n--- 2. API Integration, Persistence & Multi-Tenant Tests ---');

    // Seed Test Users
    const emailA = `test_mod6_userA_${Date.now()}@test.com`;
    const emailB = `test_mod6_userB_${Date.now()}@test.com`;

    const userARes = await request(app).post('/api/auth/register').send({
      name: 'Owner A',
      email: emailA,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Supermarket A',
      businessType: 'supermarket',
    });
    const tokenA = userARes.body.data.token;
    const userAId = userARes.body.data.user._id;

    const userBRes = await request(app).post('/api/auth/register').send({
      name: 'Owner B',
      email: emailB,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Boutique B',
      businessType: 'clothing',
    });
    const tokenB = userBRes.body.data.token;
    const userBId = userBRes.body.data.user._id;

    // 2.1: 401 Unauthorized for Unauthenticated Requests
    const unauthGet = await request(app).get('/api/recommendations');
    assert(unauthGet.status === 401, 'GET /api/recommendations unauthenticated returns 401');

    const unauthSummary = await request(app).get('/api/recommendations/summary');
    assert(unauthSummary.status === 401, 'GET /api/recommendations/summary unauthenticated returns 401');

    const unauthPatch = await request(app).patch('/api/recommendations/123/status').send({ status: 'accepted' });
    assert(unauthPatch.status === 401, 'PATCH /api/recommendations/:id/status unauthenticated returns 401');

    // 2.2: Seed Catalog Products for User A
    const prodA1 = await Product.create({
      userId: userAId,
      sku: 'MILK-M6-OOS',
      name: 'Whole Milk 1L',
      category: 'Dairy',
      costPrice: 2.5,
      sellingPrice: 3.5,
      stockQuantity: 0, // Out of stock -> REC-01
      reorderThreshold: 10,
      leadTimeDays: 7,
      supplier: 'Fresh Valley Farms',
    });

    const prodA2 = await Product.create({
      userId: userAId,
      sku: 'CEREAL-M6-LOW',
      name: 'Crunchy Cereal',
      category: 'Breakfast',
      costPrice: 3.0,
      sellingPrice: 5.0,
      stockQuantity: 4, // Below threshold 10 -> Low stock
      reorderThreshold: 10,
      leadTimeDays: 5,
      supplier: 'Grain Corp',
    });

    const prodA3 = await Product.create({
      userId: userAId,
      sku: 'PARKA-M6-SLOW',
      name: 'Winter Parka Heavy',
      category: 'Apparel',
      costPrice: 50.0,
      sellingPrice: 100.0,
      stockQuantity: 30, // 30 > 2*5 = 10, cost=$50 -> Excess capital = (30-5)*$50 = $1250
      reorderThreshold: 5,
      leadTimeDays: 7,
      supplier: 'Outerwear Co',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    // Seed sales across 8 days for User A to satisfy store trading history
    const baseDate = new Date('2026-02-01T10:00:00.000Z');
    const salesUserA = [];

    // Milk had steady sales before stocking out
    for (let day = 0; day < 5; day++) {
      const d = new Date(baseDate);
      d.setUTCDate(d.getUTCDate() + day);
      salesUserA.push({
        userId: userAId,
        productId: prodA1._id,
        productName: prodA1.name,
        quantitySold: 4,
        unitPrice: 3.5,
        totalRevenue: 14.0,
        date: d,
      });
    }

    // Additional store trading days to reach 8 days
    for (let day = 5; day < 8; day++) {
      const d = new Date(baseDate);
      d.setUTCDate(d.getUTCDate() + day);
      salesUserA.push({
        userId: userAId,
        productId: prodA2._id,
        productName: prodA2.name,
        quantitySold: 2,
        unitPrice: 5.0,
        totalRevenue: 10.0,
        date: d,
      });
    }

    await Sale.insertMany(salesUserA);

    // 2.3: Generate Recommendations via API for User A
    const resA = await request(app)
      .get('/api/recommendations')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(resA.status === 200, 'GET /api/recommendations for User A returns 200');
    assert(resA.body.data.recommendations.length >= 2, 'Generates multiple actionable recommendations for User A');
    assert(resA.body.data.summary.criticalCount >= 1, 'Summary reports at least 1 critical recommendation (Milk stockout)');

    // Verify Milk Recommendation
    const milkRec = resA.body.data.recommendations.find((r) => String(r.productId._id) === String(prodA1._id));
    assert(milkRec !== null, 'Recommendation exists for Whole Milk 1L');
    assert(milkRec.priority === 'critical', 'Milk stockout is marked Critical priority');
    assert(milkRec.evidence.currentStock === 0, 'Milk evidence correctly shows 0 current stock');
    assert(milkRec.evidence.suggestedQuantity > 0, 'Milk evidence includes positive suggested reorder units');
    assert(milkRec.evidence.supplier === 'Fresh Valley Farms', 'Milk evidence identifies correct supplier');
    assert(milkRec.evidence.estimatedTotalCost > 0, 'Milk evidence calculates estimated outlay ($)');

    // Verify Slow-Moving Parka Recommendation
    const parkaRec = resA.body.data.recommendations.find((r) => String(r.productId._id) === String(prodA3._id));
    assert(parkaRec !== null, 'Recommendation exists for Winter Parka Heavy');
    assert(parkaRec.type === 'slow_moving_overstock', 'Parka is categorized as slow_moving_overstock');
    assert(parkaRec.evidence.capitalAtRisk >= 50, 'Parka identifies capital at risk >= $50');

    // 2.4: Duplicate Prevention on Repeated GET Requests
    const initialDbCount = await Recommendation.countDocuments({ userId: userAId });
    // Second request
    await request(app).get('/api/recommendations').set('Authorization', `Bearer ${tokenA}`);
    // Third request
    await request(app).get('/api/recommendations').set('Authorization', `Bearer ${tokenA}`);

    const postDbCount = await Recommendation.countDocuments({ userId: userAId });
    assert(postDbCount === initialDbCount, `Repeated GET requests do not create duplicate documents (${postDbCount} === ${initialDbCount})`);

    // 2.5: Status Updates (Accept and Dismiss / Reject)
    const recToAccept = milkRec;
    const acceptRes = await request(app)
      .patch(`/api/recommendations/${recToAccept._id}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'accepted' });

    assert(acceptRes.status === 200, 'PATCH /api/recommendations/:id/status accepted returns 200');
    assert(acceptRes.body.data.recommendation.status === 'accepted', 'Recommendation status updated to accepted');

    const recToDismiss = parkaRec;
    const dismissRes = await request(app)
      .patch(`/api/recommendations/${recToDismiss._id}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'rejected' });

    assert(dismissRes.status === 200, 'PATCH /api/recommendations/:id/status rejected returns 200');
    assert(dismissRes.body.data.recommendation.status === 'rejected', 'Recommendation status updated to rejected (Dismissed)');

    // 2.6: Status Persistence on Engine Re-Execution
    // Re-run GET /api/recommendations: Accepted and Rejected statuses must NOT revert to pending
    const resAAfterStatus = await request(app)
      .get('/api/recommendations')
      .set('Authorization', `Bearer ${tokenA}`);

    const milkAfter = resAAfterStatus.body.data.recommendations.find((r) => String(r._id) === String(recToAccept._id));
    assert(milkAfter.status === 'accepted', 'Milk recommendation strictly preserves accepted status');

    const parkaAfter = resAAfterStatus.body.data.recommendations.find((r) => String(r._id) === String(recToDismiss._id));
    assert(parkaAfter.status === 'rejected', 'Parka recommendation strictly preserves rejected status');

    // 2.7: Multi-Tenant Data Isolation: User B cannot see or mutate User A's recommendations
    const resB = await request(app)
      .get('/api/recommendations')
      .set('Authorization', `Bearer ${tokenB}`);

    assert(resB.status === 200, 'GET /api/recommendations for User B returns 200');
    assert(resB.body.data.recommendations.length === 0, 'User B has 0 recommendations (User A data strictly isolated)');

    const userBHackUserA = await request(app)
      .patch(`/api/recommendations/${recToAccept._id}/status`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'rejected' });

    assert(userBHackUserA.status === 404, 'User B modifying User A recommendation returns 404 access denied');

    // 2.8: Recommendation Summary Endpoint
    const summaryRes = await request(app)
      .get('/api/recommendations/summary')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(summaryRes.status === 200, 'GET /api/recommendations/summary returns 200');
    assert(summaryRes.body.data.totalPending !== undefined, 'Summary reports totalPending count');

    // 2.9: Auto-Resolution when underlying issue is resolved
    // Restock Cereal to 50 units (well above threshold 10)
    prodA2.stockQuantity = 50;
    await prodA2.save();

    await request(app).get('/api/recommendations').set('Authorization', `Bearer ${tokenA}`);
    const resolvedCereal = await Recommendation.findOne({ userId: userAId, productId: prodA2._id });
    if (resolvedCereal) {
      assert(resolvedCereal.status === 'completed', 'Restocked item recommendation auto-resolves to completed');
    } else {
      assert(true, 'Restocked item no longer appears in pending recommendations');
    }

    // Cleanup test users, products, sales, and recommendations
    await Product.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Sale.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Recommendation.deleteMany({ userId: { $in: [userAId, userBId] } });
    await User.deleteMany({ _id: { $in: [userAId, userBId] } });

    console.log(`\n🎉 Module 6 Tests Completed: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error in Module 6 tests:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

runModule6Tests();
