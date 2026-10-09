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
  Cell,
} from 'recharts';
import ChartCard from './ChartCard';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const RevenueByProductChart = ({ data = [], loading = false, error = null }) => {
  // Truncate long product names for x-axis readability
  const truncate = (str, max = 14) => {
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
          <p style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.3rem' }}>
            🏷️ {item.productName}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Total Revenue: {formatCurrency(item.totalRevenue)}
            </span>
            <span style={{ color: 'var(--secondary)' }}>
              Units Sold: {formatNumber(item.quantitySold)}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Orders: {item.transactionCount}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

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
      + Add Sales Records
    </Link>
  );

  return (
    <ChartCard
      title="Top Products by Revenue"
      subtitle="Highest revenue-generating catalog items calculated from customer sales"
      loading={loading}
      error={error}
      empty={!data || data.length === 0}
      emptyMessage="No product sales records found. Add transactions to see top performers."
      emptyAction={emptyAction}
    >
      <div style={{ width: '100%', height: 300, minHeight: 300, marginTop: '0.5rem' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 15, right: 15, left: 0, bottom: 25 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="productName"
              tickFormatter={(val) => truncate(val, 12)}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              dy={10}
              interval={0}
            />
            <YAxis
              tickFormatter={(val) => `$${val}`}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              dx={-4}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="totalRevenue"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === 0 ? '#1d4ed8' : index === 1 ? '#2563eb' : '#3b82f6'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default RevenueByProductChart;
