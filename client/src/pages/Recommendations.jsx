import React, { useState, useEffect, useCallback } from 'react';
import {
  getRecommendations,
  updateRecommendationStatus,
} from '../services/recommendationService';
import { formatCurrency, formatNumber } from '../utils/formatters';

const Recommendations = () => {
  const [recommendations, setRecommendations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('pending'); // default to active

  // Expanded evidence drawers
  const [expandedCards, setExpandedCards] = useState(new Set());

  // Purchase Order Preview Modal State
  const [poModalData, setPoModalData] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRecommendations({
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        priority: selectedPriority !== 'all' ? selectedPriority : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
      });

      const dataPayload = res?.data || res;
      setRecommendations(dataPayload?.recommendations || []);
      setSummary(dataPayload?.summary || null);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Failed to generate business decision recommendations.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedPriority, selectedStatus]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const toggleExpandCard = (id) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleStatusUpdate = async (id, newStatus) => {
    setUpdatingId(id);
    try {
      await updateRecommendationStatus(id, newStatus);
      // Close modal if open
      if (poModalData && poModalData._id === id) {
        setPoModalData(null);
      }
      // Refresh list
      await fetchRecommendations();
    } catch (err) {
      console.error('Failed to update recommendation status:', err);
      alert(err.response?.data?.message || 'Failed to update recommendation status.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Render Priority Badge
  const renderPriorityBadge = (priority) => {
    const config = {
      critical: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
      high: { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
      medium: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
      low: { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' },
    };
    const c = config[priority] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
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
        {priority}
      </span>
    );
  };

  // Render Category Badge
  const renderCategoryBadge = (category) => {
    const config = {
      'Restock Urgency': { bg: '#fee2e2', text: '#b91c1c' },
      'Inventory Optimization': { bg: '#ede9fe', text: '#6d28d9' },
      'Demand Trends': { bg: '#e0f2fe', text: '#0369a1' },
      'Store Operations': { bg: '#fef9c3', text: '#854d0e' },
    };
    const c = config[category] || { bg: '#f1f5f9', text: '#475569' };
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.15rem 0.5rem',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.72rem',
          fontWeight: 600,
          backgroundColor: c.bg,
          color: c.text,
        }}
      >
        {category}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.75rem' }}>💡</span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Business Recommendations & Decision Support
            </h1>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                backgroundColor: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fde68a',
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
              }}
            >
              Module 6
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '800px', lineHeight: 1.5 }}>
            Deterministic decision rules, lead-time reorder calculations, slow-moving capital recovery, and anomaly follow-ups.
            Every recommendation is grounded in verified historical data with concrete evidence.
          </p>
        </div>

        <button
          onClick={fetchRecommendations}
          disabled={loading}
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-main)',
            padding: '0.55rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            fontSize: '0.825rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          🔄 {loading ? 'Evaluating...' : 'Refresh Decisions'}
        </button>
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
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            ⚠️ <strong>Error:</strong> {error}
          </div>
          <button
            onClick={fetchRecommendations}
            style={{
              backgroundColor: '#991b1b',
              color: '#fff',
              border: 'none',
              padding: '0.4rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🔄 Retry
          </button>
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
        {/* Total Active Decisions */}
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
              Active Decisions
            </span>
            <span style={{ fontSize: '1.2rem' }}>📋</span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: 'var(--text-main)' }}>
            {formatNumber(summary?.totalActive || 0)}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Pending retailer action
          </p>
        </div>

        {/* Critical Restock Alerts */}
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
              Critical Restocks
            </span>
            <span style={{ fontSize: '1.2rem' }}>🚨</span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: '#dc2626' }}>
            {formatNumber(summary?.criticalCount || 0)}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Out of stock or runout &le; lead time
          </p>
        </div>

        {/* Capital at Risk in Excess Stock */}
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
              Capital at Risk
            </span>
            <span style={{ fontSize: '1.2rem' }}>💰</span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: '#d97706' }}>
            {formatCurrency(summary?.totalCapitalAtRisk || 0)}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Tied up in stagnant / dead inventory
          </p>
        </div>

        {/* Recommended Replenishment Units */}
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
              Suggested Reorder
            </span>
            <span style={{ fontSize: '1.2rem' }}>📦</span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: 'var(--primary)' }}>
            {formatNumber(summary?.totalSuggestedOrderUnits || 0)} units
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Est. outlay: {formatCurrency(summary?.totalEstimatedOutlay || 0)}
          </p>
        </div>
      </div>

      {/* Filter Tabs & Controls */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Categories' },
            { id: 'Restock Urgency', label: '🚨 Restock Urgency' },
            { id: 'Inventory Optimization', label: '📦 Inventory Optimization' },
            { id: 'Demand Trends', label: '📉 Demand Trends' },
            { id: 'Store Operations', label: '⚙️ Store Operations' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                backgroundColor: selectedCategory === cat.id ? 'var(--primary)' : 'var(--bg-main)',
                color: selectedCategory === cat.id ? '#fff' : 'var(--text-main)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.4rem 0.8rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Status & Priority Selectors */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.35rem 0.65rem',
              fontSize: '0.8rem',
              color: 'var(--text-main)',
            }}
          >
            <option value="pending">Active (Pending)</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Dismissed</option>
            <option value="all">All Statuses</option>
          </select>

          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.35rem 0.65rem',
              fontSize: '0.8rem',
              color: 'var(--text-main)',
            }}
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Decision Recommendations Cards List */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
            Evaluating decision models and inventory velocity...
          </p>
          <p style={{ fontSize: '0.85rem' }}>
            Analyzing stock thresholds, demand patterns, and operational signals.
          </p>
        </div>
      ) : error && recommendations.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1.5px solid #fca5a5',
            borderRadius: 'var(--radius-lg)',
            padding: '3rem 2rem',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>⚠️</span>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#991b1b', marginBottom: '0.4rem' }}>
            Failed to Load Decision Recommendations
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            {error}
          </p>
          <button
            onClick={fetchRecommendations}
            style={{
              backgroundColor: 'var(--primary)',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            🔄 Retry Loading
          </button>
        </div>
      ) : recommendations.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1.5px dashed var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '3rem 2rem',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>✨</span>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
            No Recommendations Matching Filters
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Inventory buffers are healthy and no critical demand anomalies were detected for this view.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2.5rem' }}>
          {recommendations.map((rec) => {
            const isExpanded = expandedCards.has(rec._id);
            const isUpdating = updatingId === rec._id;
            const hasPo = ['reorder_urgency', 'high_demand_stockout_risk'].includes(rec.type);

            return (
              <div
                key={rec._id}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderLeft: `4px solid ${
                    rec.priority === 'critical'
                      ? '#dc2626'
                      : rec.priority === 'high'
                      ? '#ea580c'
                      : rec.priority === 'medium'
                      ? '#d97706'
                      : '#4f46e5'
                  }`,
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem 1.5rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {/* Card Top Row: Badges & Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {renderPriorityBadge(rec.priority)}
                    {renderCategoryBadge(rec.category)}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {rec.explanation?.ruleTriggered || rec.dedupKey}
                    </span>
                  </div>

                  <div>
                    {rec.status === 'accepted' ? (
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', backgroundColor: '#dcfce7', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
                        ✓ Accepted
                      </span>
                    ) : rec.status === 'rejected' ? (
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', backgroundColor: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
                        ✕ Dismissed
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9a3412', backgroundColor: '#ffedd5', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
                        ● Action Required
                      </span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                  {rec.title}
                </h3>

                {/* Domain Reason */}
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.85rem', lineHeight: 1.5 }}>
                  {rec.reason}
                </p>

                {/* Proposed Action Box */}
                <div
                  style={{
                    backgroundColor: 'rgba(37, 99, 235, 0.05)',
                    border: '1px solid rgba(37, 99, 235, 0.2)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem 1rem',
                    marginBottom: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>👉</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--primary)', display: 'block' }}>
                      Proposed Action:
                    </strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                      {rec.actionProposed}
                    </span>
                  </div>
                </div>

                {/* Data-Sufficiency Notice (if applicable) */}
                {!rec.isDataSufficient && (
                  <div style={{ marginBottom: '0.85rem', fontSize: '0.78rem', color: '#b45309', backgroundColor: '#fef3c7', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                    ℹ️ <strong>Standard Buffer Notice:</strong> Demand projection was based on catalog safety thresholds due to limited historical sales records (&lt; 3 distinct days).
                  </div>
                )}

                {/* Expandable Evidence Drawer */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: '0.85rem',
                      marginBottom: '0.85rem',
                      padding: '1rem',
                      backgroundColor: 'var(--bg-main)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <h4 style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
                      Empirical Evidence & Mathematical Factors
                    </h4>

                    {/* Factors Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      {rec.evidence?.currentStock !== undefined && (
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Current Stock:</span>
                          <strong>{rec.evidence.currentStock} units</strong>
                        </div>
                      )}
                      {rec.evidence?.reorderThreshold !== undefined && (
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Reorder Threshold:</span>
                          <strong>{rec.evidence.reorderThreshold} units</strong>
                        </div>
                      )}
                      {rec.evidence?.avgDailyDemand !== null && rec.evidence?.avgDailyDemand !== undefined && (
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Avg Daily Demand:</span>
                          <strong>{rec.evidence.avgDailyDemand} units/day</strong>
                        </div>
                      )}
                      {rec.evidence?.runoutDays !== null && rec.evidence?.runoutDays !== undefined && (
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Estimated Runout:</span>
                          <strong>{rec.evidence.runoutDays} days</strong>
                        </div>
                      )}
                      {rec.evidence?.leadTimeDays !== undefined && (
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Supplier Lead Time:</span>
                          <strong>{rec.evidence.leadTimeDays} days</strong>
                        </div>
                      )}
                      {rec.evidence?.suggestedQuantity !== undefined && (
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Suggested Order:</span>
                          <strong style={{ color: 'var(--primary)' }}>{rec.evidence.suggestedQuantity} units</strong>
                        </div>
                      )}
                      {rec.evidence?.capitalAtRisk !== undefined && (
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Capital at Risk:</span>
                          <strong style={{ color: '#d97706' }}>{formatCurrency(rec.evidence.capitalAtRisk)}</strong>
                        </div>
                      )}
                      {rec.evidence?.declinePercentage !== undefined && (
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Sales Velocity Drop:</span>
                          <strong style={{ color: '#dc2626' }}>-{rec.evidence.declinePercentage}%</strong>
                        </div>
                      )}
                    </div>

                    {/* Factor Rules Description */}
                    {rec.explanation?.factors && rec.explanation.factors.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {rec.explanation.factors.map((f, i) => (
                          <div key={i} style={{ marginBottom: '0.2rem' }}>
                            • <strong>{f.metric}</strong> ({f.value} vs threshold {f.threshold}): {f.description}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Footer Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => toggleExpandCard(rec._id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {isExpanded ? '▲ Hide Evidence Details' : '▼ View Evidence Details'}
                  </button>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {hasPo && (
                      <button
                        onClick={() => setPoModalData(rec)}
                        style={{
                          backgroundColor: 'var(--bg-main)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-main)',
                          padding: '0.4rem 0.85rem',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        📄 Preview PO Draft
                      </button>
                    )}

                    {rec.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => handleStatusUpdate(rec._id, 'accepted')}
                          disabled={isUpdating}
                          style={{
                            backgroundColor: '#16a34a',
                            color: '#fff',
                            border: 'none',
                            padding: '0.4rem 0.85rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: isUpdating ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isUpdating ? 'Saving...' : '✓ Accept'}
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(rec._id, 'rejected')}
                          disabled={isUpdating}
                          style={{
                            backgroundColor: 'transparent',
                            border: '1px solid var(--border)',
                            color: 'var(--text-muted)',
                            padding: '0.4rem 0.85rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: isUpdating ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isUpdating ? 'Saving...' : '✕ Dismiss'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleStatusUpdate(rec._id, 'pending')}
                        disabled={isUpdating}
                        style={{
                          backgroundColor: 'transparent',
                          border: '1px solid var(--border)',
                          color: 'var(--primary)',
                          padding: '0.35rem 0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: isUpdating ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Re-open as Active
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Purchase Order Preview Modal */}
      {poModalData && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '650px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Purchase Order Draft Preview
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Internal replenishment draft based on deterministic reorder rules
                </span>
              </div>
              <button
                onClick={() => setPoModalData(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.6rem 0.5rem' }}>Item Details</th>
                    <th style={{ padding: '0.6rem 0.5rem' }}>Supplier</th>
                    <th style={{ padding: '0.6rem 0.5rem' }}>On-Hand</th>
                    <th style={{ padding: '0.6rem 0.5rem' }}>Suggested Qty</th>
                    <th style={{ padding: '0.6rem 0.5rem' }}>Unit Cost</th>
                    <th style={{ padding: '0.6rem 0.5rem' }}>Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <strong style={{ display: 'block' }}>{poModalData.productId?.name || poModalData.title}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SKU: {poModalData.productId?.sku || 'N/A'}</span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>
                      {poModalData.evidence?.supplier || 'Primary Supplier'}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                      {poModalData.evidence?.currentStock ?? 0}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700, color: 'var(--primary)' }}>
                      {poModalData.evidence?.suggestedQuantity ?? 0} units
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {formatCurrency(poModalData.evidence?.unitCost ?? 0)}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 800 }}>
                      {formatCurrency(poModalData.evidence?.estimatedTotalCost ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ backgroundColor: '#f8fafc', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              ℹ️ <strong>Approval Notice:</strong> Accepting this draft records the decision in your decision platform. No stock counts will be modified until actual delivery is received in the inventory manager.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setPoModalData(null)}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  padding: '0.55rem 1.15rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusUpdate(poModalData._id, 'accepted')}
                style={{
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  padding: '0.55rem 1.25rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ✓ Accept & Approve PO Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Methodology & Algorithmic Transparency Box */}
      <section>
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>📐</span>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Deterministic Decision Rules & Methodology
            </h3>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1.25rem',
              fontSize: '0.825rem',
              color: 'var(--text-muted)',
              lineHeight: 1.55,
            }}
          >
            <div>
              <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.25rem' }}>
                1. Lead-Time Reorder Buffer Model
              </strong>
              Target stock is calculated as <code>ReorderThreshold + (AvgDailyDemand &times; LeadTimeDays)</code>.
              When sales history is insufficient (&lt; 3 days), a transparent catalog threshold buffer of <code>2 &times; ReorderThreshold - Stock</code> is used.
            </div>

            <div>
              <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.25rem' }}>
                2. Stagnant Velocity &amp; Capital-at-Risk Floor
              </strong>
              To prevent flagging fast-moving high-value goods, slow movers must satisfy stock &gt; 2&times; threshold, runout &gt; 90 days (or &le; 1 unit sold in 30 days), and have &ge; $50 tied up in excess inventory.
            </div>

            <div>
              <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.25rem' }}>
                3. Split-Window Sales Decline Detection
              </strong>
              Evaluates consecutive 7-day chronological periods (t-14 to t-8 vs t-7 to t-1). Triggered only when baseline sales were &ge; 5 units across &ge; 2 distinct days and demand dropped by &ge; 40%.
            </div>

            <div>
              <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.25rem' }}>
                4. Mutual Exclusion &amp; Conflict Resolution
              </strong>
              Restock alerts and overstock alerts are mutually exclusive for the same product. Out-of-stock items take absolute precedence over sales decline alerts.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Recommendations;
