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
  getDailyAnomalies,
  getTransactionOutliers,
  getAnomalySummary,
} from '../services/anomalyService';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';

const Anomalies = () => {
  const [sensitivity, setSensitivity] = useState('standard'); // 'standard' | 'sensitive' | 'conservative'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [dailyData, setDailyData] = useState(null);
  const [transactionData, setTransactionData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);

  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');

  const fetchData = useCallback(async (selectedSens = sensitivity) => {
    setLoading(true);
    setError(null);
    try {
      const [dailyRes, txRes, summaryRes] = await Promise.all([
        getDailyAnomalies({ sensitivity: selectedSens }),
        getTransactionOutliers({ minScore: 3.5, limit: 50 }),
        getAnomalySummary(),
      ]);

      if (dailyRes && dailyRes.data) {
        setDailyData(dailyRes.data);
      }
      if (txRes && txRes.data) {
        setTransactionData(txRes.data);
      }
      if (summaryRes && summaryRes.data) {
        setSummaryData(summaryRes.data);
      }
    } catch (err) {
      console.error('Failed to load anomaly detection data:', err);
      setError(err.response?.data?.message || 'Failed to execute statistical anomaly detection engine.');
    } finally {
      setLoading(false);
    }
  }, [sensitivity]);

  useEffect(() => {
    fetchData(sensitivity);
  }, [fetchData, sensitivity]);

  const handleSensitivityChange = (sens) => {
    setSensitivity(sens);
    fetchData(sens);
  };

  // Severity Badge Component
  const renderSeverityBadge = (severity) => {
    const config = {
      High: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
      Medium: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
      Low: { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' },
    };
    const c = config[severity] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.2rem 0.55rem',
          borderRadius: '9999px',
          fontSize: '0.72rem',
          fontWeight: 700,
          backgroundColor: c.bg,
          color: c.text,
          border: `1px solid ${c.border}`,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {severity}
      </span>
    );
  };

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload;
    return (
      <div
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          border: point.isAnomaly ? '2px solid #ef4444' : '1px solid #cbd5e1',
          borderRadius: '0.5rem',
          padding: '0.85rem 1rem',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          maxWidth: '320px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>{formatDate(label)}</strong>
          {point.isAnomaly && renderSeverityBadge(point.severity)}
        </div>
        <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', color: '#0f172a' }}>
          Actual Revenue: <strong>{formatCurrency(point.revenue)}</strong>
        </p>
        {point.trailingMedian !== null && (
          <p style={{ margin: '0.2rem 0', fontSize: '0.8rem', color: '#64748b' }}>
            Trailing 7-Day Baseline: {formatCurrency(point.trailingMedian)}
          </p>
        )}
        <p style={{ margin: '0.2rem 0', fontSize: '0.8rem', color: '#64748b' }}>
          Normal Corridor: [{formatCurrency(point.lowerThreshold)} – {formatCurrency(point.upperThreshold)}]
        </p>
        {point.isAnomaly && (
          <div style={{ marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 600 }}>
              ⚠️ {point.explanation}
            </span>
          </div>
        )}
      </div>
    );
  };

  // Filtered daily anomalies for table
  const filteredDailyAnomalies = (dailyData?.anomalies || []).filter((a) => {
    const matchesSeverity = selectedSeverityFilter === 'all' || a.severity === selectedSeverityFilter;
    const matchesType = selectedTypeFilter === 'all' || a.anomalyType === selectedTypeFilter;
    return matchesSeverity && matchesType;
  });

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.75rem' }}>🚨</span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Anomaly Detection & Volatility Studio
            </h1>
            {(transactionData || dailyData) && (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.65rem',
                  borderRadius: '9999px',
                  backgroundColor:
                    transactionData?.mlMetadata?.mlActive || dailyData?.mlMetadata?.mlActive
                      ? '#dcfce7'
                      : '#eff6ff',
                  color:
                    transactionData?.mlMetadata?.mlActive || dailyData?.mlMetadata?.mlActive
                      ? '#166534'
                      : '#1d4ed8',
                  border: `1px solid ${
                    transactionData?.mlMetadata?.mlActive || dailyData?.mlMetadata?.mlActive
                      ? '#bbf7d0'
                      : '#bfdbfe'
                  }`,
                }}
              >
                {transactionData?.mlMetadata?.mlActive || dailyData?.mlMetadata?.mlActive
                  ? '🧠 AI Anomaly Detection'
                  : '📐 Sales Baseline & Outlier Monitor'}
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '800px', lineHeight: 1.5 }}>
            Automatically monitors daily store revenue and individual sales receipts to flag unusual spikes, sudden revenue drops, and atypical transactions.
          </p>
        </div>

        {/* Controls: Sensitivity Selector & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.25rem',
            }}
          >
            <button
              onClick={() => handleSensitivityChange('sensitive')}
              style={{
                border: 'none',
                backgroundColor: sensitivity === 'sensitive' ? 'var(--primary)' : 'transparent',
                color: sensitivity === 'sensitive' ? '#fff' : 'var(--text-main)',
                padding: '0.4rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
              title="Sensitive: Flags milder daily revenue deviations"
            >
              Sensitive (1.2×)
            </button>
            <button
              onClick={() => handleSensitivityChange('standard')}
              style={{
                border: 'none',
                backgroundColor: sensitivity === 'standard' ? 'var(--primary)' : 'transparent',
                color: sensitivity === 'standard' ? '#fff' : 'var(--text-main)',
                padding: '0.4rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
              title="Standard: Balanced threshold for unusual daily sales"
            >
              Standard (1.5×)
            </button>
            <button
              onClick={() => handleSensitivityChange('conservative')}
              style={{
                border: 'none',
                backgroundColor: sensitivity === 'conservative' ? 'var(--primary)' : 'transparent',
                color: sensitivity === 'conservative' ? '#fff' : 'var(--text-main)',
                padding: '0.4rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
              title="Conservative: Flags only extreme daily deviations"
            >
              Conservative (2.0×)
            </button>
          </div>

          <button
            onClick={() => fetchData()}
            disabled={loading}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-main)',
              padding: '0.55rem 0.9rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.825rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            🔄 {loading ? 'Analyzing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          ⚠️ <strong>Error:</strong> {error}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        {/* Total Anomalies */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Total Anomalies
            </span>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: 'var(--text-main)' }}>
            {formatNumber(summaryData?.totalAnomalies || 0)}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            {summaryData?.highSeverityTotal || 0} high-severity events identified
          </p>
        </div>

        {/* Daily Revenue Spikes */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Revenue Spikes
            </span>
            <span style={{ fontSize: '1.2rem' }}>🚀</span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: '#16a34a' }}>
            {formatNumber(dailyData?.summary?.spikesCount || 0)}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Above normal daily sales range
          </p>
        </div>

        {/* Sudden Sales Drops */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Severe Sales Drops
            </span>
            <span style={{ fontSize: '1.2rem' }}>📉</span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: '#dc2626' }}>
            {formatNumber(dailyData?.summary?.dropsCount || 0)}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            &ge;50% drop below recent 7-day baseline
          </p>
        </div>

        {/* Transaction Outliers */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Receipt Outliers
            </span>
            <span style={{ fontSize: '1.2rem' }}>🧾</span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: 'var(--primary)' }}>
            {formatNumber(transactionData?.summary?.totalOutliers || 0)}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Unusually large or small transactions
          </p>
        </div>
      </div>

      {/* Main Section: Daily Anomaly Analysis */}
      {dailyData && !dailyData.hasSufficientData ? (
        /* Insufficient Data State */
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1.5px dashed var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '2.5rem 2rem',
            textAlign: 'center',
            marginBottom: '2.5rem',
          }}
        >
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>⏳</span>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            Baseline Requires More Trading History
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '650px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
            {dailyData.message}
          </p>

          <div style={{ maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
              <span>Historical Trading Days</span>
              <strong>{dailyData.distinctRecordedDays} / {dailyData.minRequiredDays} days</strong>
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, (dailyData.distinctRecordedDays / dailyData.minRequiredDays) * 100)}%`,
                  height: '100%',
                  backgroundColor: 'var(--primary)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Link
              to="/upload"
              style={{
                backgroundColor: 'var(--primary)',
                color: '#fff',
                padding: '0.55rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              📥 Upload Historical Sales CSV
            </Link>
            <Link
              to="/sales"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-main)',
                padding: '0.55rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              💳 Record Sales
            </Link>
          </div>
        </div>
      ) : (
        /* Daily Visual Chart & Threshold Corridor */
        <section style={{ marginBottom: '2.5rem' }}>
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Daily Revenue Anomaly Corridor & Trailing Baseline
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', marginTop: '0.2rem' }}>
                  Blue line represents actual daily sales. Grey dashed lines define the expected daily revenue corridor.
                </p>
              </div>

              {dailyData?.quartiles && (
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span>25th Pct: <strong>{formatCurrency(dailyData.quartiles.q1)}</strong></span>
                  <span>Median: <strong>{formatCurrency(dailyData.quartiles.median)}</strong></span>
                  <span>75th Pct: <strong>{formatCurrency(dailyData.quartiles.q3)}</strong></span>
                </div>
              )}
            </div>

            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={dailyData?.dailyPoints || []}
                  margin={{ top: 15, right: 25, left: 10, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: '10px' }} />

                  {/* Upper and Lower Corridor Bounds */}
                  <Line
                    type="monotone"
                    dataKey="upperThreshold"
                    name="Upper Normal Limit"
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="lowerThreshold"
                    name="Lower Normal Limit"
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                  />

                  {/* Trailing 7-day Median Baseline */}
                  <Line
                    type="monotone"
                    dataKey="trailingMedian"
                    name="Trailing 7-Day Baseline"
                    stroke="#f59e0b"
                    strokeWidth={1.8}
                    dot={false}
                    connectNulls
                  />

                  {/* Actual Daily Revenue Line */}
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Actual Daily Revenue"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (!cx || !cy) return null;
                      if (payload.isAnomaly) {
                        const fillColor =
                          payload.anomalyType === 'revenue_spike' ? '#16a34a' : '#dc2626';
                        return (
                          <circle
                            key={`dot-${payload.date}`}
                            cx={cx}
                            cy={cy}
                            r={6}
                            fill={fillColor}
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        );
                      }
                      return (
                        <circle
                          key={`dot-${payload.date}`}
                          cx={cx}
                          cy={cy}
                          r={3}
                          fill="#2563eb"
                        />
                      );
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Filterable Daily Anomalies Log Table */}
      {dailyData?.anomalies && dailyData.anomalies.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.25rem',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Detected Daily Sales Anomalies Log
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', marginTop: '0.2rem' }}>
                  {filteredDailyAnomalies.length} anomaly event(s) matching selected filter criteria
                </p>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <select
                  value={selectedSeverityFilter}
                  onChange={(e) => setSelectedSeverityFilter(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-main)',
                  }}
                >
                  <option value="all">All Severities</option>
                  <option value="High">High Severity</option>
                  <option value="Medium">Medium Severity</option>
                  <option value="Low">Low Severity</option>
                </select>

                <select
                  value={selectedTypeFilter}
                  onChange={(e) => setSelectedTypeFilter(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-main)',
                  }}
                >
                  <option value="all">All Types</option>
                  <option value="revenue_spike">Revenue Spikes</option>
                  <option value="sales_drop">Sales Drops</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Type</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Actual Revenue</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Corridor / Baseline</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Deviation Score</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Severity</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDailyAnomalies.map((a, idx) => (
                    <tr
                      key={`daily-anom-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.015)',
                      }}
                    >
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                        {formatDate(a.date)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {a.anomalyType === 'revenue_spike' ? (
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>🚀 Revenue Spike</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>📉 Sales Drop</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>
                        {formatCurrency(a.revenue)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {a.anomalyType === 'revenue_spike'
                          ? `Limit: ${formatCurrency(a.upperThreshold)}`
                          : `Baseline: ${formatCurrency(a.trailingMedian)}`}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                        {a.anomalyScore > 0 ? `+${a.anomalyScore.toFixed(2)}` : a.anomalyScore.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {renderSeverityBadge(a.severity)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)', fontSize: '0.825rem' }}>
                        {a.explanation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Transaction Outliers Section */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.25rem' }}>🧾</span>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Transaction-Level Outlier Analysis
                </h2>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', marginTop: '0.2rem' }}>
                Identifies individual sales receipts with unusually high or low revenue, quantity, or pricing compared to typical store transactions.
              </p>
            </div>

            {transactionData?.statistics && (
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <span>Typical Receipt (Median): <strong>{formatCurrency(transactionData.statistics.median)}</strong></span>
              </div>
            )}
          </div>

          {transactionData && !transactionData.hasSufficientData ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>{transactionData.message}</p>
            </div>
          ) : !transactionData?.outliers || transactionData.outliers.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>✅</span>
              <p style={{ fontWeight: 600 }}>No transaction outliers detected.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                All {transactionData?.totalTransactions || 0} evaluated transactions fall within the normal store range.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Product Name</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Qty</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Unit Price</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Receipt Total</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Payment</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Outlier Score</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Severity</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionData.outliers.map((tx, idx) => (
                    <tr
                      key={`tx-outlier-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.015)',
                      }}
                    >
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                        {formatDate(tx.date)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                        {tx.productName}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {formatNumber(tx.quantitySold)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {formatCurrency(tx.unitPrice)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        {formatCurrency(tx.totalRevenue)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textTransform: 'capitalize', color: 'var(--text-muted)' }}>
                        {tx.paymentMethod}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700, color: '#dc2626' }}>
                        {tx.modifiedZScore > 0 ? `+${tx.modifiedZScore.toFixed(2)}` : tx.modifiedZScore.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {renderSeverityBadge(tx.severity)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.825rem', color: 'var(--text-main)' }}>
                        {tx.explanation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Anomalies;
