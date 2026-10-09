import mongoose from 'mongoose';

async function verify() {
  await mongoose.connect('mongodb://127.0.0.1:27017/retail_bi_db');

  const products = await mongoose.connection.db.collection('products').find().toArray();
  const salesCount = await mongoose.connection.db.collection('sales').countDocuments();

  console.log(`\n--- MONGODB VERIFICATION (retail_bi_db) ---`);
  console.log(`Total Products in DB: ${products.length}`);
  console.log(`Total Sales in DB: ${salesCount}\n`);

  products.forEach((p, idx) => {
    console.log(
      `[${idx + 1}] ID: ${p._id} | SKU: ${p.sku.padEnd(8)} | Name: "${p.name.padEnd(18)}" | Category: ${p.category.padEnd(14)} | Price: $${p.sellingPrice.toFixed(2).padStart(5)} | Cost: $${p.costPrice.toFixed(2).padStart(5)} | Stock: ${String(p.stockQuantity).padStart(3)} | Reorder: ${String(p.reorderThreshold).padStart(2)} | Lead: ${p.leadTimeDays}d | Owner: ${p.userId}`
    );
  });

  await mongoose.disconnect();
}

verify();
