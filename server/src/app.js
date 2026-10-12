import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Import Route Handlers
import authRoutes from './routes/authRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import forecastRoutes from './routes/forecastRoutes.js';
import anomalyRoutes from './routes/anomalyRoutes.js';
import simulationRoutes from './routes/simulationRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import scenarioRoutes from './routes/scenarioRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import Sale from './models/Sale.js';
import { alignDailyTimeSeries } from './utils/forecastingEngine.js';
import {
  MIN_DAYS_FOR_RF_FORECAST,
  checkMLServiceHealth,
  getMLCandidateBaseUrls,
  getMLServiceBaseUrl,
  requestMLSalesForecast,
} from './services/mlServiceClient.js';

const app = express();
let lastMlKeepWarmAt = 0;

// Security Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const localOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, server-to-server)
      if (!origin) return callback(null, true);

      // Parse any configured CLIENT_URL (supports comma-separated list and strips trailing slashes)
      const configuredOrigins = (process.env.CLIENT_URL || '')
        .split(',')
        .map((url) => url.trim().replace(/\/+$/, ''))
        .filter(Boolean);

      let hostname = '';
      try {
        hostname = new URL(origin).hostname;
      } catch {
        hostname = '';
      }

      const isAllowed =
        localOrigins.includes(origin) ||
        configuredOrigins.includes(origin) ||
        hostname.endsWith('.vercel.app') ||
        hostname === 'vercel.app' ||
        hostname.endsWith('.onrender.com');

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  })
);

// Body Parsing Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Proactive non-blocking keep-warm hook for the Python ML service in production
app.use((req, _res, next) => {
  if (
    process.env.NODE_ENV === 'production' &&
    Date.now() - lastMlKeepWarmAt > 4 * 60 * 1000
  ) {
    lastMlKeepWarmAt = Date.now();
    checkMLServiceHealth().catch(() => {});
  }
  next();
});

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
  const basePayload = {
    status: 'success',
    message: 'AI-Powered Business & Decision Intelligence Platform API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  };

  if (req.query.ml !== 'true') {
    return res.status(200).json(basePayload);
  }

  try {
    const mlHealth = await checkMLServiceHealth();
    let storeVerification = null;

    // Read-only verification on the store with the most trading days (exposes zero PII)
    const userGroups = await Sale.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    for (const grp of userGroups) {
      const sales = await Sale.find({ userId: grp._id }).sort({ date: 1 }).lean();
      const records = sales.map((s) => ({ date: s.date, amount: s.totalRevenue }));
      const aligned = alignDailyTimeSeries(records);
      if (aligned.distinctRecordedDays >= MIN_DAYS_FOR_RF_FORECAST) {
        const horizons = {};
        for (const h of [7, 14, 30]) {
          const mlRes = await requestMLSalesForecast({
            records,
            horizon: h,
            scopeId: 'health_verify',
            minRequiredDays: MIN_DAYS_FOR_RF_FORECAST,
          });
          const rfOk = Boolean(
            mlRes.serviceOnline && !mlRes.error && mlRes.data && mlRes.data.mlTrained === true
          );
          horizons[`${h}d`] = {
            mlActive: rfOk,
            mlTrained: Boolean(mlRes.data?.mlTrained),
            mlServiceOnline: Boolean(mlRes.serviceOnline),
            algorithm: rfOk
              ? mlRes.data.algorithm
              : "Holt's Linear Exponential Smoothing",
            predictionsCount: mlRes.data?.predictions?.length || 0,
            totalProjectedRevenue: mlRes.data?.totalProjectedRevenue ?? null,
            modelEvaluation: mlRes.data?.modelEvaluation
              ? {
                  mae: mlRes.data.modelEvaluation.mae,
                  rmse: mlRes.data.modelEvaluation.rmse,
                  wape: mlRes.data.modelEvaluation.wape,
                  normalizedAccuracy: mlRes.data.modelEvaluation.normalizedAccuracy,
                  isMLValidated: mlRes.data.modelEvaluation.isMLValidated,
                }
              : null,
            error: mlRes.error || null,
          };
        }
        storeVerification = {
          distinctRecordedDays: aligned.distinctRecordedDays,
          totalCalendarDays: aligned.dateSpanDays,
          horizons,
        };
        break;
      }
    }

    return res.status(200).json({
      ...basePayload,
      mlService: {
        configuredUrl: getMLServiceBaseUrl(),
        candidateUrls: getMLCandidateBaseUrls(),
        health: mlHealth,
        storeVerification,
      },
    });
  } catch (err) {
    return res.status(200).json({
      ...basePayload,
      mlService: {
        online: false,
        error: err?.message || 'Health check failed',
      },
    });
  }
});

// Mount Module Routes
app.use('/api/auth', authRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/anomalies', anomalyRoutes);
app.use('/api/simulation', simulationRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/audit', auditRoutes);

// Catch-all 404 Handler for undefined API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `API endpoint ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

export default app;
