import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getSummaryMetrics,
  getRevenueByProduct,
  getRevenueByCategory,
  getSalesOverTime,
  getInventoryStockAnalytics,
  getLowStockAnalytics,
} from '../services/analyticsService';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';

import SalesOverTimeChart from '../components/charts/SalesOverTimeChart';
import RevenueByProductChart from '../components/charts/RevenueByProductChart';
import RevenueByCategoryChart from '../components/charts/RevenueByCategoryChart';
import InventoryStockChart from '../components/charts/InventoryStockChart';
import LowStockAlertsWidget from '../components/charts/LowStockAlertsWidget';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Summary KPI Metrics State
  const [metrics, setMetrics] = useState({
    totalProducts: 0,
    totalSalesCount: 0,
    totalUnitsSold: 0,
    totalRevenue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    lowStockProducts: [],
    recentSales: [],
    hasData: false,
  });
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [errorMetrics, setErrorMetrics] = useState(null);

  // Global Refresh State
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Individual Chart Datasets & States
  const [salesTimeData, setSalesTimeData] = useState([]);
  const [loadingSalesTime, setLoadingSalesTime] = useState(true);
  const [errorSalesTime, setErrorSalesTime] = useState(null);
  const [activeTimeRange, setActiveTimeRange] = useState('all');

  const [revenueProductData, setRevenueProductData] = useState([]);
  const [loadingRevProduct, setLoadingRevProduct] = useState(true);
  const [errorRevProduct, setErrorRevProduct] = useState(null);

  const [revenueCategoryData, setRevenueCategoryData] = useState([]);
  const [loadingRevCategory, setLoadingRevCategory] = useState(true);
  const [errorRevCategory, setErrorRevCategory] = useState(null);

  const [inventoryStockData, setInventoryStockData] = useState([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [errorStock, setErrorStock] = useState(null);

  const [lowStockData, setLowStockData] = useState([]);
  const [loadingLowStock, setLoadingLowStock] = useState(true);
  const [errorLowStock, setErrorLowStock] = useState(null);

  // Fetch Sales Over Time with specific time range
  const loadSalesOverTime = useCallback(async (range) => {
    setLoadingSalesTime(true);
    setErrorSalesTime(null);
    try {
      const res = await getSalesOverTime({
        range: range === 'all' ? undefined : range,
      });
      if (res && res.data) {
        setSalesTimeData(res.data);
      }
    } catch (err) {
      console.error('Failed to load sales over time:', err);
      setErrorSalesTime(err.response?.data?.message || 'Failed to aggregate sales time-series');
    } finally {
      setLoadingSalesTime(false);
    }
  }, []);

  // Handler for time-range button toggle
  const handleTimeRangeChange = (range) => {
    setActiveTimeRange(range);
    loadSalesOverTime(range);
  };

  // Master refresh function that fetches all data concurrently
  const fetchAllDashboardData = useCallback(async (selectedRange = activeTimeRange) => {
    setRefreshing(true);
    setErrorMetrics(null);

    const [
      summaryRes,
      salesRes,
      prodRes,
      catRes,
      stockRes,
      lowRes,
    ] = await Promise.allSettled([
      getSummaryMetrics(),
      getSalesOverTime({ range: selectedRange === 'all' ? undefined : selectedRange }),
      getRevenueByProduct(8),
      getRevenueByCategory(),
      getInventoryStockAnalytics(),
      getLowStockAnalytics(),
    ]);

    // Handle Summary Metrics
    setLoadingMetrics(false);
    if (summaryRes.status === 'fulfilled' && summaryRes.value?.data) {
      setMetrics(summaryRes.value.data);
    } else {
      console.error('Failed summary metrics:', summaryRes.reason);
      setErrorMetrics('Failed to synchronize summary metrics');
    }

    // Handle Sales Over Time
    setLoadingSalesTime(false);
    if (salesRes.status === 'fulfilled' && salesRes.value?.data) {
      setSalesTimeData(salesRes.value.data);
      setErrorSalesTime(null);
    } else {
      setErrorSalesTime(salesRes.reason?.response?.data?.message || 'Failed to aggregate time series');
    }

    // Handle Revenue by Product
    setLoadingRevProduct(false);
    if (prodRes.status === 'fulfilled' && prodRes.value?.data) {
      setRevenueProductData(prodRes.value.data);
      setErrorRevProduct(null);
    } else {
      setErrorRevProduct(prodRes.reason?.response?.data?.message || 'Failed to load top products');
    }

    // Handle Revenue by Category
    setLoadingRevCategory(false);
    if (catRes.status === 'fulfilled' && catRes.value?.data) {
      setRevenueCategoryData(catRes.value.data);
      setErrorRevCategory(null);
    } else {
      setErrorRevCategory(catRes.reason?.response?.data?.message || 'Failed to aggregate categories');
    }

    // Handle Stock Levels
    setLoadingStock(false);
    if (stockRes.status === 'fulfilled' && stockRes.value?.data) {
      setInventoryStockData(stockRes.value.data);
      setErrorStock(null);
    } else {
      setErrorStock(stockRes.reason?.response?.data?.message || 'Failed to load stock levels');
    }

    // Handle Low Stock Alerts
    setLoadingLowStock(false);
    if (lowRes.status === 'fulfilled' && lowRes.value?.data) {
      setLowStockData(lowRes.value.data);
      setErrorLowStock(null);
    } else {
      setErrorLowStock(lowRes.reason?.response?.data?.message || 'Failed to load low stock alerts');
    }

    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setRefreshing(false);
  }, [activeTimeRange]);

  useEffect(() => {
    fetchAllDashboardData();
  }, [fetchAllDashboardData]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const pipelineStages = [
    {
      id: 2,
      name: 'Sales & Inventory Records',
      status: 'Active (Module 2)',
      desc: 'Point-of-sale transactions and catalog shelf counts active via CSV and manual CRUD.',
      icon: '📊',
    },
    {
      id: 3,
      name: 'Business Intelligence Analytics',
      status: 'Active (Module 3)',
      desc: 'Interactive Recharts dashboards for revenue trends, category share, and stock health.',
      icon: '📈',
    },
    {
      id: 4,
      name: 'ML Demand Forecasting Engine',
      status: 'Active (Module 4)',
      desc: 'Holt\'s linear exponential smoothing for revenue forecasts, product demand, and stockout risk.',
      icon: '🤖',
    },
    {
      id: 5,
      name: 'Anomaly Detection & Volatility Studio',
      status: 'Active (Module 5)',
      desc: 'Non-parametric IQR corridors, modified Z-score receipt outliers, and sudden drop detection.',
      icon: '🚨',
    },
    {
      id: 6,
      name: 'Business Recommendations & Decision Support',
      status: 'Active (Module 6)',
      desc: 'Transparent rule-based purchase orders, slow-moving clearance, and demand drop alerts.',
      icon: '💡',
    },
    {
      id: 7,
      name: 'What-If Simulation Simulator',
      status: 'Active (Module 7)',
      desc: 'Model pricing changes, hypothetical demand shifts, discount breakevens, and supplier lead-time buffers.',
      icon: '🧪',
      link: '/scenarios',
    },
    {
      id: 8,
      name: 'Decision Audit & Outcome Tracking',
      status: 'Active (Module 8)',
      desc: 'Closed-loop empirical outcome evaluation, realized ROI accounting, and simulation reality verification.',
      icon: '🎯',
      link: '/decision-audit',
    },
  ];

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Welcome Banner */}
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
          gap: '1.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '1.75rem' }}>👋</span>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Welcome back, {user?.name || 'Retail Owner'}!
            </h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
            Business Intelligence & Decision Intelligence Workspace for{' '}
            <strong style={{ color: 'var(--text-main)' }}>{user?.businessName || 'Your Shop'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Functional Refresh Button */}
          <button
            onClick={() => fetchAllDashboardData()}
            disabled={refreshing}
            style={{
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border)',
              color: 'var(--text-main)',
              padding: '0.6rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'background-color 0.15s ease',
              opacity: refreshing ? 0.7 : 1,
            }}
            title="Reload live metrics and charts directly from MongoDB"
          >
            <span
              style={{
                display: 'inline-block',
                animation: refreshing ? 'spin 1s linear infinite' : 'none',
              }}
            >
              🔄
            </span>
            <span>{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>

          <Link
            to="/upload"
            style={{
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              padding: '0.6rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            Upload CSV
          </Link>

          <button
            onClick={handleLogout}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--danger)',
              padding: '0.6rem 1.15rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>Log Out</span>
          </button>
        </div>
      </section>

      {/* Synchronized Status & Timestamp Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Live Store Performance Metrics
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            Real-time aggregation from verified MongoDB sales and inventory collections
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {lastUpdated && (
            <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
              Last synced: <strong>{lastUpdated}</strong>
            </span>
          )}
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--success)',
              backgroundColor: '#dcfce7',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
            }}
          >
            ● Live Data Synchronized
          </span>
        </div>
      </div>

      {errorMetrics && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: 'var(--radius-sm)',
            color: '#b91c1c',
            fontSize: '0.85rem',
          }}
        >
          ⚠️ {errorMetrics}
        </div>
      )}

      {/* Real Database KPI Metrics Section */}
      <section style={{ marginBottom: '2.5rem' }}>
        {loadingMetrics ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>Aggregating store metrics...</p>
          </div>
        ) : !metrics.hasData ? (
          /* Honest Empty State */
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1.5px dashed var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>📊</span>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              No Store Data Recorded Yet
            </h3>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                maxWidth: '480px',
                margin: '0 auto 1.5rem',
                lineHeight: 1.5,
              }}
            >
              Your database has zero sales transactions and zero catalog products. Metrics and analytics are derived purely from actual records, never fabricated sample data.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                to="/inventory"
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
                + Add Products to Inventory
              </Link>
              <Link
                to="/sales"
                style={{
                  backgroundColor: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border)',
                  padding: '0.55rem 1.25rem',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  textDecoration: 'none',
                }}
              >
                + Record a Sale
              </Link>
              <Link
                to="/upload"
                style={{
                  backgroundColor: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border)',
                  padding: '0.55rem 1.25rem',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  textDecoration: 'none',
                }}
              >
                📥 Upload Batch CSV
              </Link>
            </div>
          </div>
        ) : (
          /* Live KPI Cards Grid */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* Total Revenue */}
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
                Recorded Revenue
              </span>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--success)' }}>
                {formatCurrency(metrics.totalRevenue)}
              </h3>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.3 }}>
                * Sum of actual recorded sales receipts in MongoDB.
              </p>
            </div>

            {/* Total Sales Transactions */}
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
                Total Transactions
              </span>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-main)' }}>
                {formatNumber(metrics.totalSalesCount)}
              </h3>
              <Link
                to="/sales"
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--primary)',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-block',
                  marginTop: '0.4rem',
                }}
              >
                View sales log &rarr;
              </Link>
            </div>

            {/* Total Units Sold */}
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
                Total Units Sold
              </span>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-main)' }}>
                {formatNumber(metrics.totalUnitsSold)}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Cumulative physical sales volume
              </p>
            </div>

            {/* Catalog Products */}
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
                Catalog Products
              </span>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-main)' }}>
                {formatNumber(metrics.totalProducts)}
              </h3>
              <Link
                to="/inventory"
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--primary)',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-block',
                  marginTop: '0.4rem',
                }}
              >
                Manage inventory &rarr;
              </Link>
            </div>

            {/* Low Stock Alerts */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: `1.5px solid ${metrics.lowStockCount > 0 ? '#fca5a5' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  color: metrics.lowStockCount > 0 ? 'var(--danger)' : 'var(--text-muted)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Low Stock Items
              </span>
              <h3
                style={{
                  fontSize: '1.6rem',
                  fontWeight: 800,
                  marginTop: '0.25rem',
                  color: metrics.lowStockCount > 0 ? 'var(--danger)' : 'var(--success)',
                }}
              >
                {formatNumber(metrics.lowStockCount)}
              </h3>
              <p style={{ fontSize: '0.75rem', color: metrics.lowStockCount > 0 ? '#b91c1c' : 'var(--text-muted)', marginTop: '0.4rem' }}>
                {metrics.lowStockCount > 0
                  ? `${metrics.outOfStockCount || 0} out of stock, ${metrics.lowStockCount - (metrics.outOfStockCount || 0)} below threshold`
                  : 'All items sufficiently stocked'}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Visual Business Intelligence Analytics Section */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.35rem' }}>📈</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Business Intelligence Visual Analytics
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Interactive charts populated dynamically from MongoDB aggregation pipelines scoped to your store account
          </p>
        </div>

        {/* 2x2 Responsive Visualizations Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
            gap: '1.5rem',
            marginBottom: '1.5rem',
          }}
        >
          {/* Chart 1: Sales Over Time */}
          <SalesOverTimeChart
            data={salesTimeData}
            loading={loadingSalesTime}
            error={errorSalesTime}
            activeRange={activeTimeRange}
            onRangeChange={handleTimeRangeChange}
          />

          {/* Chart 2: Revenue by Category */}
          <RevenueByCategoryChart
            data={revenueCategoryData}
            loading={loadingRevCategory}
            error={errorRevCategory}
          />

          {/* Chart 3: Top Products by Revenue */}
          <RevenueByProductChart
            data={revenueProductData}
            loading={loadingRevProduct}
            error={errorRevProduct}
          />

          {/* Chart 4: Inventory Stock Levels vs Thresholds */}
          <InventoryStockChart
            data={inventoryStockData}
            loading={loadingStock}
            error={errorStock}
          />
        </div>

        {/* Full-Width Restock Priority & Low Stock Alerts Widget */}
        <LowStockAlertsWidget
          data={lowStockData}
          loading={loadingLowStock}
          error={errorLowStock}
        />
      </section>

      {/* Module 4: Predictive Intelligence Snapshot */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#ede9fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
              }}
            >
              🤖
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Predictive Analytics & Demand Forecasting (Module 4)
                </h3>
                <span
                  style={{
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    backgroundColor: '#dcfce7',
                    color: '#166534',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                  }}
                >
                  Active
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Holt's Linear Exponential Smoothing projections, product demand estimation, and predictive stockout risk analysis.
              </p>
            </div>
          </div>

          <Link
            to="/forecast"
            style={{
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              padding: '0.65rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span>Open Forecasting Studio</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </section>

      {/* Module 5: Anomaly Intelligence Snapshot */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
              }}
            >
              🚨
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Anomaly Detection & Volatility Studio (Module 5)
                </h3>
                <span
                  style={{
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    backgroundColor: '#dcfce7',
                    color: '#166534',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                  }}
                >
                  Active
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Non-parametric IQR corridors, trailing median baseline evaluation, and Boris Iglewicz–David Hoaglin modified Z-score receipt outlier flags.
              </p>
            </div>
          </div>

          <Link
            to="/anomalies"
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              padding: '0.65rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span>Open Anomaly Studio</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </section>

      {/* Module 6: Business Recommendations Snapshot */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
              }}
            >
              💡
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Decision Support & Recommendations (Module 6)
                </h3>
                <span
                  style={{
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    backgroundColor: '#dcfce7',
                    color: '#166534',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                  }}
                >
                  Active
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Deterministic restock suggestions, purchase order draft previews, slow-moving capital recovery, and sales drop alerts.
              </p>
            </div>
          </div>

          <Link
            to="/recommendations"
            style={{
              backgroundColor: '#d97706',
              color: '#ffffff',
              padding: '0.65rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span>Open Decision Studio</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </section>

      {/* Module 8: Decision Audit & Outcome Tracking Snapshot */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
              }}
            >
              🎯
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Decision Audit & Outcome Tracking (Module 8)
                </h3>
                <span
                  style={{
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    backgroundColor: '#dcfce7',
                    color: '#166534',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                  }}
                >
                  Active
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Closed-loop empirical evaluation over 7, 14, or 30-day windows. Measures realized ROI, averted stockouts, and simulation reality calibration.
              </p>
            </div>
          </div>

          <Link
            to="/decision-audit"
            style={{
              backgroundColor: '#059669',
              color: '#ffffff',
              padding: '0.65rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span>Open Outcome Studio</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </section>


      {/* Quick Action Navigation Grid */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '1rem' }}>
          Quick Workspaces
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* Sales Workspace */}
          <Link
            to="/sales"
            style={{
              textDecoration: 'none',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--primary-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
              }}
            >
              💳
            </div>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Sales Transactions</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Log daily retail sales and track payment records
              </p>
            </div>
          </Link>

          {/* Inventory Workspace */}
          <Link
            to="/inventory"
            style={{
              textDecoration: 'none',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--primary-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
              }}
            >
              📦
            </div>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Inventory Catalog</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Monitor SKUs, shelf stock, and reorder alerts
              </p>
            </div>
          </Link>

          {/* Upload Data Workspace */}
          <Link
            to="/upload"
            style={{
              textDecoration: 'none',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--primary-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
              }}
            >
              📥
            </div>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Upload CSV Batches</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Preview, validate, and bulk-import retail datasets
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* Analytical Modules Road-map */}
      <section>
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Analytical Features Pipeline
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Current pipeline progression for your retail intelligence platform
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {pipelineStages.map((stage) => (
            <div
              key={stage.id}
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{stage.icon}</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.2rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: stage.status.includes('Active') ? '#dcfce7' : 'var(--bg-main)',
                    color: stage.status.includes('Active') ? '#166534' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {stage.status}
                </span>
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                Module {stage.id}: {stage.name}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {stage.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
export default Dashboard;
