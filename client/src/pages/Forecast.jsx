import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  getSalesForecast,
  getInventoryRiskAnalysis,
} from '../services/forecastService';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';

const Forecast = () => {
  const [horizon, setHorizon] = useState(7); // 7, 14, 30
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [salesForecastData, setSalesForecastData] = useState(null);
  const [inventoryRisks, setInventoryRisks] = useState([]);

  // Fetch forecast data
  const fetchData = useCallback(async (selectedHorizon = horizon) => {
    setLoading(true);
    setError(null);
    try {
      const [salesRes, riskRes] = await Promise.all([
        getSalesForecast({ horizon: selectedHorizon }),
        getInventoryRiskAnalysis({ horizon: selectedHorizon }),
      ]);

      if (salesRes && salesRes.data) {
        setSalesForecastData(salesRes.data);
      }
      if (riskRes && riskRes.data) {
        setInventoryRisks(riskRes.data);
      }
    } catch (err) {
      console.error('Failed to load forecasting intelligence:', err);
      setError(err.response?.data?.message || 'Failed to generate predictive intelligence.');
    } finally {
      setLoading(false);
    }
  }, [horizon]);

  useEffect(() => {
    fetchData(horizon);
  }, [fetchData, horizon]);

  const handleHorizonChange = (h) => {
    setHorizon(h);
    fetchData(h);
  };

  // Derive explicit, non-contradictory ML and statistical status fields
  const mlMeta = salesForecastData?.mlMetadata || {};
  const modelEval = salesForecastData?.modelEvaluation || null;
  const distinctRecordedDays =
    salesForecastData?.historicalCoverage?.distinctRecordedDays ??
    mlMeta.distinctRecordedDays ??
    salesForecastData?.distinctRecordedDays ??
    0;
  const minRequiredDaysForML =
    mlMeta.minRequiredDaysForML ??
    salesForecastData?.minRequiredDaysForML ??
    14;
  const meetsMinDaysForML =
    mlMeta.meetsMinDaysRequirement !== undefined
      ? Boolean(mlMeta.meetsMinDaysRequirement)
      : distinctRecordedDays >= minRequiredDaysForML;
  const additionalDaysNeededForML =
    mlMeta.additionalDaysNeededForML !== undefined
      ? Number(mlMeta.additionalDaysNeededForML)
      : Math.max(0, minRequiredDaysForML - distinctRecordedDays);
  const mlAttempted =
    mlMeta.mlAttempted !== undefined
      ? Boolean(mlMeta.mlAttempted)
      : meetsMinDaysForML;
  const mlSucceeded =
    mlMeta.mlSucceeded !== undefined
      ? Boolean(mlMeta.mlSucceeded)
      : Boolean(mlMeta.mlActive);
  const mlActive = Boolean(mlMeta.mlActive && mlSucceeded);
  const mlServiceOnline = Boolean(mlMeta.mlServiceOnline);
  const isMLValidated = Boolean(
    mlActive &&
      modelEval &&
      modelEval.isMLValidated !== false &&
      modelEval.normalizedAccuracy !== undefined
  );
  const statisticalBacktestStatus =
    mlMeta.statisticalBacktestStatus ||
    modelEval?.statisticalBacktestStatus ||
    (modelEval
      ? meetsMinDaysForML
        ? 'Verified (Statistical Holdout)'
        : 'Provisional (Statistical Holdout)'
      : 'Insufficient Data');
  const mlValidationStatus =
    mlMeta.mlValidationStatus ||
    modelEval?.mlValidationStatus ||
    (isMLValidated
      ? 'Verified (Random Forest Holdout)'
      : meetsMinDaysForML
        ? 'Unavailable (Random Forest Fallback)'
        : `Pending (${additionalDaysNeededForML} More Day${additionalDaysNeededForML === 1 ? '' : 's'} Needed)`);
  const fallbackReasonRaw =
    mlMeta.fallbackReason ||
    (meetsMinDaysForML
      ? `Store meets the ${minRequiredDaysForML}-day minimum (${distinctRecordedDays} distinct trading days recorded). Using Holt's Linear Exponential Smoothing statistical fallback.`
      : `Store has ${distinctRecordedDays} distinct recorded trading days (${additionalDaysNeededForML} more day${additionalDaysNeededForML === 1 ? '' : 's'} needed for ${minRequiredDaysForML}-day Random Forest threshold). Using Holt's Linear Exponential Smoothing.`);
  // Strip any raw URLs, localhost/IP addresses, or port numbers from user-facing notes
  const fallbackReasonText = String(fallbackReasonRaw)
    .replace(/https?:\/\/[^\s)]+/gi, 'ML service')
    .replace(/\b(localhost|127\.0\.0\.1)(:\d+)?\b/gi, 'local ML service');

  // Prepare combined timeline dataset for Recharts: Historical Actuals + Future Forecast
  const combinedTimeline = [];
  if (salesForecastData && salesForecastData.hasSufficientData) {
    // Add historical actuals
    (salesForecastData.historicalActuals || []).forEach((pt) => {
      combinedTimeline.push({
        date: pt.date,
        type: 'historical',
        actualRevenue: pt.value,
        forecastRevenue: null,
        lowerBound: null,
        upperBound: null,
      });
    });

    // Anchor point: bridge the last historical day to first forecast day for continuity
    const lastHistorical = combinedTimeline[combinedTimeline.length - 1];

    (salesForecastData.predictions || []).forEach((pred, idx) => {
      combinedTimeline.push({
        date: pred.date,
        type: 'forecast',
        actualRevenue: null,
        forecastRevenue: pred.forecastRevenue,
        lowerBound: pred.lowerBound,
        upperBound: pred.upperBound,
        uncertaintyMargin: pred.uncertaintyMargin,
      });
    });
  }

  // Custom Tooltip for Forecast Chart
  const CustomForecastTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const pt = payload[0].payload;
      return (
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            boxShadow: 'var(--shadow-md)',
            fontSize: '0.825rem',
          }}
        >
          <p style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
            📅 {formatDate(label)}
          </p>
          {pt.type === 'historical' && (
            <div>
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                Actual Recorded Revenue: {formatCurrency(pt.actualRevenue)}
              </span>
            </div>
          )}
          {pt.type === 'forecast' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ color: '#8b5cf6', fontWeight: 700 }}>
                Projected Revenue: {formatCurrency(pt.forecastRevenue)}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Expected Range: {formatCurrency(pt.lowerBound)} – {formatCurrency(pt.upperBound)}
              </span>
              <span style={{ color: '#d97706', fontSize: '0.7rem' }}>
                ±{formatCurrency(pt.uncertaintyMargin)} typical daily variation
              </span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const getRiskBadge = (status) => {
    switch (status) {
      case 'Out of Stock':
        return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' };
      case 'Critical Risk':
        return { bg: '#ffedd5', text: '#c2410c', border: '#fdba74' };
      case 'High Risk':
      case 'Low Stock (Buffer Alert)':
        return { bg: '#fef3c7', text: '#b45309', border: '#fde68a' };
      case 'Moderate Risk':
        return { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' };
      case 'Low / Safe':
        return { bg: '#dcfce7', text: '#166534', border: '#bbfdb0' };
      case 'Pending History':
        return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' };
      default:
        return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
    }
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header Banner */}
      <section
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem 2rem',
          marginBottom: '2rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.5rem' }}>🤖</span>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Predictive Sales & Demand Intelligence
            </h1>
            {salesForecastData && salesForecastData.hasSufficientData && (
              <>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.65rem',
                    borderRadius: '9999px',
                    backgroundColor: mlActive ? '#dcfce7' : '#eff6ff',
                    color: mlActive ? '#166534' : '#1d4ed8',
                    border: `1px solid ${mlActive ? '#bbf7d0' : '#bfdbfe'}`,
                  }}
                >
                  {mlActive ? 'Random Forest Active' : 'Statistical Fallback Active'}
                </span>
                {!mlServiceOnline && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.65rem',
                      borderRadius: '9999px',
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    ML Service Offline
                  </span>
                )}
              </>
            )}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '680px' }}>
            Projects upcoming store revenue, estimates daily product demand, and highlights items at risk of running out before supplier delivery.
          </p>
          {salesForecastData && salesForecastData.hasSufficientData && (
            <details style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
                Technical Details
              </summary>
              <div
                style={{
                  marginTop: '0.45rem',
                  padding: '0.6rem 0.85rem',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  lineHeight: 1.45,
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem' }}>
                  <span>
                    <strong>Active Model:</strong>{' '}
                    {mlActive
                      ? 'Random Forest Regression (scikit-learn)'
                      : "Holt's Linear Exponential Smoothing (Damped Trend)"}
                  </span>
                  <span>
                    <strong>Trading Days:</strong> {distinctRecordedDays} recorded (Min {minRequiredDaysForML} for Random Forest)
                  </span>
                  <span>
                    <strong>RF Attempted:</strong> {mlAttempted ? 'Yes' : 'No'} | <strong>RF Succeeded:</strong>{' '}
                    {mlSucceeded ? 'Yes' : 'No'}
                  </span>
                  <span>
                    <strong>Statistical Backtest:</strong> {statisticalBacktestStatus}
                  </span>
                  <span>
                    <strong>ML Evaluation:</strong> {mlValidationStatus}
                  </span>
                </div>
                {!mlActive && <div>{fallbackReasonText}</div>}
              </div>
            </details>
          )}
        </div>

        {/* Horizon Controls & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px',
            }}
          >
            {[7, 14, 30].map((h) => (
              <button
                key={h}
                onClick={() => handleHorizonChange(h)}
                style={{
                  border: 'none',
                  background: horizon === h ? '#ffffff' : 'transparent',
                  color: horizon === h ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: horizon === h ? 700 : 500,
                  fontSize: '0.8rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  boxShadow: horizon === h ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {h} Days
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchData(horizon)}
            disabled={loading}
            style={{
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border)',
              color: 'var(--text-main)',
              padding: '0.55rem 0.9rem',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '0.825rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🔄</span>
            <span>{loading ? 'Computing...' : 'Recalculate'}</span>
          </button>
        </div>
      </section>

      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: 'var(--radius-sm)',
            color: '#b91c1c',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p>Generating sales and inventory demand projections...</p>
        </div>
      ) : salesForecastData && !salesForecastData.hasSufficientData ? (
        /* Honest Insufficient Historical Data State */
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1.5px dashed var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '3rem 2rem',
            textAlign: 'center',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '2rem',
          }}
        >
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.75rem' }}>⏳</span>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            Insufficient Historical Data for Reliable Forecasting
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', maxWidth: '580px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
            At least 5 distinct calendar days with sales records are required to establish a reliable sales trend.
          </p>

          {/* Progress Tracker */}
          <div style={{ maxWidth: '360px', margin: '0 auto 1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-main)' }}>Recorded History Progress</span>
              <span style={{ color: 'var(--primary)' }}>
                {salesForecastData.distinctRecordedDays} / {salesForecastData.minRequiredDays} Days
              </span>
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, (salesForecastData.distinctRecordedDays / salesForecastData.minRequiredDays) * 100)}%`,
                  height: '100%',
                  backgroundColor: 'var(--primary)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/sales"
              style={{
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                padding: '0.6rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              + Record Daily Sales
            </Link>
            <Link
              to="/upload"
              style={{
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border)',
                padding: '0.6rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              📥 Upload Historical Sales CSV
            </Link>
          </div>
        </div>
      ) : (
        /* Full Predictive Dashboard */
        <>
          {/* Top KPI Forecast Cards */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* 1. Projected Revenue */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Projected Revenue
              </span>
              <h3 style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: '0.25rem', color: '#8b5cf6' }}>
                {formatCurrency(salesForecastData?.totalProjectedRevenue || 0)}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {mlActive
                  ? `${horizon}-day Random Forest projection (${distinctRecordedDays} trading days)`
                  : `${horizon}-day statistical projection (${distinctRecordedDays} trading days)`}
              </p>
            </div>

            {/* 2. Forecast Reliability */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Forecast Reliability
              </span>
              <h3
                style={{
                  fontSize: isMLValidated ? '1.65rem' : '1.35rem',
                  fontWeight: 800,
                  marginTop: '0.25rem',
                  color: isMLValidated ? 'var(--success)' : 'var(--primary)',
                }}
              >
                {isMLValidated
                  ? `${modelEval.normalizedAccuracy}%`
                  : meetsMinDaysForML
                    ? 'Statistical Holdout'
                    : 'Provisional'}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                {isMLValidated
                  ? `Random Forest holdout verified (${modelEval.backtestTestDays}d test)`
                  : meetsMinDaysForML
                    ? `Statistical holdout${
                        modelEval?.normalizedAccuracy !== undefined
                          ? `: ${modelEval.normalizedAccuracy}%`
                          : ''
                      } (${distinctRecordedDays} trading days)`
                    : `Provisional holdout${
                        modelEval?.normalizedAccuracy !== undefined
                          ? `: ${modelEval.normalizedAccuracy}%`
                          : ''
                      } (${distinctRecordedDays}/${minRequiredDaysForML} days for ML)`}
              </p>
            </div>

            {/* 3. Average Daily Forecast Error */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Average Daily Forecast Error
              </span>
              <h3 style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-main)' }}>
                {modelEval?.mae !== undefined ? formatCurrency(modelEval.mae) : 'N/A'}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {isMLValidated
                  ? `Random Forest holdout MAE (WAPE: ${modelEval.wape}%)`
                  : `Statistical holdout MAE (WAPE: ${modelEval?.wape ?? 'N/A'}%)`}
              </p>
            </div>

            {/* 4. Stockout Alert Items */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: `1.5px solid ${inventoryRisks.some((r) => r.status.includes('Risk') || r.status.includes('Stock')) ? '#fca5a5' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 700, textTransform: 'uppercase' }}>
                Stockout Alert Items
              </span>
              <h3 style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: '0.25rem', color: '#b91c1c' }}>
                {formatNumber(inventoryRisks.filter((r) => r.status === 'Critical Risk' || r.status === 'Out of Stock' || r.status.includes('Alert')).length)}
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '0.35rem' }}>
                Projected runout within lead time or low stock
              </p>
            </div>
          </section>

          {/* Sales Forecast Chart & Uncertainty Band */}
          <section
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-sm)',
              marginBottom: '2rem',
            }}
          >
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Historical Sales vs {horizon}-Day Projected Revenue
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                Continuous timeline: blue line displays recorded daily sales; purple line displays projected daily revenue with expected variance range.
              </p>
            </div>

            <div style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={combinedTimeline} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(val) => {
                      const p = val.split('-');
                      return p.length === 3 ? `${p[1]}/${p[2]}` : val;
                    }}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    dy={8}
                  />
                  <YAxis
                    tickFormatter={(val) => `₹${val}`}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    dx={-4}
                  />
                  <Tooltip content={<CustomForecastTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '0.8rem', paddingTop: '0.5rem' }}
                    formatter={(val) => (
                      <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{val}</span>
                    )}
                  />

                  {/* Uncertainty Band Area */}
                  <Area
                    type="monotone"
                    dataKey="upperBound"
                    stroke="none"
                    fill="#ede9fe"
                    fillOpacity={0.6}
                    name="Expected Revenue Range"
                  />

                  {/* Historical Actual Line */}
                  <Line
                    type="monotone"
                    dataKey="actualRevenue"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#2563eb' }}
                    name="Actual Sales (₹)"
                    connectNulls={false}
                  />

                  {/* Forecast Line */}
                  <Line
                    type="monotone"
                    dataKey="forecastRevenue"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                    dot={{ r: 4, fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 2 }}
                    name={`Projected Revenue (${horizon}d)`}
                    connectNulls={true}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Predictive Inventory Stockout Risk Matrix */}
          <section
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-sm)',
              marginBottom: '2rem',
            }}
          >
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Predictive Inventory Stockout Risk Matrix
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                Cross-references on-hand stock with projected daily unit demand and vendor lead times to calculate estimated runout dates.
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Product & SKU</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Current Stock</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Safety Threshold</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Projected Demand ({horizon}d)</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Estimated Runout</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Lead Time</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Risk Status</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Recommended Order</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryRisks.map((item) => {
                    const badge = getRiskBadge(item.status);
                    return (
                      <tr key={item.productId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem' }}>
                          <strong style={{ color: 'var(--text-main)', display: 'block' }}>{item.name}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            SKU: {item.sku} | {item.category}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', fontWeight: 600, color: item.currentStock === 0 ? 'var(--danger)' : 'var(--text-main)' }}>
                          {formatNumber(item.currentStock)} {item.unit}
                        </td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>
                          {formatNumber(item.reorderThreshold)} {item.unit}
                        </td>
                        <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--primary)' }}>
                          {item.hasSufficientData ? (
                            `${formatNumber(item.totalProjectedDemand)} ${item.unit} (${item.avgDailyDemand}/d)`
                          ) : (
                            <div>
                              <span style={{ color: '#475569', fontSize: '0.8rem', display: 'block', fontWeight: 600 }}>
                                Insufficient History ({item.distinctRecordedDays ?? 0}/3 days)
                              </span>
                              <span style={{ color: '#d97706', fontSize: '0.725rem' }}>
                                {item.additionalDaysNeededForBaseline > 0
                                  ? `${item.additionalDaysNeededForBaseline} more day(s) needed for baseline`
                                  : '3 days needed for baseline'}
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          {item.runoutDays !== null ? (
                            <strong style={{ color: item.runoutDays <= 3 ? 'var(--danger)' : 'var(--text-main)' }}>
                              {item.runoutDays === 0 ? '0 days (Depleted)' : `${item.runoutDays} days`}
                            </strong>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              {item.distinctRecordedDays !== undefined && item.distinctRecordedDays < 3
                                ? 'Pending sales trend'
                                : 'N/A (No sales data)'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>
                          {item.leadTimeDays}d
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <span
                            style={{
                              fontSize: '0.725rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.55rem',
                              borderRadius: '9999px',
                              backgroundColor: badge.bg,
                              color: badge.text,
                              border: `1px solid ${badge.border}`,
                            }}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          {item.suggestedReorder > 0 ? (
                            <div>
                              <span style={{ color: '#b91c1c', fontWeight: 700, display: 'block' }}>
                                +{formatNumber(item.suggestedReorder)} {item.unit}
                              </span>
                              {!item.hasSufficientData && item.currentStock <= item.reorderThreshold && (
                                <span style={{ fontSize: '0.7rem', color: '#b45309' }}>
                                  Safety Buffer
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>Adequate</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Forecast;
