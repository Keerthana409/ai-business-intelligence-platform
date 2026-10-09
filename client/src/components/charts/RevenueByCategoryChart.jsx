import React from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import ChartCard from './ChartCard';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/formatters';

const COLORS = [
  '#2563eb', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#64748b', // Slate (Uncategorized)
];

const RevenueByCategoryChart = ({ data = [], loading = false, error = null }) => {
  const totalRevenueAll = data.reduce((sum, item) => sum + (item.totalRevenue || 0), 0);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const share = totalRevenueAll > 0 ? (item.totalRevenue / totalRevenueAll) * 100 : 0;
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
          <p style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.3rem' }}>
            📁 {item.category}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Revenue: {formatCurrency(item.totalRevenue)} ({formatPercent(share)})
            </span>
            <span style={{ color: 'var(--secondary)' }}>
              Units Sold: {formatNumber(item.quantitySold)}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Transactions: {item.transactionCount}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCustomLegend = (props) => {
    const { payload } = props;
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0.75rem 1.25rem',
          marginTop: '0.5rem',
          fontSize: '0.8rem',
        }}
      >
        {payload.map((entry, index) => {
          const item = data[index] || {};
          const share = totalRevenueAll > 0 ? (item.totalRevenue / totalRevenueAll) * 100 : 0;
          return (
            <div
              key={`legend-${index}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: entry.color,
                  display: 'inline-block',
                }}
              />
              <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                {entry.value}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                ({formatPercent(share)})
              </span>
            </div>
          );
        })}
      </div>
    );
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
      Categorize Inventory
    </Link>
  );

  return (
    <ChartCard
      title="Revenue Share by Category"
      subtitle="Departmental revenue distribution matched accurately from product lines"
      loading={loading}
      error={error}
      empty={!data || data.length === 0}
      emptyMessage="No sales categorized yet. Add products with categories to view distribution."
      emptyAction={emptyAction}
    >
      <div style={{ width: '100%', height: 300, minHeight: 300, marginTop: '0.5rem' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={data}
              dataKey="totalRevenue"
              nameKey="category"
              cx="50%"
              cy="45%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Legend content={renderCustomLegend} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default RevenueByCategoryChart;
