import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import ChartCard from './ChartCard';
import { formatCurrency, formatNumber, formatDate } from '../../utils/formatters';

const SalesOverTimeChart = ({
  data = [],
  loading = false,
  error = null,
  activeRange = 'all',
  onRangeChange,
}) => {
  const [metric, setMetric] = useState('revenue'); // 'revenue' | 'unitsSold'

  const ranges = [
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
    { key: 'all', label: 'All Time' },
  ];

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Revenue: {formatCurrency(point.revenue)}
            </span>
            <span style={{ color: 'var(--secondary)' }}>
              Units Sold: {formatNumber(point.unitsSold)}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Transactions: {point.transactionCount}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const actions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      {/* Metric Toggle */}
      <div
        style={{
          display: 'inline-flex',
          backgroundColor: 'var(--bg-main)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '2px',
        }}
      >
        <button
          onClick={() => setMetric('revenue')}
          style={{
            border: 'none',
            background: metric === 'revenue' ? '#ffffff' : 'transparent',
            color: metric === 'revenue' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: metric === 'revenue' ? 700 : 500,
            fontSize: '0.75rem',
            padding: '0.25rem 0.6rem',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: metric === 'revenue' ? 'var(--shadow-sm)' : 'none',
          }}
        >
          Revenue ($)
        </button>
        <button
          onClick={() => setMetric('unitsSold')}
          style={{
            border: 'none',
            background: metric === 'unitsSold' ? '#ffffff' : 'transparent',
            color: metric === 'unitsSold' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: metric === 'unitsSold' ? 700 : 500,
            fontSize: '0.75rem',
            padding: '0.25rem 0.6rem',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: metric === 'unitsSold' ? 'var(--shadow-sm)' : 'none',
          }}
        >
          Units Sold
        </button>
      </div>

      {/* Time Range Selector */}
      <div
        style={{
          display: 'inline-flex',
          backgroundColor: 'var(--bg-main)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '2px',
        }}
      >
        {ranges.map((r) => (
          <button
            key={r.key}
            onClick={() => onRangeChange && onRangeChange(r.key)}
            style={{
              border: 'none',
              background: activeRange === r.key ? '#ffffff' : 'transparent',
              color: activeRange === r.key ? 'var(--text-main)' : 'var(--text-muted)',
              fontWeight: activeRange === r.key ? 700 : 500,
              fontSize: '0.75rem',
              padding: '0.25rem 0.55rem',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: activeRange === r.key ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );

  const emptyAction = (
    <Link
      to="/sales"
      style={{
        backgroundColor: 'var(--primary)',
        color: '#ffffff',
        padding: '0.45rem 1rem',
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.8rem',
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      + Record a Sale
    </Link>
  );

  return (
    <ChartCard
      title="Sales Performance Over Time"
      subtitle="Historical transaction totals aggregated chronologically from recorded receipts"
      actions={actions}
      loading={loading}
      error={error}
      empty={!data || data.length === 0}
      emptyMessage="No sales transactions found in this time period. Record daily sales to view revenue trajectory."
      emptyAction={emptyAction}
    >
      <div style={{ width: '100%', height: 300, minHeight: 300, marginTop: '0.5rem' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 15, left: 0, bottom: 20 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="unitsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />

            <XAxis
              dataKey="date"
              tickFormatter={(val) => {
                const parts = val.split('-');
                return parts.length === 3 ? `${parts[1]}/${parts[2]}` : val;
              }}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              dy={8}
            />

            <YAxis
              tickFormatter={(val) => (metric === 'revenue' ? `$${val}` : formatNumber(val))}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              dx={-4}
            />

            <Tooltip content={<CustomTooltip />} />

            {metric === 'revenue' ? (
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#2563eb"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#revenueGradient)"
                name="Revenue"
                activeDot={{ r: 6, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
              />
            ) : (
              <Area
                type="monotone"
                dataKey="unitsSold"
                stroke="#059669"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#unitsGradient)"
                name="Units Sold"
                activeDot={{ r: 6, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default SalesOverTimeChart;
