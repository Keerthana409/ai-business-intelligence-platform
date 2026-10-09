import '../config/testEnv.js';
import 'dotenv/config';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import { connectDB } from '../config/db.js';

async function runModule2Tests() {
  console.log('🧪 [START] Running Module 2: Sales & Inventory Data Management Tests...\n');
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

    // 0. Setup two distinct test users for isolation testing
    const emailA = 'm2_user_a@test.com';
    const emailB = 'm2_user_b@test.com';
    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    // Register User A
    const resRegA = await request(app).post('/api/auth/register').send({
      name: 'Owner A',
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
      name: 'Owner B',
      email: emailB,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'Clothing Store B',
      businessType: 'clothing',
    });
    const tokenB = resRegB.body.data.token;
    const userBId = resRegB.body.data.user._id;

    // Clean up any old test items
    await Product.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Sale.deleteMany({ userId: { $in: [userAId, userBId] } });

    // ==========================================
    // PART 1: INVENTORY CRUD & SKU UNIQUENESS
    // ==========================================
    console.log('\n--- Part 1: Inventory Management & SKU Uniqueness ---');

    // Test 1: Create Product
    const resCreateProd = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        sku: 'MILK-001',
        name: 'Whole Milk 1L',
        category: 'Dairy',
        costPrice: 2.0,
        sellingPrice: 3.5,
        stockQuantity: 50,
        reorderThreshold: 15,
        unit: 'liters',
      });
    assert(resCreateProd.status === 201, 'User A can create a product (201)');
    const prodA = resCreateProd.body.data.product;

    // Test 2: Reject Duplicate SKU for User A
    const resDupSku = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        sku: 'MILK-001',
        name: 'Another Milk Brand',
        category: 'Dairy',
        costPrice: 2.1,
        sellingPrice: 3.8,
        stockQuantity: 20,
        reorderThreshold: 5,
      });
    assert(resDupSku.status === 400, 'Rejects duplicate SKU for the same user (400)');

    // Test 3: Same SKU allowed for DIFFERENT User B
    const resSameSkuUserB = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        sku: 'MILK-001',
        name: 'User B Milk',
        category: 'Dairy',
        costPrice: 2.5,
        sellingPrice: 4.0,
        stockQuantity: 10,
        reorderThreshold: 5,
      });
    assert(resSameSkuUserB.status === 201, 'Different user B can use the same SKU code without conflict (201)');

    // Test 4: Update Product
    const resUpdateProd = await request(app)
      .put(`/api/inventory/${prodA._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Organic Whole Milk 1L',
        sellingPrice: 3.75,
      });
    assert(resUpdateProd.status === 200, 'User A can update product details (200)');
    assert(resUpdateProd.body.data.product.sellingPrice === 3.75, 'Product price updated correctly in DB');

    // Test 5: Search & Filter Products
    const resFilter = await request(app)
      .get('/api/inventory?search=Organic')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resFilter.status === 200 && resFilter.body.data.products.length === 1, 'Search filters products correctly');

    // ==========================================
    // PART 2: SALES CRUD & STOCK SYNCHRONIZATION
    // ==========================================
    console.log('\n--- Part 2: Sales Transactions & Stock Synchronization ---');

    // Test 6: Create Sale with automatic totalRevenue calculation
    const resCreateSale = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        productId: prodA._id,
        productName: 'Organic Whole Milk 1L',
        quantitySold: 5,
        unitPrice: 3.75,
        date: '2026-10-05',
        paymentMethod: 'card',
      });
    assert(resCreateSale.status === 201, 'Creates sale record (201)');
    const saleA = resCreateSale.body.data.sale;
    assert(saleA.totalRevenue === 18.75, 'Automatically calculates totalRevenue = 5 * 3.75 = 18.75');

    // Test 7: Verify Stock Deduction
    const checkStockAfterSale = await Product.findById(prodA._id);
    assert(checkStockAfterSale.stockQuantity === 45, 'Automatically deducts 5 units from inventory stock (50 -> 45)');

    // Test 8: Reject Negative Sale Quantity
    const resNegQty = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        productName: 'Any Product',
        quantitySold: -3,
        unitPrice: 10,
      });
    assert(resNegQty.status === 400, 'Rejects negative sale quantity (400)');

    // Test 9: Update Sale & Adjust Stock Delta
    const resUpdateSale = await request(app)
      .put(`/api/sales/${saleA._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        quantitySold: 8, // Sold 3 more units (5 -> 8)
      });
    assert(resUpdateSale.status === 200, 'Updates sale quantity (200)');
    assert(resUpdateSale.body.data.sale.totalRevenue === 30.0, 'Recalculates totalRevenue = 8 * 3.75 = 30.00');

    const checkStockAfterUpdate = await Product.findById(prodA._id);
    assert(checkStockAfterUpdate.stockQuantity === 42, 'Adjusts inventory stock by delta (45 - 3 = 42)');

    // Test 10: Delete Sale & Restore Stock
    const resDelSale = await request(app)
      .delete(`/api/sales/${saleA._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resDelSale.status === 200, 'Deletes sale record (200)');

    const checkStockAfterDelete = await Product.findById(prodA._id);
    assert(checkStockAfterDelete.stockQuantity === 50, 'Restores inventory stock upon sale deletion (42 + 8 = 50)');

    // Re-create a sale for analytics testing
    await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        productId: prodA._id,
        productName: 'Organic Whole Milk 1L',
        quantitySold: 10,
        unitPrice: 3.5,
        date: '2026-10-08',
      });

    // ==========================================
    // PART 3: USER DATA ISOLATION (MULTI-TENANCY)
    // ==========================================
    console.log('\n--- Part 3: User Data Isolation ---');

    // Test 11: User B cannot view User A's products
    const resUserBProds = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${tokenB}`);
    const foundAInB = resUserBProds.body.data.products.some((p) => p._id === prodA._id);
    assert(!foundAInB, "User B's inventory does NOT contain User A's products");

    // Test 12: User B cannot modify User A's product
    const resUserBEditA = await request(app)
      .put(`/api/inventory/${prodA._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Hacked Name' });
    assert(resUserBEditA.status === 404, "User B receives 404 when attempting to edit User A's product");

    // Test 13: User B cannot delete User A's product
    const resUserBDelA = await request(app)
      .delete(`/api/inventory/${prodA._id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert(resUserBDelA.status === 404, "User B receives 404 when attempting to delete User A's product");

    // ==========================================
    // PART 4: CSV PREVIEW, VALIDATION & IMPORT
    // ==========================================
    console.log('\n--- Part 4: CSV Preview & Validation ---');

    // Test 14: Download Templates
    const resSalesTpl = await request(app)
      .get('/api/sales/template')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resSalesTpl.status === 200 && resSalesTpl.text.includes('date,productName,quantity,unitPrice'), 'Sales CSV template downloadable with correct headers');

    const resInvTpl = await request(app)
      .get('/api/inventory/template')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resInvTpl.status === 200 && resInvTpl.text.includes('sku,category,costPrice'), 'Inventory CSV template downloadable with correct headers');

    // Test 15: Invalid Sales CSV Preview (Reports Errors With Row Numbers)
    const invalidSalesCsv = Buffer.from(
      'date,productName,quantity,unitPrice\n' +
      '2026-10-01,Valid Apple,5,1.50\n' +
      'not-a-date,Bad Date Banana,2,0.99\n' +
      '2026-10-02,Bad Qty Orange,-1,2.00\n'
    );
    const resPreviewInvalid = await request(app)
      .post('/api/sales/preview-csv')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', invalidSalesCsv, 'test_sales.csv');
    assert(resPreviewInvalid.status === 200, 'Preview endpoint processes CSV (200)');
    assert(resPreviewInvalid.body.data.validCount === 1, 'Correctly identifies 1 valid row');
    assert(resPreviewInvalid.body.data.invalidCount === 2, 'Correctly identifies 2 invalid rows');
    assert(resPreviewInvalid.body.data.invalidRows[0].rowNumber === 3, 'Reports row number 3 for bad date');

    // Test 16: Confirmed Sales Import writes to DB
    const validRowsToImport = [
      {
        productName: 'Imported Bread',
        quantitySold: 4,
        unitPrice: 2.5,
        date: '2026-10-07',
      },
      {
        productName: 'Imported Cheese',
        quantitySold: 2,
        unitPrice: 5.0,
        date: '2026-10-07',
      },
    ];
    const resConfirmImport = await request(app)
      .post('/api/sales/import-csv')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: validRowsToImport });
    assert(resConfirmImport.status === 200, 'Imports confirmed sales rows into MongoDB (200)');
    assert(resConfirmImport.body.data.importedCount === 2, 'Reports 2 sales records imported');

    // ==========================================
    // PART 5: DASHBOARD REAL METRICS
    // ==========================================
    console.log('\n--- Part 5: Real Analytics Summary Metrics ---');

    const resMetrics = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resMetrics.status === 200, 'Analytics summary endpoint accessible (200)');
    const m = resMetrics.body.data;
    assert(m.totalProducts >= 1, `Calculates actual product count (${m.totalProducts})`);
    assert(m.totalSalesCount >= 3, `Calculates actual sales records count (${m.totalSalesCount})`);
    // User A has 1 sale of 10 @ 3.50 (35.00) + 1 sale of 4 @ 2.50 (10.00) + 1 sale of 2 @ 5.00 (10.00) = 55.00
    assert(m.totalRevenue === 55.0, `Calculates real recorded revenue ($55.00 vs found $${m.totalRevenue})`);
    assert(m.totalUnitsSold === 16, `Calculates real units sold (16 vs found ${m.totalUnitsSold})`);

    // ==========================================
    // PART 6: REGRESSION TEST FOR AUTHENTICATION
    // ==========================================
    console.log('\n--- Part 6: Authentication Regression ---');

    const resLoginA = await request(app).post('/api/auth/login').send({
      email: emailA,
      password: 'password123',
    });
    assert(resLoginA.status === 200, 'Login still works smoothly (200)');

    const resProfileA = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenA}`);
    assert(resProfileA.status === 200 && resProfileA.body.data.user.email === emailA, 'Protected profile access remains functional (200)');

    // ==========================================
    // CLEANUP
    // ==========================================
    await Product.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Sale.deleteMany({ userId: { $in: [userAId, userBId] } });
    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    console.log(`\n📊 [SUMMARY]: ${passed} passed, ${failed} failed`);
  } catch (err) {
    console.error('❌ Test Execution Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runModule2Tests();
