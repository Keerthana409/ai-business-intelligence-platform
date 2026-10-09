import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import { isTestEnvironment } from '../config/db.js';

/**
 * RECOVERY DATA DEFINITIONS
 * Recovered from verbatim audit logs prior to test-induced data loss.
 */

// 1. Recovered Products
export const HISTORICAL_PRODUCTS = [
  {
    sku: 'BRD-002',
    name: 'Brown Bread 400g',
    category: 'Bakery',
    sellingPrice: 2.2,
    costPrice: 1.2, // VERIFIED HISTORICAL FACT from recommendation audit log
    costStatus: 'VERIFIED_HISTORICAL',
    stockQuantity: 0,
    reorderThreshold: 10,
    leadTimeDays: 7,
    unit: 'pcs',
  },
  {
    sku: 'S001',
    name: 'Sugar',
    category: 'Grocery',
    sellingPrice: 45.0,
    costPrice: 35.0, // VERIFIED HISTORICAL FACT from recommendation audit log
    costStatus: 'VERIFIED_HISTORICAL',
    stockQuantity: 15,
    reorderThreshold: 25,
    leadTimeDays: 7,
    unit: 'pcs',
  },
  {
    sku: 'S002',
    name: 'Soap',
    category: 'Personal Care',
    sellingPrice: 25.0,
    costPrice: 18.0, // VERIFIED HISTORICAL FACT from recommendation audit log
    costStatus: 'VERIFIED_HISTORICAL',
    stockQuantity: 12,
    reorderThreshold: 15,
    leadTimeDays: 7,
    unit: 'pcs',
  },
  {
    sku: 'R001',
    name: 'Rice',
    category: 'Grocery',
    sellingPrice: 60.0,
    costPrice: 45.0, // PROPOSED ESTIMATE (75% of selling price, pending approval)
    costStatus: 'PROPOSED_ESTIMATE',
    stockQuantity: 100,
    reorderThreshold: 20,
    leadTimeDays: 7,
    unit: 'pcs',
  },
  {
    sku: 'W001',
    name: 'Wheat Flour',
    category: 'Grocery',
    sellingPrice: 40.0,
    costPrice: 30.0, // PROPOSED ESTIMATE (75% of selling price, pending approval)
    costStatus: 'PROPOSED_ESTIMATE',
    stockQuantity: 50,
    reorderThreshold: 10,
    leadTimeDays: 7,
    unit: 'pcs',
  },
  {
    sku: 'M001',
    name: 'Milk',
    category: 'Dairy',
    sellingPrice: 30.0,
    costPrice: 22.0, // PROPOSED ESTIMATE (73% of selling price, pending approval)
    costStatus: 'PROPOSED_ESTIMATE',
    stockQuantity: 40,
    reorderThreshold: 10,
    leadTimeDays: 7,
    unit: 'pcs',
  },
  {
    sku: 'B001',
    name: 'Biscuits',
    category: 'Snacks',
    sellingPrice: 10.0,
    costPrice: 7.0, // PROPOSED ESTIMATE (70% of selling price, pending approval)
    costStatus: 'PROPOSED_ESTIMATE',
    stockQuantity: 80,
    reorderThreshold: 20,
    leadTimeDays: 7,
    unit: 'pcs',
  },
];

// 2. Recovered Sales Records (13 Historical Documents)
export const HISTORICAL_SALES = [
  // Batch 1 (created 2026-10-09T14:04:39Z, hex 6ac8e327)
  {
    originalId: '6ac8e32707071764cd3074ae',
    batch: 'Batch_1',
    date: new Date('2026-10-01T00:00:00.000Z'),
    productName: 'Rice',
    targetSku: 'R001',
    quantitySold: 10,
    unitPrice: 60,
    totalRevenue: 600,
    paymentMethod: 'cash',
  },
  {
    originalId: '6ac8e32707071764cd3074b1',
    batch: 'Batch_1',
    date: new Date('2026-10-02T00:00:00.000Z'),
    productName: 'Sugar',
    targetSku: 'S001',
    quantitySold: 5,
    unitPrice: 45,
    totalRevenue: 225,
    paymentMethod: 'cash',
  },
  {
    originalId: '6ac8e32707071764cd3074b4',
    batch: 'Batch_1',
    date: new Date('2026-10-03T00:00:00.000Z'),
    productName: 'Wheat Flour',
    targetSku: 'W001',
    quantitySold: 8,
    unitPrice: 40,
    totalRevenue: 320,
    paymentMethod: 'cash',
  },
  {
    originalId: '6ac8e32707071764cd3074b7',
    batch: 'Batch_1',
    date: new Date('2026-10-04T00:00:00.000Z'),
    productName: 'Milk',
    targetSku: 'M001',
    quantitySold: 12,
    unitPrice: 30,
    totalRevenue: 360,
    paymentMethod: 'cash',
  },
  {
    originalId: '6ac8e32707071764cd3074ba',
    batch: 'Batch_1',
    date: new Date('2026-10-05T00:00:00.000Z'),
    productName: 'Soap',
    targetSku: 'S002',
    quantitySold: 6,
    unitPrice: 25,
    totalRevenue: 150,
    paymentMethod: 'cash',
  },
  {
    originalId: '6ac8e32707071764cd3074bd',
    batch: 'Batch_1',
    date: new Date('2026-10-06T00:00:00.000Z'),
    productName: 'Biscuits',
    targetSku: 'B001',
    quantitySold: 15,
    unitPrice: 10,
    totalRevenue: 150,
    paymentMethod: 'cash',
  },

  // Batch 2 (created 2026-10-09T14:09:27Z, hex 6ac8e447 - identical quantities/prices)
  {
    originalId: '6ac8e44707071764cd3074fb',
    batch: 'Batch_2',
    date: new Date('2026-10-01T00:00:00.000Z'),
    productName: 'Rice',
    targetSku: 'R001',
    quantitySold: 10,
    unitPrice: 60,
    totalRevenue: 600,
    paymentMethod: 'cash',
  },
  {
    originalId: '6ac8e44707071764cd3074fe',
    batch: 'Batch_2',
    date: new Date('2026-10-02T00:00:00.000Z'),
    productName: 'Sugar',
    targetSku: 'S001',
    quantitySold: 5,
    unitPrice: 45,
    totalRevenue: 225,
    paymentMethod: 'cash',
  },
  {
    originalId: '6ac8e44707071764cd307501',
    batch: 'Batch_2',
    date: new Date('2026-10-03T00:00:00.000Z'),
    productName: 'Wheat Flour',
    targetSku: 'W001',
    quantitySold: 8,
    unitPrice: 40,
    totalRevenue: 320,
    paymentMethod: 'cash',
  },
  {
    originalId: '6ac8e44707071764cd307504',
    batch: 'Batch_2',
    date: new Date('2026-10-04T00:00:00.000Z'),
    productName: 'Milk',
    targetSku: 'M001',
    quantitySold: 12,
    unitPrice: 30,
    totalRevenue: 360,
    paymentMethod: 'cash',
  },
  {
    originalId: '6ac8e44707071764cd307507',
    batch: 'Batch_2',
    date: new Date('2026-10-05T00:00:00.000Z'),
    productName: 'Soap',
    targetSku: 'S002',
    quantitySold: 6,
    unitPrice: 25,
    totalRevenue: 150,
    paymentMethod: 'cash',
  },
  {
    originalId: '6ac8e44707071764cd30750a',
    batch: 'Batch_2',
    date: new Date('2026-10-06T00:00:00.000Z'),
    productName: 'Biscuits',
    targetSku: 'B001',
    quantitySold: 15,
    unitPrice: 10,
    totalRevenue: 150,
    paymentMethod: 'cash',
  },

  // Single Item (created 2026-10-09T14:08:15Z, hex 6ac8e3ff)
  {
    originalId: '6ac8e3ff07071764cd3074e6',
    batch: 'Single_Item',
    date: new Date('2026-10-09T00:00:00.000Z'),
    productName: 'Brown Bread 400g',
    targetSku: 'BRD-002',
    quantitySold: 5,
    unitPrice: 2.2,
    totalRevenue: 11,
    paymentMethod: 'cash',
  },
];

/**
 * Main Restoration Function
 */
export async function runRestoration(options = {}) {
  // CRITICAL SAFEGUARD: Do not allow running inside tests
  if (isTestEnvironment() || process.env.NODE_ENV === 'test') {
    throw new Error('CRITICAL SAFEGUARD: Restoration script is prohibited from executing within an automated test environment.');
  }

  const isCommit = options.commit === true || process.argv.includes('--commit');
  const salesMode = options.salesMode || (process.argv.includes('--sales=all13') ? 'all13' : (process.argv.includes('--sales=dedup7') ? 'dedup7' : 'none'));
  const includeEstimates = options.includeEstimates === true || process.argv.includes('--include-estimates');
  const targetEmail = options.email || 'testowner@example.com';
  const mongoURI = options.uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/retail_bi_db';

  console.log('🔄 ==========================================');
  console.log(`🔄 RETAIL BI RESTORATION ENGINE [${isCommit ? 'COMMIT MODE' : 'DRY-RUN MODE'}]`);
  console.log(`🔄 Target Database: ${mongoURI}`);
  console.log(`🔄 Target Owner: ${targetEmail}`);
  console.log(`🔄 Sales Restoration Mode: ${salesMode}`);
  console.log(`🔄 Include Cost Estimates: ${includeEstimates}`);
  console.log('🔄 ==========================================\n');

  await mongoose.connect(mongoURI);

  try {
    // 1. Verify target user exists
    const owner = await User.findOne({ email: targetEmail });
    if (!owner) {
      throw new Error(`Target user "${targetEmail}" does not exist in ${mongoURI}. Refusing to create a duplicate user.`);
    }

    const userId = owner._id;
    console.log(`✅ Located existing owner: ${owner.name} (${owner.email})`);
    console.log(`   User ID (ObjectId): ${userId}\n`);

    // 2. Process Products
    console.log('--- 1. Product Catalog Recovery ---');
    let prodInserted = 0;
    let prodSkipped = 0;
    let prodHeld = 0;
    const restoredProductsBySku = {};

    for (const p of HISTORICAL_PRODUCTS) {
      // Check if product already exists
      const existing = await Product.findOne({ userId, sku: p.sku });
      if (existing) {
        console.log(`  ⏩ SKIP: Product [${p.sku}] "${p.name}" already exists (ID: ${existing._id}). Never overwriting.`);
        restoredProductsBySku[p.sku] = existing;
        prodSkipped++;
        continue;
      }

      // Check cost price approval
      if (p.costStatus === 'PROPOSED_ESTIMATE' && !includeEstimates) {
        console.log(`  ⏸️  HOLD: Product [${p.sku}] "${p.name}" has estimated cost ($${p.costPrice}). Pending explicit approval.`);
        prodHeld++;
        continue;
      }

      if (isCommit) {
        const created = await Product.create({
          userId,
          sku: p.sku,
          name: p.name,
          category: p.category,
          costPrice: p.costPrice,
          sellingPrice: p.sellingPrice,
          stockQuantity: p.stockQuantity,
          reorderThreshold: p.reorderThreshold,
          leadTimeDays: p.leadTimeDays,
          unit: p.unit,
        });
        console.log(`  ✨ INSERTED: Product [${p.sku}] "${p.name}" (ID: ${created._id}) - Cost: $${p.costPrice} [${p.costStatus}]`);
        restoredProductsBySku[p.sku] = created;
        prodInserted++;
      } else {
        console.log(`  🔎 [DRY-RUN] WOULD INSERT: Product [${p.sku}] "${p.name}" - Price: $${p.sellingPrice}, Cost: $${p.costPrice} [${p.costStatus}]`);
        prodInserted++;
      }
    }

    console.log(`\nProducts Summary: ${prodInserted} to insert, ${prodSkipped} skipped, ${prodHeld} held for cost approval.\n`);

    // 3. Process Sales
    console.log('--- 2. Historical Sales Recovery ---');
    let salesToProcess = [];
    if (salesMode === 'all13') {
      salesToProcess = HISTORICAL_SALES;
    } else if (salesMode === 'dedup7') {
      // Keep only Batch 1 + Single Item (7 distinct records)
      salesToProcess = HISTORICAL_SALES.filter((s) => s.batch === 'Batch_1' || s.batch === 'Single_Item');
    } else {
      console.log('  ⏸️  Sales restoration held in "none" mode. Awaiting user resolution on Batch 1 vs Batch 2 repetition.');
    }

    let salesInserted = 0;
    let salesSkipped = 0;

    for (const s of salesToProcess) {
      // Check for exact existing sale
      const existingSale = await Sale.findOne({
        userId,
        productName: s.productName,
        date: s.date,
        quantitySold: s.quantitySold,
        totalRevenue: s.totalRevenue,
      });

      if (existingSale) {
        console.log(`  ⏩ SKIP: Sale "${s.productName}" on ${s.date.toISOString().slice(0, 10)} already exists. Skipping.`);
        salesSkipped++;
        continue;
      }

      // Resolve productId link
      const targetProd = restoredProductsBySku[s.targetSku];
      const linkedProductId = targetProd ? targetProd._id : null;

      if (isCommit) {
        const createdSale = await Sale.create({
          userId,
          productId: linkedProductId,
          productName: s.productName,
          date: s.date,
          quantitySold: s.quantitySold,
          unitPrice: s.unitPrice,
          totalRevenue: s.totalRevenue,
          paymentMethod: s.paymentMethod,
        });
        console.log(`  ✨ INSERTED: Sale "${s.productName}" (${s.date.toISOString().slice(0, 10)}) - Qty: ${s.quantitySold}, Rev: $${s.totalRevenue} (Linked Prod: ${linkedProductId || 'NONE'})`);
        salesInserted++;
      } else {
        console.log(`  🔎 [DRY-RUN] WOULD INSERT: Sale "${s.productName}" (${s.date.toISOString().slice(0, 10)}) - Qty: ${s.quantitySold}, Rev: $${s.totalRevenue} [${s.batch}]`);
        salesInserted++;
      }
    }

    console.log(`\nSales Summary: ${salesInserted} to insert, ${salesSkipped} skipped.\n`);

    console.log('==========================================');
    console.log(`🎉 RESTORATION ${isCommit ? 'COMPLETED' : 'DRY-RUN REPORT FINISHED'}`);
    console.log('==========================================');

    return {
      isCommit,
      prodInserted,
      prodSkipped,
      prodHeld,
      salesInserted,
      salesSkipped,
    };
  } finally {
    await mongoose.disconnect();
  }
}

// Auto-run if executed directly via node
if (process.argv[1]?.endsWith('restoreData.js')) {
  runRestoration().catch((err) => {
    console.error('❌ Restoration Exception:', err);
    process.exit(1);
  });
}
