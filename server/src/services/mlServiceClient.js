/**
 * Python FastAPI + scikit-learn Machine Learning Service HTTP Client
 * Connects the Node.js/Express backend to the Python ML microservice with
 * strict input validation, request timeouts, and automatic statistical fallback handling.
 */

import { formatDateKey } from '../utils/forecastingEngine.js';

export const MIN_DAYS_FOR_RF_FORECAST = 14;
export const MIN_DAYS_FOR_PRODUCT_RF = 10;
export const MIN_TRANSACTIONS_FOR_IFOREST = 15;
export const MIN_DAYS_FOR_DAILY_IFOREST = 14;

const DEFAULT_PROD_ML_URL = 'https://ai-bi-ml-service.onrender.com';
const DEFAULT_DEV_ML_URL = 'http://127.0.0.1:8000';

export const getMLServiceBaseUrl = () => {
  const envUrl = process.env.ML_SERVICE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    // Strip quotes, whitespace, trailing slashes, and accidental endpoint suffixes
    let cleaned = envUrl
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\/+$/, '')
      .replace(/\/(health|api\/ml(\/.*)?|api)$/i, '');

    if (cleaned && !/^https?:\/\//i.test(cleaned)) {
      cleaned = `https://${cleaned}`;
    }

    if (process.env.NODE_ENV === 'production') {
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleaned);
      const isSelfBackend = /ai-business-intelligence-platform/i.test(cleaned);
      if (isLocalhost || isSelfBackend) {
        return DEFAULT_PROD_ML_URL;
      }
    }

    if (cleaned) {
      return cleaned;
    }
  }
  // In production, default directly to the deployed Python ML service on Render if ML_SERVICE_URL is unset
  if (process.env.NODE_ENV === 'production') {
    return DEFAULT_PROD_ML_URL;
  }
  return DEFAULT_DEV_ML_URL;
};

export const getMLTimeoutMs = () => {
  const raw = process.env.ML_SERVICE_TIMEOUT_MS;
  const parsed = parseInt(String(raw || '').replace(/['"]/g, '').trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return process.env.NODE_ENV === 'production' ? 15000 : 5000;
};

/**
 * Check Python ML Service health status
 */
export async function checkMLServiceHealth() {
  const baseUrl = getMLServiceBaseUrl();
  const timeoutMs = getMLTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { online: false, status: 'offline', httpStatus: res.status };
    }
    const body = await res.json();
    const isHealthy = Boolean(body && (body.status === 'ok' || body.service));
    return { online: isHealthy, ...(body || {}) };
  } catch {
    return { online: false, status: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Internal helper to perform JSON requests to the Python ML service with timeout protection
 */
async function postToMLService(endpointPath, payload) {
  const baseUrl = getMLServiceBaseUrl();
  const timeoutMs = getMLTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpointPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let detailMsg = errText.slice(0, 200);
      try {
        const parsedErr = JSON.parse(errText);
        if (parsedErr?.detail) {
          detailMsg =
            typeof parsedErr.detail === 'string'
              ? parsedErr.detail
              : JSON.stringify(parsedErr.detail).slice(0, 200);
        } else if (parsedErr?.message) {
          detailMsg = String(parsedErr.message).slice(0, 200);
        }
      } catch {
        // Keep raw text snippet
      }

      console.warn(`[ML Service Warning] ${endpointPath} returned HTTP ${response.status}`);

      // Gateway/proxy errors (502, 503, 504) indicate the Python service is unreachable/down.
      // For other HTTP errors (e.g. 400, 404, 422, 500), verify whether /health is online.
      let serviceOnline = false;
      if (![502, 503, 504].includes(response.status)) {
        const health = await checkMLServiceHealth();
        serviceOnline = health.online ? true : ![404, 502, 503, 504].includes(response.status);
      }

      return {
        serviceOnline,
        requestSucceeded: false,
        httpStatus: response.status,
        error: `ML service returned HTTP ${response.status}${detailMsg ? `: ${detailMsg}` : ''}`,
        data: null,
      };
    }

    const json = await response.json();
    if (!json || json.status === 'error' || !json.data) {
      return {
        serviceOnline: true,
        requestSucceeded: false,
        httpStatus: response.status,
        error: json?.message || json?.detail || 'ML service returned an empty or invalid payload',
        data: json?.data || null,
      };
    }

    return {
      serviceOnline: true,
      requestSucceeded: true,
      httpStatus: response.status,
      error: null,
      data: json.data,
    };
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    console.warn(
      `[ML Service Fallback] ${endpointPath} unavailable (${
        isTimeout ? 'timed out' : err?.message || 'offline'
      }) - initiating statistical fallback`
    );
    return {
      serviceOnline: false,
      requestSucceeded: false,
      httpStatus: null,
      error: isTimeout ? 'ML service request timed out' : (err?.message || 'ML service unreachable'),
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Request store-wide Random Forest Regression sales forecast from Python ML service
 */
export async function requestMLSalesForecast({
  records = [],
  horizon = 7,
  scopeId = 'store',
  minRequiredDays = MIN_DAYS_FOR_RF_FORECAST,
}) {
  const sanitizedRecords = (records || [])
    .map((r) => ({
      date: formatDateKey(r?.date),
      amount: Number(r?.amount ?? r?.totalRevenue ?? r?.value ?? 0),
    }))
    .filter((r) => Boolean(r.date) && Number.isFinite(r.amount));

  return postToMLService('/api/ml/forecast/sales', {
    records: sanitizedRecords,
    horizon,
    scopeId: String(scopeId),
    minRequiredDays,
  });
}

/**
 * Request batch product-level Random Forest demand forecasts from Python ML service
 */
export async function requestMLProductDemandForecast({
  products = [],
  horizon = 7,
}) {
  return postToMLService('/api/ml/forecast/demand', {
    products: (products || []).map((p) => ({
      productId: String(p.productId),
      salesRecords: (p.salesRecords || [])
        .map((s) => ({
          date: formatDateKey(s?.date),
          quantity: Number(s?.quantity ?? s?.quantitySold ?? 0),
        }))
        .filter((s) => Boolean(s.date) && Number.isFinite(s.quantity)),
      stockQuantity: Number(p.stockQuantity || 0),
      reorderThreshold: Number(p.reorderThreshold || 10),
      leadTimeDays: Number(p.leadTimeDays || 7),
    })),
    horizon,
  });
}

/**
 * Request Isolation Forest transaction-level outlier detection from Python ML service
 */
export async function requestMLTransactionOutliers({
  transactions = [],
  outlierThreshold = 3.5,
  extremeThreshold = 5.0,
  limit = 50,
  scopeId = 'store',
  minRequiredTransactions = MIN_TRANSACTIONS_FOR_IFOREST,
}) {
  return postToMLService('/api/ml/anomalies/transactions', {
    transactions: (transactions || []).map((tx, idx) => ({
      _id: tx._id ? String(tx._id) : `tx-${idx}`,
      date: formatDateKey(tx?.date) || String(tx?.date || '').slice(0, 10),
      productName: tx.productName || 'Unknown Product',
      quantitySold: Number(tx.quantitySold || 1),
      unitPrice: Number(tx.unitPrice || 0),
      totalRevenue: Number(tx.totalRevenue ?? tx.amount ?? 0),
      paymentMethod: tx.paymentMethod || 'cash',
    })),
    outlierThreshold,
    extremeThreshold,
    limit,
    scopeId: String(scopeId),
    minRequiredTransactions,
  });
}

/**
 * Request Isolation Forest daily revenue anomaly scores from Python ML service
 */
export async function requestMLDailyAnomalyScores({
  dailyPoints = [],
  scopeId = 'store',
}) {
  return postToMLService('/api/ml/anomalies/daily', {
    dailyPoints: (dailyPoints || []).map((pt) => ({
      date: formatDateKey(pt?.date) || String(pt?.date || '').slice(0, 10),
      revenue: Number(pt.revenue ?? pt.value ?? 0),
      isRecorded: Boolean(pt.isRecorded),
      trailingMedian: pt.trailingMedian !== undefined ? pt.trailingMedian : null,
    })),
    scopeId: String(scopeId),
  });
}
