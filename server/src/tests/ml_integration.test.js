import '../config/testEnv.js';
import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Recommendation from '../models/Recommendation.js';
import { connectDB } from '../config/db.js';
import { checkMLServiceHealth } from '../services/mlServiceClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ML_SERVICE_DIR = path.resolve(__dirname, '../../../ml_service');
const PYTHON_EXE = 'C:\\Users\\keert\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';

async function waitForMLService(maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const health = await checkMLServiceHealth();
    if (health.online) return health;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Timed out waiting for Python FastAPI ML service to start on port 8000');
}

async function runMLIntegrationTests() {
  console.log('🤖 [START] Running End-to-End Node.js <-> Python FastAPI scikit-learn Integration Tests...\n');
  let passed = 0;
  let failed = 0;
  let pyProc = null;

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
    // 1. Start Python FastAPI ML Service if not already running
    let health = await checkMLServiceHealth();
    if (!health.online) {
      console.log('🚀 Spawning local Python FastAPI ML Service on http://127.0.0.1:8000...');
      pyProc = spawn(
        PYTHON_EXE,
        ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8000'],
        {
          cwd: ML_SERVICE_DIR,
          stdio: 'ignore',
          windowsHide: true,
        }
      );
      health = await waitForMLService(15000);
    }

    assert(health.online === true, `Python FastAPI ML service is online (scikit-learn v${health.sklearnVersion})`);
    assert(
      health.algorithms?.salesForecasting === 'RandomForestRegressor',
      'Health endpoint reports RandomForestRegressor for sales forecasting'
    );
    assert(
      health.algorithms?.transactionAnomalyDetection === 'IsolationForest',
      'Health endpoint reports IsolationForest for transaction anomaly detection'
    );

    await connectDB();
    // Ensure we are strictly in retail_bi_test_db
    assert(
      mongoose.connection.name === 'retail_bi_test_db',
      `Connected strictly to isolated test database (${mongoose.connection.name})`
    );

    const testEmail = 'ml_integration_owner@test.com';
    await User.deleteMany({ email: testEmail });

    const regRes = await request(app).post('/api/auth/register').send({
      name: 'ML Integration Owner',
      email: testEmail,
      password: 'password123',
      confirmPassword: 'password123',
      businessName: 'ML Test Retail Store',
      businessType: 'supermarket',
    });
    const token = regRes.body.data.token;
    const userId = regRes.body.data.user._id;

    const prod = await Product.create({
      userId,
      name: 'Smart Barcode Scanner',
      sku: 'ML-SCAN-01',
      category: 'Hardware',
      costPrice: 40,
      sellingPrice: 80,
      stockQuantity: 18,
      reorderThreshold: 15,
      leadTimeDays: 7,
      supplier: 'TechCorp Logistics',
    });

    // =========================================================================
    // CASE 1: Sparse Data (6 trading days, matching real DB state) -> Statistical Fallback
    // =========================================================================
    console.log('\n--- 1. Sparse History Gate (6 Days / 6 Transactions -> Statistical Fallback) ---');
    const sparseRevenues = [600, 225, 320, 360, 150, 150];
    for (let i = 0; i < sparseRevenues.length; i++) {
      const rev = sparseRevenues[i];
      const qty = Math.max(1, Math.round(rev / 75));
      await Sale.create({
        userId,
        productId: prod._id,
        productName: prod.name,
        category: prod.category,
        quantitySold: qty,
        unitPrice: rev / qty,
        totalCost: qty * 40,
        totalRevenue: rev,
        profit: rev - qty * 40,
        paymentMethod: 'card',
        date: new Date(`2026-10-0${i + 1}T10:00:00.000Z`),
      });
    }

    const sparseForecastRes = await request(app)
      .get('/api/forecast/sales?horizon=7')
      .set('Authorization', `Bearer ${token}`);

    assert(sparseForecastRes.status === 200, '6-day forecast returns HTTP 200');
    assert(
      sparseForecastRes.body.data.algorithm === "Holt's Linear Exponential Smoothing",
      '6-day dataset uses Holt\'s Linear Exponential Smoothing statistical fallback'
    );
    assert(
      sparseForecastRes.body.data.mlMetadata?.mlActive === false,
      '6-day dataset sets mlMetadata.mlActive = false (< 14 days)'
    );
    console.log(
      `  ℹ️  6-Day Real-DB Equivalent Holt Backtest Metrics: MAE=$${sparseForecastRes.body.data.modelEvaluation?.mae}, RMSE=$${sparseForecastRes.body.data.modelEvaluation?.rmse}, WAPE=${sparseForecastRes.body.data.modelEvaluation?.wape}%, NormalizedAccuracy=${sparseForecastRes.body.data.modelEvaluation?.normalizedAccuracy}%`
    );

    // =========================================================================
    // CASE 2: Sufficient Multi-Week History (24 trading days, 25 transactions) -> Trained ML Active
    // =========================================================================
    console.log('\n--- 2. Multi-Week History (24 Days / 25 Transactions -> Random Forest & Isolation Forest Active) ---');
    await Sale.deleteMany({ userId });

    for (let day = 1; day <= 24; day++) {
      const dateStr = `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`;
      const isWeekend = day % 7 === 5 || day % 7 === 6;
      const qty = isWeekend ? 8 : 4 + (day % 2);
      const unitPrice = 80;
      const rev = qty * unitPrice;

      await Sale.create({
        userId,
        productId: prod._id,
        productName: prod.name,
        category: prod.category,
        quantitySold: qty,
        unitPrice,
        totalCost: qty * 40,
        totalRevenue: rev,
        profit: rev - qty * 40,
        paymentMethod: 'card',
        date: new Date(dateStr),
      });
    }

    // Inject 1 extreme anomalous bulk transaction on 2026-09-24
    await Sale.create({
      userId,
      productId: prod._id,
      productName: prod.name,
      category: prod.category,
      quantitySold: 60,
      unitPrice: 80,
      totalCost: 60 * 40,
      totalRevenue: 4800,
      profit: 2400,
      paymentMethod: 'card',
      date: new Date('2026-09-24T16:00:00.000Z'),
    });

    // 2A. Test /api/forecast/sales -> RandomForestRegressor
    const mlForecastRes = await request(app)
      .get('/api/forecast/sales?horizon=7')
      .set('Authorization', `Bearer ${token}`);

    assert(mlForecastRes.status === 200, '24-day ML forecast returns HTTP 200');
    assert(
      mlForecastRes.body.data.algorithm === 'Random Forest Regression (scikit-learn)',
      `Active algorithm is '${mlForecastRes.body.data.algorithm}'`
    );
    assert(
      mlForecastRes.body.data.mlMetadata?.mlActive === true,
      'mlMetadata.mlActive is true for 24-day dataset'
    );
    assert(
      mlForecastRes.body.data.predictions?.length === 7,
      'Returns 7 daily Random Forest predictions with uncertainty bounds'
    );
    assert(
      mlForecastRes.body.data.modelEvaluation?.mae !== undefined &&
        mlForecastRes.body.data.modelEvaluation?.rmse !== undefined,
      `Chronological backtest metrics computed (MAE=$${mlForecastRes.body.data.modelEvaluation?.mae}, RMSE=$${mlForecastRes.body.data.modelEvaluation?.rmse}, WAPE=${mlForecastRes.body.data.modelEvaluation?.wape}%)`
    );
    assert(
      Boolean(mlForecastRes.body.data.statisticalBaselineComparison),
      'Includes side-by-side statisticalBaselineComparison (Holt\'s Linear vs Random Forest)'
    );

    // 2B. Test /api/forecast/demand -> SKU-level RandomForestRegressor
    const mlDemandRes = await request(app)
      .get('/api/forecast/demand?horizon=7')
      .set('Authorization', `Bearer ${token}`);

    assert(mlDemandRes.status === 200, 'SKU demand forecast returns HTTP 200');
    const skuItem = mlDemandRes.body.data[0];
    assert(
      skuItem?.mlActive === true && skuItem?.algorithm === 'Random Forest Regression (scikit-learn)',
      `SKU demand uses '${skuItem?.algorithm}' when >= 10 sales days exist`
    );

    // 2C. Test /api/anomalies/transactions -> IsolationForest
    const mlTxRes = await request(app)
      .get('/api/anomalies/transactions')
      .set('Authorization', `Bearer ${token}`);

    assert(mlTxRes.status === 200, 'Transaction anomaly endpoint returns HTTP 200');
    assert(
      mlTxRes.body.data.mlMetadata?.mlActive === true,
      'Transaction outlier detection activates Isolation Forest (scikit-learn)'
    );
    assert(
      mlTxRes.body.data.outliers?.length >= 1,
      `Isolation Forest detected ${mlTxRes.body.data.outliers?.length} anomalous transaction(s)`
    );
    const topOutlier = mlTxRes.body.data.outliers[0];
    assert(
      topOutlier.totalRevenue === 4800 && topOutlier.isolationForestDecisionScore < 0,
      `Top flagged outlier is the $4,800 bulk order (IForest decision score: ${topOutlier.isolationForestDecisionScore})`
    );

    // 2D. Test /api/anomalies/daily -> IsolationForest daily scoring + IQR Corridor
    const mlDailyRes = await request(app)
      .get('/api/anomalies/daily')
      .set('Authorization', `Bearer ${token}`);

    assert(mlDailyRes.status === 200, 'Daily anomaly endpoint returns HTTP 200');
    assert(
      mlDailyRes.body.data.mlMetadata?.mlActive === true,
      'Daily anomaly endpoint activates Isolation Forest daily scoring alongside IQR corridors'
    );

    // 2E. Test /api/recommendations -> Uses ML SKU demand velocity
    const mlRecRes = await request(app)
      .get('/api/recommendations')
      .set('Authorization', `Bearer ${token}`);

    assert(mlRecRes.status === 200, 'Recommendations endpoint returns HTTP 200');
    const recs = mlRecRes.body.data.recommendations || [];
    const prodRec = recs.find((r) => String(r.productId?._id || r.productId) === String(prod._id));
    assert(
      Boolean(prodRec) &&
        ['Random Forest Regression (scikit-learn)', 'AI Demand Forecast'].includes(
          prodRec.evidence?.demandAlgorithm
        ),
      `Recommendation engine integrates Random Forest SKU demand velocity (${prodRec?.evidence?.demandAlgorithm})`
    );

    // =========================================================================
    // CASE 3: Graceful Offline Fallback when ML Service is Unreachable
    // =========================================================================
    console.log('\n--- 3. Graceful Statistical Fallback When Python ML Service Is Offline ---');
    process.env.ML_SERVICE_URL = 'http://127.0.0.1:59999'; // unreachable port
    process.env.ML_SERVICE_TIMEOUT_MS = '500';

    const offlineForecastRes = await request(app)
      .get('/api/forecast/sales?horizon=7')
      .set('Authorization', `Bearer ${token}`);

    assert(offlineForecastRes.status === 200, 'Forecast returns HTTP 200 even when Python ML service is offline');
    assert(
      offlineForecastRes.body.data.algorithm === "Holt's Linear Exponential Smoothing",
      'Automatically falls back to Holt\'s Linear Exponential Smoothing when ML service is offline'
    );
    assert(
      offlineForecastRes.body.data.mlMetadata?.mlActive === false &&
        offlineForecastRes.body.data.mlMetadata?.mlServiceOnline === false,
      'Reports mlServiceOnline = false and fallback reason in mlMetadata'
    );

    const offlineTxRes = await request(app)
      .get('/api/anomalies/transactions')
      .set('Authorization', `Bearer ${token}`);

    assert(offlineTxRes.status === 200, 'Transaction anomalies returns HTTP 200 when Python ML service is offline');
    assert(
      offlineTxRes.body.data.mlMetadata?.mlActive === false,
      'Automatically falls back to Modified Z-Score when ML service is offline'
    );

    // Cleanup test user data in retail_bi_test_db
    await Recommendation.deleteMany({ userId });
    await Sale.deleteMany({ userId });
    await Product.deleteMany({ userId });
    await User.deleteMany({ _id: userId });

    console.log(`\n🎉 [SUMMARY] ML Integration Tests Passed: ${passed} | Failed: ${failed}`);
    if (failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error('❌ [FATAL ERROR in ML Integration Tests]:', err);
    process.exitCode = 1;
  } finally {
    if (pyProc) {
      pyProc.kill();
    }
    await mongoose.connection.close();
  }
}

runMLIntegrationTests();
