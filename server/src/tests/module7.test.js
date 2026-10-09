import '../config/testEnv.js';
import 'dotenv/config';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Scenario from '../models/Scenario.js';
import { connectDB } from '../config/db.js';
import {
  roundCurrency,
  roundQuantity,
  calculatePercentageChange,
  simulatePriceChange,
  simulateDemandChange,
  simulateInventoryReorder,
  simulateDiscount,
} from '../utils/scenarioEngine.js';

async function runModule7Tests() {
  console.log('🧪 [START] Running Module 7: What-If Scenario Simulation Engine Tests...\n');
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

    console.log('--- 1. Pure Mathematical & Scenario Engine Unit Tests ---');

    // 1.1 Currency Precision & Rounding
    assert(roundCurrency(19.994) === 19.99, 'roundCurrency preserves 2 decimal places (cents)');
    assert(roundCurrency(19.996) === 20.00, 'roundCurrency rounds 19.996 to 20.00');
    assert(roundQuantity(14.6) === 15, 'roundQuantity rounds 14.6 to whole units (15)');
    assert(roundQuantity(-5) === 0, 'roundQuantity floors negative values to 0');

    // 1.2 Zero-Baseline Percentage Division-by-Zero Protection
    assert(calculatePercentageChange(0, 500) === null, 'calculatePercentageChange returns null when baseline is 0');
    assert(calculatePercentageChange(null, 500) === null, 'calculatePercentageChange returns null when baseline is null');
    assert(calculatePercentageChange(100, 120) === 20.0, 'calculatePercentageChange computes +20.0% correctly');
    assert(calculatePercentageChange(100, 80) === -20.0, 'calculatePercentageChange computes -20.0% correctly');

    // 1.3 Price Change - Constant Demand Mode
    const priceConstant = simulatePriceChange({
      product: { name: 'Almond Milk', sellingPrice: 4.0, costPrice: 2.5 },
      proposedPrice: 5.0,
      demandMode: 'constant',
      historicalSales: [{ quantitySold: 20, totalRevenue: 80.0 }],
    });
    assert(priceConstant.baseline.sellingPrice === 4.0, 'Price Constant: Baseline price is $4.00');
    assert(priceConstant.simulated.sellingPrice === 5.0, 'Price Constant: Simulated price is $5.00');
    assert(priceConstant.baseline.quantitySold === 20, 'Price Constant: Baseline quantity is 20');
    assert(priceConstant.simulated.quantitySold === 20, 'Price Constant: Simulated quantity remains 20 in constant mode');
    assert(priceConstant.baseline.revenue === 80.0, 'Price Constant: Baseline revenue is $80.00');
    assert(priceConstant.simulated.revenue === 100.0, 'Price Constant: Simulated revenue is $100.00');
    assert(priceConstant.baseline.grossProfit === 30.0, 'Price Constant: Baseline profit is (4-2.5)*20 = $30.00');
    assert(priceConstant.simulated.grossProfit === 50.0, 'Price Constant: Simulated profit is (5-2.5)*20 = $50.00');
    assert(priceConstant.comparison.revenue.absolute === 20.0, 'Price Constant: Delta revenue is +$20.00');
    assert(priceConstant.comparison.revenue.percentage === 25.0, 'Price Constant: Delta revenue is +25.0%');

    // 1.4 Price Change - Assumption-based Demand Mode
    const priceAssumption = simulatePriceChange({
      product: { name: 'Artisan Bread', sellingPrice: 10.0, costPrice: 4.0 },
      proposedPrice: 12.0,
      demandMode: 'assumption',
      demandChangePercent: -15, // 15% drop in volume
      historicalSales: [{ quantitySold: 100, totalRevenue: 1000.0 }],
    });
    assert(priceAssumption.simulated.quantitySold === 85, 'Price Assumption: 100 units with -15% demand yields 85 units');
    assert(priceAssumption.simulated.revenue === 1020.0, 'Price Assumption: 85 * $12 = $1020.00');
    assert(priceAssumption.simulated.grossProfit === 680.0, 'Price Assumption: 85 * ($12 - $4) = $680.00 (vs $600 baseline)');
    assert(priceAssumption.comparison.grossProfit.absolute === 80.0, 'Price Assumption: Gross profit increases by $80.00');

    // 1.5 Missing Unit Cost Handling
    const priceNoCost = simulatePriceChange({
      product: { name: 'Novelty Mug', sellingPrice: 15.0, costPrice: null },
      proposedPrice: 18.0,
      historicalSales: [{ quantitySold: 10, totalRevenue: 150.0 }],
    });
    assert(priceNoCost.product.hasValidCost === false, 'Price No Cost: Flags hasValidCost as false');
    assert(priceNoCost.baseline.grossProfit === null, 'Price No Cost: Baseline gross profit is null');
    assert(priceNoCost.simulated.grossProfit === null, 'Price No Cost: Simulated gross profit is null');
    assert(priceNoCost.limitations.length > 0, 'Price No Cost: Discloses missing unit cost in limitations');

    // 1.6 Demand Change Simulation
    const demandSim = simulateDemandChange({
      product: { name: 'Greek Yogurt', sellingPrice: 5.0, costPrice: 3.0 },
      demandChangePercent: 30, // +30% demand
      historicalSales: [{ quantitySold: 40, totalRevenue: 200.0 }],
      simulationPeriodDays: 30,
    });
    assert(demandSim.baseline.quantitySold === 40, 'Demand Sim: Baseline quantity is 40');
    assert(demandSim.simulated.quantitySold === 52, 'Demand Sim: Simulated quantity is 40 * 1.3 = 52 units');
    assert(demandSim.simulated.revenue === 260.0, 'Demand Sim: Simulated revenue is 52 * $5 = $260.00');
    assert(demandSim.simulated.grossProfit === 104.0, 'Demand Sim: Simulated profit is 52 * ($5-$3) = $104.00');
    assert(demandSim.comparison.quantity.percentage === 30.0, 'Demand Sim: Quantity percentage change is +30.0%');

    // 1.7 Inventory Reorder - Chronological Timing with Demand Depletion
    const invReorderWithDemand = simulateInventoryReorder({
      product: { stockQuantity: 20, reorderThreshold: 15, leadTimeDays: 7, costPrice: 10.0 },
      currentStock: 20,
      proposedOrderQuantity: 50,
      leadTimeDays: 7,
      safetyStockTarget: 15,
      historicalDemand: {
        hasSufficientData: true,
        avgDailyDemand: 2.0,
      },
    });
    // Timeline checks:
    // Lead-time demand = 2.0 * 7 = 14 units
    // Pre-receipt remaining = 20 - 14 = 6 units (no stockout before arrival)
    // Post-receipt stock = 6 + 50 = 56 units
    assert(invReorderWithDemand.timeline.stockBeforeArrival === 20, 'Inv Timeline: Stock before arrival is 20');
    assert(invReorderWithDemand.timeline.leadTimeDemand === 14, 'Inv Timeline: Lead-time demand is 14 units');
    assert(invReorderWithDemand.timeline.preReceiptRemainingStock === 6, 'Inv Timeline: Pre-receipt remaining stock is 6 units');
    assert(invReorderWithDemand.timeline.isStockoutBeforeArrival === false, 'Inv Timeline: No pre-receipt stockout');
    assert(invReorderWithDemand.timeline.stockPostDeliveryAndDemand === 56, 'Inv Timeline: Stock post delivery & demand is 56 units');
    assert(invReorderWithDemand.timeline.stockAtReceipt === 70, 'Inv Timeline: Nominal stock upon unpack is 20 + 50 = 70');
    assert(invReorderWithDemand.timeline.isBelowSafetyThreshold === false, 'Inv Timeline: 56 units >= 15 target buffer');
    assert(invReorderWithDemand.financialImpact.estimatedInvestment === 500.0, 'Inv Timeline: Outlay is 50 * $10 = $500.00');

    // 1.8 Inventory Reorder - Stockout Exposure Before Delivery
    const invStockout = simulateInventoryReorder({
      product: { stockQuantity: 5, reorderThreshold: 10, leadTimeDays: 7 },
      currentStock: 5,
      proposedOrderQuantity: 40,
      leadTimeDays: 7,
      safetyStockTarget: 10,
      historicalDemand: {
        hasSufficientData: true,
        avgDailyDemand: 2.0, // 14 units needed, only 5 on hand!
      },
    });
    assert(invStockout.timeline.isStockoutBeforeArrival === true, 'Inv Stockout: Flags stockout before order arrives');
    assert(invStockout.timeline.preReceiptStockoutUnits === 9, 'Inv Stockout: Unmet customer demand is 14 - 5 = 9 units');
    assert(invStockout.timeline.preReceiptRemainingStock === 0, 'Inv Stockout: Pre-receipt stock completely depleted to 0');
    assert(invStockout.timeline.stockPostDeliveryAndDemand === 40, 'Inv Stockout: Post-delivery stock is 0 + 40 = 40 units');

    // 1.9 Inventory Reorder - Insufficient Data Limitation
    const invNoHistory = simulateInventoryReorder({
      product: { stockQuantity: 10, reorderThreshold: 15, leadTimeDays: 7 },
      currentStock: 10,
      proposedOrderQuantity: 30,
      historicalDemand: { hasSufficientData: false },
    });
    assert(invNoHistory.timeline.leadTimeDemand === null, 'Inv No History: Lead-time demand is null');
    assert(invNoHistory.timeline.isStockoutBeforeArrival === null, 'Inv No History: Does not fabricate stockout probability');
    assert(invNoHistory.limitations.length > 0, 'Inv No History: Plainly discloses insufficient history limitation');

    // 1.10 Discount Simulation - 2-Decimal Precision & Profit-Matching Volume
    const discountValid = simulateDiscount({
      product: { name: 'Ground Coffee 500g', sellingPrice: 20.0, costPrice: 10.0 },
      discountPercent: 20, // 20% discount -> $16.00 price, unit margin = $6.00
      historicalSales: [{ quantitySold: 30, totalRevenue: 600.0 }],
    });
    // Baseline profit: (20 - 10) * 30 = $300.00
    // Discounted price = $16.00 (preserves 2 decimals)
    // Discounted margin = $16 - $10 = $6.00
    // Q_match = ceil(300 / 6) = 50 units
    assert(discountValid.simulated.sellingPrice === 16.0, 'Discount: Unit price is $16.00');
    assert(discountValid.profitMatch.discountedUnitMargin === 6.0, 'Discount: Discounted unit margin is $6.00');
    assert(discountValid.profitMatch.profitMatchQuantity === 50, 'Discount: Profit-matching volume is ceil(300/6) = 50 units');
    assert(discountValid.profitMatch.isProfitMatchPossible === true, 'Discount: Profit-matching is possible');
    assert(discountValid.profitMatch.pctVolumeIncreaseNeeded === 66.7, 'Discount: Required volume bump is +66.7% (50 vs 30)');

    // 1.11 Discount Simulation - Unprofitable Discount (Price <= Cost)
    const discountUnprofitable = simulateDiscount({
      product: { name: 'Loss Leader Eggs', sellingPrice: 10.0, costPrice: 8.0 },
      discountPercent: 25, // 25% discount -> $7.50 price <= $8.00 cost!
      historicalSales: [{ quantitySold: 20, totalRevenue: 200.0 }],
    });
    assert(discountUnprofitable.simulated.sellingPrice === 7.5, 'Discount Unprofitable: Price is $7.50');
    assert(discountUnprofitable.profitMatch.discountedUnitMargin === -0.5, 'Discount Unprofitable: Unit margin is -$0.50');
    assert(discountUnprofitable.profitMatch.profitMatchQuantity === null, 'Discount Unprofitable: Q_match is null');
    assert(discountUnprofitable.profitMatch.isProfitMatchPossible === false, 'Discount Unprofitable: Flags match impossible');
    assert(discountUnprofitable.profitMatch.isMarginZeroOrNegative === true, 'Discount Unprofitable: Flags negative margin');

    // 1.12 Discount Simulation - Non-Positive Baseline Gross Profit
    const discountZeroBaselineProfit = simulateDiscount({
      product: { name: 'Clearance T-Shirt', sellingPrice: 5.0, costPrice: 5.0 }, // margin = 0
      discountPercent: 10,
      historicalSales: [{ quantitySold: 10, totalRevenue: 50.0 }],
    });
    assert(discountZeroBaselineProfit.baseline.grossProfit === 0, 'Discount Zero Profit: Baseline profit is $0.00');
    assert(discountZeroBaselineProfit.profitMatch.profitMatchQuantity === null, 'Discount Zero Profit: Q_match is null when baseline profit is 0');
    assert(discountZeroBaselineProfit.profitMatch.isProfitMatchPossible === false, 'Discount Zero Profit: Labeled not applicable');

    console.log('\n--- 2. Non-Destructive Execution Tests ---');
    // Prepare test user and catalog product
    const emailA = `sim_userA_${Date.now()}@test.com`;
    const emailB = `sim_userB_${Date.now()}@test.com`;

    const userARes = await request(app).post('/api/auth/register').send({
      name: 'Sim User A',
      email: emailA,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Sim Mart A',
      businessType: 'supermarket',
    });
    const tokenA = userARes.body.data.token;
    const userAId = userARes.body.data.user._id;

    const userBRes = await request(app).post('/api/auth/register').send({
      name: 'Sim User B',
      email: emailB,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Sim Mart B',
      businessType: 'clothing',
    });
    const tokenB = userBRes.body.data.token;
    const userBId = userBRes.body.data.user._id;

    const testProdA = await Product.create({
      userId: userAId,
      sku: 'SIM-PROD-A',
      name: 'Organic Honey 500g',
      category: 'Pantry',
      costPrice: 6.0,
      sellingPrice: 12.0,
      stockQuantity: 25,
      reorderThreshold: 10,
      leadTimeDays: 7,
    });

    await Sale.create({
      userId: userAId,
      productId: testProdA._id,
      productName: testProdA.name,
      quantitySold: 15,
      unitPrice: 12.0,
      totalRevenue: 180.0,
      date: new Date(),
    });

    // Checksum counts before running simulation
    const prodCountBefore = await Product.countDocuments();
    const saleCountBefore = await Sale.countDocuments();
    const scenarioCountBefore = await Scenario.countDocuments();

    // Call POST /api/scenarios/simulate with extreme parameters
    const simRes = await request(app)
      .post('/api/scenarios/simulate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        scenarioType: 'price_change',
        productId: testProdA._id,
        proposedPrice: 99.0,
        demandMode: 'assumption',
        demandChangePercent: 200,
      });

    assert(simRes.status === 200, 'POST /api/scenarios/simulate returns 200 OK');
    assert(simRes.body.data.simulated.sellingPrice === 99.0, 'Simulation calculates requested price change');

    // Verify non-destructive guarantee: zero records created or modified!
    const prodCountAfter = await Product.countDocuments();
    const saleCountAfter = await Sale.countDocuments();
    const scenarioCountAfter = await Scenario.countDocuments();
    const prodCheck = await Product.findById(testProdA._id);

    assert(prodCountBefore === prodCountAfter, 'Non-destructive: Product count is completely unchanged');
    assert(saleCountBefore === saleCountAfter, 'Non-destructive: Sale count is completely unchanged');
    assert(scenarioCountBefore === scenarioCountAfter, 'Non-destructive: Simulation run does not auto-save to Scenario collection');
    assert(prodCheck.sellingPrice === 12.0, 'Non-destructive: Live catalog selling price strictly preserved ($12.00 vs simulated $99.00)');
    assert(prodCheck.stockQuantity === 25, 'Non-destructive: Live catalog stock quantity strictly preserved');

    console.log('\n--- 3. API Integration, Persistence & Multi-Tenant Tests ---');

    // 3.1 Security & Authentication
    const unauthSim = await request(app).post('/api/scenarios/simulate').send({ scenarioType: 'demand_change' });
    assert(unauthSim.status === 401, 'POST /api/scenarios/simulate unauthenticated returns 401');

    const unauthSave = await request(app).post('/api/scenarios').send({ name: 'Test' });
    assert(unauthSave.status === 401, 'POST /api/scenarios unauthenticated returns 401');

    const unauthList = await request(app).get('/api/scenarios');
    assert(unauthList.status === 401, 'GET /api/scenarios unauthenticated returns 401');

    // 3.2 Compatibility Alias Check (/api/simulation/what-if)
    const aliasRes = await request(app)
      .post('/api/simulation/what-if')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        scenarioType: 'demand_change',
        productId: testProdA._id,
        demandChangePercent: 25,
      });
    assert(aliasRes.status === 200, 'POST /api/simulation/what-if alias works and returns 200');

    // 3.3 Create Scenario (Persistence)
    const saveRes = await request(app)
      .post('/api/scenarios')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Honey 20% Price Rise Plan',
        description: 'Testing price elasticity on organic honey',
        scenarioType: 'price_change',
        productId: testProdA._id,
        inputs: { proposedPrice: 14.4, demandMode: 'constant' },
        baselineResults: simRes.body.data.baseline,
        simulatedResults: simRes.body.data.simulated,
        comparison: simRes.body.data.comparison,
        assumptions: simRes.body.data.assumptions,
        limitations: simRes.body.data.limitations,
      });

    assert(saveRes.status === 201, 'POST /api/scenarios returns 201 Created');
    assert(saveRes.body.data.scenario.name === 'Honey 20% Price Rise Plan', 'Saved scenario records correct title');
    assert(saveRes.body.data.scenario.productName === 'Organic Honey 500g', 'Resolves correct product name');

    const scenarioId = saveRes.body.data.scenario._id;

    // 3.4 Retrieve Scenarios for User A
    const listResA = await request(app).get('/api/scenarios').set('Authorization', `Bearer ${tokenA}`);
    assert(listResA.status === 200, 'GET /api/scenarios returns 200 OK');
    assert(listResA.body.data.total === 1, 'User A has exactly 1 saved scenario');

    // 3.5 Multi-Tenant Isolation: User B cannot see or manipulate User A's scenario
    const listResB = await request(app).get('/api/scenarios').set('Authorization', `Bearer ${tokenB}`);
    assert(listResB.status === 200, 'GET /api/scenarios for User B returns 200');
    assert(listResB.body.data.total === 0, 'User B has 0 scenarios (User A scenarios completely isolated)');

    const getOtherRes = await request(app).get(`/api/scenarios/${scenarioId}`).set('Authorization', `Bearer ${tokenB}`);
    assert(getOtherRes.status === 404, 'User B querying User A scenario returns 404 access denied');

    const updateOtherRes = await request(app)
      .put(`/api/scenarios/${scenarioId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Hacked Title' });
    assert(updateOtherRes.status === 404, 'User B updating User A scenario returns 404 access denied');

    const deleteOtherRes = await request(app)
      .delete(`/api/scenarios/${scenarioId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert(deleteOtherRes.status === 404, 'User B deleting User A scenario returns 404 access denied');

    // 3.6 Update Scenario (Authorized)
    const updateRes = await request(app)
      .put(`/api/scenarios/${scenarioId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Updated Honey Plan' });
    assert(updateRes.status === 200, 'PUT /api/scenarios/:id updates name to "Updated Honey Plan"');

    // 3.7 Delete Scenario (Authorized)
    const deleteRes = await request(app)
      .delete(`/api/scenarios/${scenarioId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert(deleteRes.status === 200, 'DELETE /api/scenarios/:id successfully deletes scenario');

    const verifyDeleted = await Scenario.findById(scenarioId);
    assert(verifyDeleted === null, 'Scenario document successfully removed from database');

    // Scoped cleanup strictly for test users
    if (userAId || userBId) {
      const cleanupIds = [userAId, userBId].filter(Boolean);
      await Product.deleteMany({ userId: { $in: cleanupIds } });
      await Sale.deleteMany({ userId: { $in: cleanupIds } });
      await Scenario.deleteMany({ userId: { $in: cleanupIds } });
      await User.deleteMany({ _id: { $in: cleanupIds } });
    }

    console.log(`\n🎉 Module 7 Tests Completed: ${passed} Passed, ${failed} Failed`);
    return { passed, failed };
  } catch (error) {
    console.error('💥 Fatal error running Module 7 tests:', error);
    return { passed, failed: failed + 1 };
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1]?.endsWith('module7.test.js')) {
  runModule7Tests().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

export default runModule7Tests;
