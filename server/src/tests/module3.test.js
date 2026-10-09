import '../config/testEnv.js';
import 'dotenv/config';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import { connectDB } from '../config/db.js';

async function runModule3Tests() {
  console.log('🧪 [START] Running Module 3: Business Intelligence Dashboard Tests...\n');
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

    // 0. Setup test users
    const emailA = 'm3_owner_a@test.com';
    const emailB = 'm3_owner_b@test.com';
    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    // Register User A
    const resRegA = await request(app).post('/api/auth/register').send({
      name: 'Owner A',
      email: emailA,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Fresh Mart A',
      businessType: 'supermarket',
    });
    const tokenA = resRegA.body.data.token;
    const userAId = resRegA.body.data.user._id;

    // Register User B
    const resRegB = await request(app).post('/api/auth/register').send({
      name: 'Owner B',
      email: emailB,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Boutique B',
      businessType: 'clothing',
    });
    const tokenB = resRegB.body.data.token;
    const userBId = resRegB.body.data.user._id;

    // Clean up collections for these users
    await Product.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Sale.deleteMany({ userId: { $in: [userAId, userBId] } });

    console.log('--- 1. Authentication & Route Protection ---');
    // Verify all analytics endpoints reject unauthenticated requests (401)
    const endpoints = [
      '/api/analytics/summary',
      '/api/analytics/revenue-by-product',
      '/api/analytics/revenue-by-category',
      '/api/analytics/sales-over-time',
      '/api/analytics/inventory-stock',
      '/api/analytics/low-stock',
    ];

    for (const ep of endpoints) {
      const res = await request(app).get(ep);
      assert(res.status === 401, `Unauthenticated GET ${ep} returns 401`);
    }

    console.log('\n--- 2. Empty Dataset Handling (Zero Records) ---');
    // For fresh User A
    const resSummaryEmpty = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resSummaryEmpty.status === 200, 'Empty /summary returns 200');
    assert(resSummaryEmpty.body.data.hasData === false, 'hasData is false for new store');
    assert(resSummaryEmpty.body.data.totalRevenue === 0, 'totalRevenue is 0 for empty store');
    assert(resSummaryEmpty.body.data.totalProducts === 0, 'totalProducts is 0 for empty store');
    assert(resSummaryEmpty.body.data.lowStockCount === 0, 'lowStockCount is 0 for empty store');
    assert(resSummaryEmpty.body.data.outOfStockCount === 0, 'outOfStockCount is 0 for empty store');

    const resProdEmpty = await request(app)
      .get('/api/analytics/revenue-by-product')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resProdEmpty.status === 200 && resProdEmpty.body.data.length === 0, 'Empty /revenue-by-product returns []');

    const resCatEmpty = await request(app)
      .get('/api/analytics/revenue-by-category')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resCatEmpty.status === 200 && resCatEmpty.body.data.length === 0, 'Empty /revenue-by-category returns []');

    const resTimeEmpty = await request(app)
      .get('/api/analytics/sales-over-time')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resTimeEmpty.status === 200 && resTimeEmpty.body.data.length === 0, 'Empty /sales-over-time returns []');

    const resStockEmpty = await request(app)
      .get('/api/analytics/inventory-stock')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resStockEmpty.status === 200 && resStockEmpty.body.data.length === 0, 'Empty /inventory-stock returns []');

    const resLowEmpty = await request(app)
      .get('/api/analytics/low-stock')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resLowEmpty.status === 200 && resLowEmpty.body.data.length === 0, 'Empty /low-stock returns []');

    console.log('\n--- 3. Seed Products & Sales for User A ---');
    // Product 1: In stock
    const prod1 = await Product.create({
      userId: userAId,
      sku: 'MILK-01',
      name: 'Organic Milk 1L',
      category: 'Dairy',
      costPrice: 2.0,
      sellingPrice: 4.0,
      stockQuantity: 15,
      reorderThreshold: 10,
    });

    // Product 2: Low stock (4 <= 10)
    const prod2 = await Product.create({
      userId: userAId,
      sku: 'CHEESE-01',
      name: 'Cheddar Cheese 200g',
      category: 'Dairy',
      costPrice: 3.0,
      sellingPrice: 6.0,
      stockQuantity: 4,
      reorderThreshold: 10,
    });

    // Product 3: Out of stock (0 <= 5)
    const prod3 = await Product.create({
      userId: userAId,
      sku: 'BREAD-01',
      name: 'Sourdough Loaf',
      category: 'Bakery',
      costPrice: 1.5,
      sellingPrice: 3.5,
      stockQuantity: 0,
      reorderThreshold: 5,
    });

    // Product 4: In stock
    const prod4 = await Product.create({
      userId: userAId,
      sku: 'SHIRT-01',
      name: 'Cotton Polo Shirt',
      category: 'Apparel',
      costPrice: 12.0,
      sellingPrice: 25.0,
      stockQuantity: 20,
      reorderThreshold: 5,
    });

    // Sales:
    // Sale 1: Linked to prod1 via productId (Date: 2026-10-01) -> $20
    await Sale.create({
      userId: userAId,
      productId: prod1._id,
      productName: prod1.name,
      quantitySold: 5,
      unitPrice: 4.0,
      totalRevenue: 20.0,
      date: new Date('2026-10-01T10:00:00Z'),
    });

    // Sale 2: Linked to prod2 via productId (Date: 2026-10-02) -> $18
    await Sale.create({
      userId: userAId,
      productId: prod2._id,
      productName: prod2.name,
      quantitySold: 3,
      unitPrice: 6.0,
      totalRevenue: 18.0,
      date: new Date('2026-10-02T11:00:00Z'),
    });

    // Sale 3: Historical sale without productId, matches prod1 name unambiguously (Date: 2026-10-03) -> $8
    await Sale.create({
      userId: userAId,
      productId: null,
      productName: 'Organic Milk 1L',
      quantitySold: 2,
      unitPrice: 4.0,
      totalRevenue: 8.0,
      date: new Date('2026-10-03T12:00:00Z'),
    });

    // Sale 4: Unlinked mystery item not in product catalog (Date: 2026-10-04) -> $12
    await Sale.create({
      userId: userAId,
      productId: null,
      productName: 'Mystery Vintage Mug',
      quantitySold: 1,
      unitPrice: 12.0,
      totalRevenue: 12.0,
      date: new Date('2026-10-04T13:00:00Z'),
    });

    console.log('\n--- 4. Summary Metrics & KPI Consistency ---');
    const resSummary = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(resSummary.status === 200, '/summary returned 200');
    assert(resSummary.body.data.totalProducts === 4, 'totalProducts equals 4');
    assert(resSummary.body.data.totalSalesCount === 4, 'totalSalesCount equals 4');
    assert(resSummary.body.data.totalUnitsSold === 11, 'totalUnitsSold equals 11 (5+3+2+1)');
    assert(resSummary.body.data.totalRevenue === 58, 'totalRevenue equals $58.00 (20+18+8+12)');
    assert(resSummary.body.data.lowStockCount === 2, 'lowStockCount equals 2 (Cheese & Bread)');
    assert(resSummary.body.data.outOfStockCount === 1, 'outOfStockCount equals 1 (Bread)');
    assert(resSummary.body.data.hasData === true, 'hasData is true');

    console.log('\n--- 5. Revenue by Product Aggregation ---');
    const resRevProd = await request(app)
      .get('/api/analytics/revenue-by-product')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(resRevProd.status === 200, '/revenue-by-product returns 200');
    const prodItems = resRevProd.body.data;
    assert(prodItems.length === 3, 'Groups into 3 distinct products');
    // Top product should be Organic Milk 1L with 20 + 8 = 28 revenue
    assert(prodItems[0].productName === 'Organic Milk 1L', 'Top revenue product is Organic Milk 1L');
    assert(prodItems[0].totalRevenue === 28, 'Organic Milk revenue aggregated to 28 (20+8)');
    assert(prodItems[0].quantitySold === 7, 'Organic Milk total units sold is 7 (5+2)');
    assert(prodItems[1].productName === 'Cheddar Cheese 200g' && prodItems[1].totalRevenue === 18, 'Second product is Cheddar Cheese ($18)');
    assert(prodItems[2].productName === 'Mystery Vintage Mug' && prodItems[2].totalRevenue === 12, 'Third product is Mystery Mug ($12)');

    // Verify sum of products matches summary total revenue
    const sumProdRevenue = prodItems.reduce((acc, p) => acc + p.totalRevenue, 0);
    assert(sumProdRevenue === 58, `Sum of product revenue (${sumProdRevenue}) matches KPI totalRevenue (58)`);

    console.log('\n--- 6. Category Revenue & Relationship Matching ---');
    const resRevCat = await request(app)
      .get('/api/analytics/revenue-by-category')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(resRevCat.status === 200, '/revenue-by-category returns 200');
    const catItems = resRevCat.body.data;
    assert(catItems.length === 2, 'Returns 2 categories (Dairy and Uncategorized)');

    const dairyCat = catItems.find((c) => c.category === 'Dairy');
    assert(!!dairyCat, 'Category "Dairy" is present');
    assert(dairyCat.totalRevenue === 46, 'Dairy revenue is 46 (Milk $28 + Cheese $18)');

    const uncatCat = catItems.find((c) => c.category === 'Uncategorized');
    assert(!!uncatCat, 'Mystery item correctly assigned to "Uncategorized"');
    assert(uncatCat.totalRevenue === 12, 'Uncategorized revenue is 12');

    const sumCatRevenue = catItems.reduce((acc, c) => acc + c.totalRevenue, 0);
    assert(sumCatRevenue === 58, `Sum of category revenues (${sumCatRevenue}) equals totalRevenue (58)`);

    console.log('\n--- 7. Category Ambiguity Protection Test ---');
    // Create two products with identical names but conflicting categories for User A
    await Product.create({
      userId: userAId,
      sku: 'GIFT-GOURMET',
      name: 'Deluxe Gift Basket',
      category: 'Gourmet Food',
      costPrice: 15,
      sellingPrice: 30,
      stockQuantity: 10,
      reorderThreshold: 5,
    });
    await Product.create({
      userId: userAId,
      sku: 'GIFT-SPA',
      name: 'Deluxe Gift Basket',
      category: 'Spa & Wellness',
      costPrice: 15,
      sellingPrice: 30,
      stockQuantity: 10,
      reorderThreshold: 5,
    });

    // Record an unlinked historical sale with the ambiguous name
    await Sale.create({
      userId: userAId,
      productId: null,
      productName: 'Deluxe Gift Basket',
      quantitySold: 1,
      unitPrice: 30.0,
      totalRevenue: 30.0,
      date: new Date('2026-10-05T10:00:00Z'),
    });

    const resAmbiguousCat = await request(app)
      .get('/api/analytics/revenue-by-category')
      .set('Authorization', `Bearer ${tokenA}`);

    const updatedUncat = resAmbiguousCat.body.data.find((c) => c.category === 'Uncategorized');
    assert(
      updatedUncat && updatedUncat.totalRevenue === 42,
      'Ambiguous product name safely classified as "Uncategorized" (12 + 30 = 42)'
    );

    console.log('\n--- 8. Sales Over Time & Date Filtering ---');
    // Without filters: returns all dates chronologically
    const resAllTime = await request(app)
      .get('/api/analytics/sales-over-time')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(resAllTime.status === 200, '/sales-over-time returns 200');
    const timeData = resAllTime.body.data;
    assert(timeData.length === 5, 'Contains 5 daily records');

    // Verify chronological ascending ordering
    let isChronological = true;
    for (let i = 1; i < timeData.length; i++) {
      if (timeData[i].date < timeData[i - 1].date) {
        isChronological = false;
        break;
      }
    }
    assert(isChronological, 'Dates are returned in strict chronological ascending order');

    // Test date range filter: startDate=2026-10-02, endDate=2026-10-03
    const resFilteredTime = await request(app)
      .get('/api/analytics/sales-over-time?startDate=2026-10-02&endDate=2026-10-03')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(resFilteredTime.status === 200, 'Filtered sales-over-time returns 200');
    assert(resFilteredTime.body.data.length === 2, 'Date range filter returned exactly 2 days');
    assert(resFilteredTime.body.data[0].date === '2026-10-02', 'First filtered date is 2026-10-02');
    assert(resFilteredTime.body.data[1].date === '2026-10-03', 'Second filtered date is 2026-10-03');
    assert(resFilteredTime.body.data[0].revenue === 18, 'Revenue on 2026-10-02 is 18');
    assert(resFilteredTime.body.data[1].revenue === 8, 'Revenue on 2026-10-03 is 8');

    console.log('\n--- 9. Inventory Stock & Low-Stock Calculations ---');
    const resStock = await request(app)
      .get('/api/analytics/inventory-stock')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(resStock.status === 200, '/inventory-stock returns 200');
    assert(resStock.body.data.length >= 4, 'Inventory stock returns all products for User A');

    const breadStock = resStock.body.data.find((p) => p.sku === 'BREAD-01');
    assert(breadStock.isOutOfStock === true, 'Sourdough bread isOutOfStock is true');
    assert(breadStock.status === 'Out of Stock', 'Sourdough bread status is "Out of Stock"');

    const cheeseStock = resStock.body.data.find((p) => p.sku === 'CHEESE-01');
    assert(cheeseStock.isOutOfStock === false && cheeseStock.isLowStock === true, 'Cheese is Low Stock but not Out of Stock');

    const milkStock = resStock.body.data.find((p) => p.sku === 'MILK-01');
    assert(milkStock.isLowStock === false && milkStock.status === 'In Stock', 'Milk is In Stock');

    // Test /low-stock endpoint
    const resLowStock = await request(app)
      .get('/api/analytics/low-stock')
      .set('Authorization', `Bearer ${tokenA}`);

    assert(resLowStock.status === 200, '/low-stock returns 200');
    const lowItems = resLowStock.body.data;
    assert(lowItems.length === 2, 'Low stock list contains exactly 2 items');
    assert(lowItems[0].sku === 'BREAD-01', 'Out-of-stock item (Bread) is prioritized first');
    assert(lowItems[0].status === 'Out of Stock', 'Bread is explicitly "Out of Stock"');
    assert(lowItems[0].deficit === 5, 'Bread deficit is 5 (threshold 5 - stock 0)');
    assert(lowItems[1].sku === 'CHEESE-01', 'Second item is Cheese');
    assert(lowItems[1].deficit === 6, 'Cheese deficit is 6 (threshold 10 - stock 4)');
    assert(lowItems[1].status === 'Critical', 'Cheese status is Critical (4 <= ceil(10/2))');

    console.log('\n--- 10. Multi-User Isolation ---');
    // Verify User B currently has 0 analytics data
    const resBEmpty = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${tokenB}`);
    assert(resBEmpty.body.data.totalRevenue === 0, 'User B has $0 revenue');
    assert(resBEmpty.body.data.totalProducts === 0, 'User B has 0 products');

    // User B adds 1 product and 1 sale
    const prodB = await Product.create({
      userId: userBId,
      sku: 'SCARF-B',
      name: 'Cashmere Scarf',
      category: 'Accessories',
      costPrice: 40,
      sellingPrice: 99,
      stockQuantity: 2,
      reorderThreshold: 5,
    });

    await Sale.create({
      userId: userBId,
      productId: prodB._id,
      productName: prodB.name,
      quantitySold: 1,
      unitPrice: 99.0,
      totalRevenue: 99.0,
      date: new Date('2026-10-06T12:00:00Z'),
    });

    // Check User B analytics
    const resBSummary = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${tokenB}`);
    assert(resBSummary.body.data.totalRevenue === 99, 'User B summary shows $99 revenue');
    assert(resBSummary.body.data.totalProducts === 1, 'User B summary shows 1 product');

    const resBProd = await request(app)
      .get('/api/analytics/revenue-by-product')
      .set('Authorization', `Bearer ${tokenB}`);
    assert(resBProd.body.data.length === 1 && resBProd.body.data[0].productName === 'Cashmere Scarf', 'User B sees only Cashmere Scarf');

    // Confirm User A is completely isolated and unaffected by User B's additions
    const resAConfirm = await request(app)
      .get('/api/analytics/revenue-by-product')
      .set('Authorization', `Bearer ${tokenA}`);
    const aHasScarf = resAConfirm.body.data.some((p) => p.productName === 'Cashmere Scarf');
    assert(!aHasScarf, 'User A does NOT see User B\'s Cashmere Scarf');

    const resASummaryConfirm = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resASummaryConfirm.body.data.totalRevenue === 88, 'User A summary revenue remains strictly $88.00');

    // Clean up
    await Product.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Sale.deleteMany({ userId: { $in: [userAId, userBId] } });
    await User.deleteMany({ _id: { $in: [userAId, userBId] } });

    console.log(`\n========================================`);
    console.log(`🎉 [COMPLETED] Module 3 Tests: ${passed} passed, ${failed} failed`);
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

runModule3Tests();
