/**
 * Python FastAPI + scikit-learn Machine Learning Service HTTP Client
 * Connects the Node.js/Express backend to the Python ML microservice with
 * strict input validation, request timeouts, and automatic statistical fallback handling.
 */

export const MIN_DAYS_FOR_RF_FORECAST = 14;
export const MIN_DAYS_FOR_PRODUCT_RF = 10;
export const MIN_TRANSACTIONS_FOR_IFOREST = 15;
export const MIN_DAYS_FOR_DAILY_IFOREST = 14;

export const getMLServiceBaseUrl = () => {
  const envUrl = process.env.ML_SERVICE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    // Strip any quotes and trailing slashes
    return envUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  }
  // In production, default directly to the deployed Python ML service on Render if ML_SERVICE_URL is unset
  if (process.env.NODE_ENV === 'production') {
    return 'https://ai-bi-ml-service.onrender.com';
  }
  return 'http://127.0.0.1:8000';
};

export const getMLTimeoutMs = () => {
  const raw = process.env.ML_SERVICE_TIMEOUT_MS;
  const parsed = parseInt(String(raw || '').replace(/['"]/g, '').trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return process.env.NODE_ENV === 'production' ? 10000 : 4000;
};

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
      console.warn(`[ML Service Warning] ${endpointPath} returned HTTP ${response.status}`);
      return {
        serviceOnline: true,
        error: `ML service returned HTTP ${response.status}: ${errText.slice(0, 200)}`,
        data: null,
      };
    }

    const json = await response.json();
    return {
      serviceOnline: true,
      error: null,
      data: json?.data || null,
    };
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    console.warn(`[ML Service Fallback] ${endpointPath} unavailable (${isTimeout ? 'timed out' : err?.message || 'offline'}) - initiating statistical fallback`);
    return {
      serviceOnline: false,
      error: isTimeout ? 'ML service request timed out' : (err?.message || 'ML service unreachable'),
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

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
      return { online: false, status: 'offline' };
    }
    const body = await res.json();
    return { online: true, ...body };
  } catch {
    return { online: false, status: 'offline' };
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
  return postToMLService('/api/ml/forecast/sales', {
    records: records.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      amount: Number(r.amount ?? r.value ?? 0),
    })),
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
    products: products.map((p) => ({
      productId: String(p.productId),
      salesRecords: (p.salesRecords || []).map((s) => ({
        date: s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10),
        quantity: Number(s.quantity ?? s.quantitySold ?? 0),
      })),
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
    transactions: transactions.map((tx, idx) => ({
      _id: tx._id ? String(tx._id) : `tx-${idx}`,
      date: tx.date instanceof Date ? tx.date.toISOString().slice(0, 10) : String(tx.date || '').slice(0, 10),
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
    dailyPoints: dailyPoints.map((pt) => ({
      date: String(pt.date).slice(0, 10),
      revenue: Number(pt.revenue ?? pt.value ?? 0),
      isRecorded: Boolean(pt.isRecorded),
      trailingMedian: pt.trailingMedian !== undefined ? pt.trailingMedian : null,
    })),
    scopeId: String(scopeId),
  });
}
