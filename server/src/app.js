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

const app = express();

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

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'AI-Powered Business & Decision Intelligence Platform API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
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
