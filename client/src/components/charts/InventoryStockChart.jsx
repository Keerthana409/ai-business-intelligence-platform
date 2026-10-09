import React from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import ChartCard from './ChartCard';
import { formatNumber, formatCurrency } from '../../utils/formatters';

const InventoryStockChart = ({ data = [], loading = false, error = null }) => {
  const truncate = (str, max = 12) => {
    if (!str) return '';
    return str.length > max ? `${str.substring(0, max)}…` : str;
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
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
          <p style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
            📦 {item.name}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
            SKU: {item.sku} | Category: {item.category}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span
              style={{
                color: item.isOutOfStock
                  ? 'var(--danger)'
                  : item.isLowStock
                  ? 'var(--warning)'
                  : 'var(--success)',
                fontWeight: 700,
              }}
            >
              Status: {item.status}
            </span>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
              On Hand: {formatNumber(item.stockQuantity)} {item.unit}
            </span>
            <span style={{ color: '#d97706', fontWeight: 600 }}>
              Reorder Point: {formatNumber(item.reorderThreshold)} {item.unit}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Holding Value: {formatCurrency(item.stockValue)}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const emptyAction = (
    <Link
      to="/inventory"
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
      + Add Products to Catalog
    </Link>
  );

  return (
    <ChartCard
      title="Stock Levels vs Reorder Thresholds"
      subtitle="Compares shelf count against minimum safety stock levels for each SKU"
      loading={loading}
      error={error}
      empty={!data || data.length === 0}
      emptyMessage="No catalog inventory records found. Add products to monitor stock quantities."
      emptyAction={emptyAction}
    >
      <div style={{ width: '100%', height: 300, minHeight: 300, marginTop: '0.5rem' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data.slice(0, 10)}
            margin={{ top: 15, right: 15, left: 0, bottom: 25 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              tickFormatter={(val) => truncate(val, 11)}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              dy={10}
              interval={0}
            />
            <YAxis
              tickFormatter={(val) => formatNumber(val)}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              dx={-4}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '0.8rem', paddingTop: '0.5rem' }}
              formatter={(value) => (
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{value}</span>
              )}
            />
            <Bar
              dataKey="stockQuantity"
              name="On Hand Stock"
              fill="#2563eb"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              dataKey="reorderThreshold"
              name="Reorder Threshold"
              fill="#f59e0b"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default InventoryStockChart;
