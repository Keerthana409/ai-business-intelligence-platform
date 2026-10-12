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
      const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleaned);
      cleaned = `${isLocal ? 'http' : 'https'}://${cleaned}`;
    }

    // Always use HTTPS for *.onrender.com services to avoid HTTP->HTTPS POST redirect issues
    cleaned = cleaned.replace(/^http:\/\/([^/]+\.onrender\.com)/i, 'https://$1');

    if (process.env.NODE_ENV === 'production') {
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleaned);
      const isSelfBackend = /ai-business-intelligence-platform/i.test(cleaned);
      // Bare internal service hostnames without a TLD (e.g. http://ai-bi-ml-service:10000) fail on Render free tier
      const isBareInternalHost = /^https?:\/\/[a-z0-9-]+(:\d+)?$/i.test(cleaned);
      if (isLocalhost || isSelfBackend || isBareInternalHost) {
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

/**
 * Return ordered candidate ML service base URLs.
 * In test mode, strictly uses the single configured URL so offline/stub tests remain deterministic.
 * In development and production, falls back to the deployed Render Python ML service if the primary URL is unreachable.
 */
export const getMLCandidateBaseUrls = () => {
  const primary = getMLServiceBaseUrl();
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.ML_DISABLE_REMOTE_FALLBACK === 'true'
  ) {
    return [primary];
  }
  return Array.from(new Set([primary, DEFAULT_PROD_ML_URL].filter(Boolean)));
};

export const getMLTimeoutMs = () => {
  const raw = process.env.ML_SERVICE_TIMEOUT_MS;
  const parsed = parseInt(String(raw || '').replace(/['"]/g, '').trim(), 10);
  if (process.env.NODE_ENV === 'test') {
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
  }
  const minSafeTimeout = process.env.NODE_ENV === 'production' ? 25000 : 15000;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(minSafeTimeout, parsed);
  }
  return minSafeTimeout;
};

/**
 * Summarize request payload for safe server-side diagnostic logging
 */
function buildPayloadSummary(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const summary = {};
  if (Array.isArray(payload.records)) summary.recordsCount = payload.records.length;
  if (Array.isArray(payload.products)) summary.productsCount = payload.products.length;
  if (Array.isArray(payload.transactions)) summary.transactionsCount = payload.transactions.length;
  if (Array.isArray(payload.dailyPoints)) summary.dailyPointsCount = payload.dailyPoints.length;
  if (payload.horizon !== undefined) summary.horizon = payload.horizon;
  if (payload.minRequiredDays !== undefined) summary.minRequiredDays = payload.minRequiredDays;
  return summary;
}

/**
 * Check Python ML Service health status across candidate URLs
 */
export async function checkMLServiceHealth(specificBaseUrl = null, customTimeoutMs = null) {
  const candidates = specificBaseUrl ? [specificBaseUrl] : getMLCandidateBaseUrls();
  const timeoutMs = customTimeoutMs || getMLTimeoutMs();

  for (const baseUrl of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        continue;
      }
      const body = await res.json();
      const isHealthy = Boolean(body && (body.status === 'ok' || body.service));
      if (isHealthy) {
        return { online: true, baseUrl, ...(body || {}) };
      }
    } catch {
      // Try next candidate URL
    } finally {
      clearTimeout(timer);
    }
  }

  return { online: false, status: 'offline' };
}

/**
 * Single HTTP POST attempt to a specific baseUrl
 */
async function postSingleAttempt(baseUrl, endpointPath, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

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
    const durationMs = Date.now() - startedAt;

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

      console.warn(
        `[ML Service HTTP Error] POST ${baseUrl}${endpointPath} -> HTTP ${response.status} (${durationMs}ms)`,
        { payload: buildPayloadSummary(payload), detail: detailMsg }
      );

      let serviceOnline = false;
      if (![502, 503, 504].includes(response.status)) {
        const health = await checkMLServiceHealth(baseUrl);
        serviceOnline = health.online ? true : ![404, 502, 503, 504].includes(response.status);
      }

      return {
        serviceOnline,
        requestSucceeded: false,
        httpStatus: response.status,
        retryableGatewayError: [404, 502, 503, 504].includes(response.status),
        error: `ML service returned HTTP ${response.status}${detailMsg ? `: ${detailMsg}` : ''}`,
        data: null,
      };
    }

    const json = await response.json();
    if (!json || json.status === 'error' || !json.data) {
      console.warn(
        `[ML Service Payload Error] POST ${baseUrl}${endpointPath} -> Invalid payload (${durationMs}ms)`,
        { payload: buildPayloadSummary(payload) }
      );
      return {
        serviceOnline: true,
        requestSucceeded: false,
        httpStatus: response.status,
        retryableGatewayError: false,
        error: json?.message || json?.detail || 'ML service returned an empty or invalid payload',
        data: json?.data || null,
      };
    }

    return {
      serviceOnline: true,
      requestSucceeded: true,
      httpStatus: response.status,
      retryableGatewayError: false,
      error: null,
      data: json.data,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const isTimeout = err?.name === 'AbortError';
    console.warn(
      `[ML Service Connection Warning] POST ${baseUrl}${endpointPath} failed (${durationMs}ms): ${
        isTimeout ? 'request timed out' : err?.message || 'unreachable'
      }`,
      { payload: buildPayloadSummary(payload) }
    );
    return {
      serviceOnline: false,
      requestSucceeded: false,
      httpStatus: null,
      isTimeout,
      retryableGatewayError: true,
      error: isTimeout ? 'ML service request timed out' : 'ML service unreachable',
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Internal helper to perform JSON requests to the Python ML service with timeout protection,
 * candidate URL fallback, and cold-start wake-up retry.
 */
async function postToMLService(endpointPath, payload) {
  const candidates = getMLCandidateBaseUrls();
  const timeoutMs = getMLTimeoutMs();
  let lastResult = null;

  for (const baseUrl of candidates) {
    let result = await postSingleAttempt(baseUrl, endpointPath, payload, timeoutMs);

    // If the request succeeded or returned a definitive application error (e.g. HTTP 400/422/500 on an online service), return immediately
    if (result.requestSucceeded || (result.serviceOnline && !result.retryableGatewayError)) {
      return {
        serviceOnline: result.serviceOnline,
        requestSucceeded: result.requestSucceeded,
        httpStatus: result.httpStatus,
        error: result.error,
        data: result.data,
      };
    }

    // Outside of test mode, if a remote Render service timed out or returned 502/503/504 during cold start, wake /health and retry once
    if (
      process.env.NODE_ENV !== 'test' &&
      (baseUrl === DEFAULT_PROD_ML_URL || /\.onrender\.com/i.test(baseUrl)) &&
      (result.isTimeout || [502, 503, 504].includes(result.httpStatus))
    ) {
      const healthWake = await checkMLServiceHealth(baseUrl, 40000);
      if (healthWake.online) {
        result = await postSingleAttempt(baseUrl, endpointPath, payload, Math.max(timeoutMs, 25000));
        if (result.requestSucceeded || result.serviceOnline) {
          return {
            serviceOnline: result.serviceOnline,
            requestSucceeded: result.requestSucceeded,
            httpStatus: result.httpStatus,
            error: result.error,
            data: result.data,
          };
        }
      }
    }

    lastResult = result;
  }

  return {
    serviceOnline: Boolean(lastResult?.serviceOnline),
    requestSucceeded: false,
    httpStatus: lastResult?.httpStatus ?? null,
    error: lastResult?.error || 'ML service unreachable',
    data: null,
  };
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
