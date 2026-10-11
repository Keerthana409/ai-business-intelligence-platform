import React, { useState, useEffect, useCallback } from 'react';
import {
  getAudits,
  getAuditSummary,
  implementDecision,
  recalculateAudit,
  deleteAudit,
} from '../services/auditService';
import { getRecommendations } from '../services/recommendationService';
import { getSavedScenarios } from '../services/scenarioService';
import api from '../services/api';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';

const DecisionAudit = () => {
  const [audits, setAudits] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');

  // Expanded evidence drawers
  const [expandedCards, setExpandedCards] = useState(new Set());

  // Action states
  const [recalculatingId, setRecalculatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Implementation Modal State
  const [showImplementModal, setShowImplementModal] = useState(false);
  const [implementSource, setImplementSource] = useState('manual_action');
  const [recommendationsList, setRecommendationsList] = useState([]);
  const [scenariosList, setScenariosList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [selectedRecId, setSelectedRecId] = useState('');
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [modalTitle, setModalTitle] = useState('');
  const [modalType, setModalType] = useState('inventory_restock');
  const [modalDate, setModalDate] = useState(new Date().toISOString().slice(0, 10));
  const [modalWindow, setModalWindow] = useState('14');
  const [modalQuantity, setModalQuantity] = useState('');
  const [modalCostPrice, setModalCostPrice] = useState('');
  const [modalNewPrice, setModalNewPrice] = useState('');
  const [modalNotes, setModalNotes] = useState('');
  const [submittingImplement, setSubmittingImplement] = useState(false);
  const [implementError, setImplementError] = useState(null);

  const fetchAuditData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [auditsRes, summaryRes] = await Promise.all([
        getAudits({
          status: selectedStatus !== 'all' ? selectedStatus : undefined,
          decisionType: selectedType !== 'all' ? selectedType : undefined,
          decisionSource: selectedSource !== 'all' ? selectedSource : undefined,
        }),
        getAuditSummary(),
      ]);

      setAudits(auditsRes?.data?.audits || []);
      setSummary(summaryRes?.data?.summary || null);
    } catch (err) {
      console.error('Failed to load decision audits:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load decision audit trail.');
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, selectedType, selectedSource]);

  useEffect(() => {
    fetchAuditData();
  }, [fetchAuditData]);

  // Load contextual catalog data when modal opens
  const openImplementModal = async () => {
    setShowImplementModal(true);
    setImplementError(null);
    try {
      const [recRes, scenRes, prodRes] = await Promise.all([
        getRecommendations({ status: 'all' }),
        getSavedScenarios(),
        api.get('/inventory'),
      ]);
      setRecommendationsList(recRes?.data?.recommendations || recRes?.recommendations || []);
      setScenariosList(scenRes?.data?.scenarios || scenRes?.scenarios || []);
      setProductsList(prodRes?.data?.data?.products || []);
    } catch (err) {
      console.error('Failed to load contextual data for implementation:', err);
    }
  };

  const handleRecommendationSelect = (recId) => {
    setSelectedRecId(recId);
    const rec = recommendationsList.find((r) => r._id === recId);
    if (rec) {
      setModalTitle(rec.title || 'Implemented Recommendation');
      if (rec.type === 'reorder_urgency' || rec.type === 'high_demand_stockout_risk') {
        setModalType('inventory_restock');
        setModalQuantity(rec.evidence?.suggestedQuantity || '');
      } else if (rec.type === 'slow_moving_overstock' || rec.type === 'overstock_clearance') {
        setModalType('clearance_markdown');
      } else if (rec.type === 'declining_sales_alert') {
        setModalType('demand_stabilization');
      }
      const recProdId = rec.productId?._id || rec.productId || '';
      if (recProdId) {
        setSelectedProductId(String(recProdId));
        const prod = productsList.find((p) => String(p._id) === String(recProdId));
        const resolvedUnitCost =
          prod?.costPrice ??
          rec.productId?.costPrice ??
          rec.evidence?.unitCost ??
          '';
        if (resolvedUnitCost !== '') {
          setModalCostPrice(resolvedUnitCost);
        }
      } else if (rec.evidence?.unitCost !== undefined) {
        setModalCostPrice(rec.evidence.unitCost);
      }
    }
  };

  const handleScenarioSelect = (scenId) => {
    setSelectedScenarioId(scenId);
    const scen = scenariosList.find((s) => s._id === scenId);
    if (scen) {
      setModalTitle(`Implemented: ${scen.name}`);
      if (scen.scenarioType === 'inventory_reorder') {
        setModalType('inventory_restock');
        setModalQuantity(scen.inputs?.orderQuantity || '');
      } else if (scen.scenarioType === 'discount') {
        setModalType('clearance_markdown');
      } else if (scen.scenarioType === 'price_change') {
        setModalType('price_optimization');
        setModalNewPrice(scen.inputs?.proposedPrice || '');
      }
      const scenProdId = scen.productId?._id || scen.productId || '';
      if (scenProdId) {
        setSelectedProductId(String(scenProdId));
        const prod = productsList.find((p) => String(p._id) === String(scenProdId));
        const resolvedUnitCost =
          prod?.costPrice ??
          scen.productId?.costPrice ??
          scen.inputs?.unitCost ??
          '';
        if (resolvedUnitCost !== '') {
          setModalCostPrice(resolvedUnitCost);
        }
      }
    }
  };

  const handleProductSelect = (prodId) => {
    setSelectedProductId(prodId);
    const prod = productsList.find((p) => String(p._id) === String(prodId));
    if (prod) {
      setModalCostPrice(prod.costPrice !== undefined ? prod.costPrice : '');
      if (!modalTitle) {
        setModalTitle(`Action on ${prod.name}`);
      }
    }
  };

  const handleSubmitImplementation = async (e) => {
    e.preventDefault();
    if (!modalTitle || !modalDate) {
      setImplementError('Title and confirmed implementation date are required.');
      return;
    }

    setSubmittingImplement(true);
    setImplementError(null);
    try {
      const qtyVal = modalQuantity ? Number(modalQuantity) : 0;
      const unitCostVal = modalCostPrice ? Number(modalCostPrice) : 0;
      const purchaseOutlayVal = Number((Math.round(qtyVal * unitCostVal * 100) / 100).toFixed(2));

      await implementDecision({
        decisionSource: implementSource,
        recommendationId: implementSource === 'recommendation' ? selectedRecId : undefined,
        scenarioId: implementSource === 'scenario' ? selectedScenarioId : undefined,
        decisionType: modalType,
        title: modalTitle,
        productId: selectedProductId || undefined,
        implementedAt: modalDate,
        observationWindowDays: parseInt(modalWindow, 10),
        implementationNotes: modalNotes,
        implementedParameters: {
          quantityOrdered: qtyVal,
          unitCost: unitCostVal,
          costPrice: unitCostVal,
          purchaseOutlay: purchaseOutlayVal,
          newPrice: modalNewPrice ? Number(modalNewPrice) : 0,
        },
      });

      setShowImplementModal(false);
      // Reset form
      setModalTitle('');
      setModalNotes('');
      setModalQuantity('');
      setModalCostPrice('');
      setModalNewPrice('');
      setSelectedRecId('');
      setSelectedScenarioId('');
      setSelectedProductId('');
      // Refresh list
      await fetchAuditData();
    } catch (err) {
      console.error('Failed to implement decision:', err);
      setImplementError(err.response?.data?.message || err.message || 'Failed to confirm implementation.');
    } finally {
      setSubmittingImplement(false);
    }
  };

  const handleRecalculate = async (id) => {
    setRecalculatingId(id);
    try {
      await recalculateAudit(id);
      await fetchAuditData();
    } catch (err) {
      console.error('Recalculation error:', err);
      alert(err.response?.data?.message || 'Failed to recalculate audit record.');
    } finally {
      setRecalculatingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this decision audit record?')) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteAudit(id);
      await fetchAuditData();
    } catch (err) {
      console.error('Delete error:', err);
      alert(err.response?.data?.message || 'Failed to delete audit record.');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleExpand = (id) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Badge Helper Functions
  const renderStatusBadge = (status) => {
    const config = {
      in_observation: { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe', label: 'In Observation' },
      evaluated_matured: { bg: '#dcfce7', text: '#166534', border: '#bbf7d0', label: 'Evaluated & Matured' },
      insufficient_data: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', label: 'Insufficient Data' },
      abandoned: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: 'Cancelled' },
    };
    const c = config[status] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db', label: status };
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.2rem 0.6rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 700,
          backgroundColor: c.bg,
          color: c.text,
          border: `1px solid ${c.border}`,
        }}
      >
        ● {c.label}
      </span>
    );
  };

  const renderRatingBadge = (rating) => {
    const config = {
      favorable: { bg: '#dcfce7', text: '#166534', border: '#86efac', label: 'Favorable Outcome' },
      neutral: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db', label: 'Neutral Impact' },
      unfavorable: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: 'Unfavorable Variance' },
      inconclusive: { bg: '#fef3c7', text: '#92400e', border: '#fde047', label: 'Inconclusive Data' },
      pending: { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe', label: 'Outcome Pending' },
    };
    const c = config[rating] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db', label: rating };
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.2rem 0.6rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 700,
          backgroundColor: c.bg,
          color: c.text,
          border: `1px solid ${c.border}`,
        }}
      >
        {c.label}
      </span>
    );
  };

  const renderTypeBadge = (type) => {
    const map = {
      inventory_restock: { label: '📦 Inventory Restock', color: '#2563eb' },
      clearance_markdown: { label: '🏷️ Clearance Markdown', color: '#d97706' },
      price_optimization: { label: '💲 Price Optimization', color: '#059669' },
      promotional_discount: { label: '🔥 Promotional Discount', color: '#dc2626' },
      demand_stabilization: { label: '📈 Demand Stabilization', color: '#7c3aed' },
    };
    const item = map[type] || { label: type, color: 'var(--text-muted)' };
    return (
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: item.color }}>
        {item.label}
      </span>
    );
  };

  const renderSourceBadge = (source) => {
    const map = {
      recommendation: { label: 'From Recommendation', bg: '#f3e8ff', text: '#6b21a8' },
      scenario: { label: 'From What-If Scenario', bg: '#e0f2fe', text: '#0369a1' },
      manual_action: { label: 'Manual Store Action', bg: '#f1f5f9', text: '#475569' },
    };
    const item = map[source] || { label: source, bg: '#f3f4f6', text: '#374151' };
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.15rem 0.5rem',
          borderRadius: '4px',
          fontSize: '0.72rem',
          fontWeight: 600,
          backgroundColor: item.bg,
          color: item.text,
        }}
      >
        {item.label}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
              CLOSED-LOOP DECISION INTELLIGENCE
            </span>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.5rem 0' }}>
            🎯 Decision Audit & Outcome Tracking
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0, maxWidth: '780px' }}>
            Empirically track the real-world consequences of business decisions. Compares pre-decision baseline performance with post-implementation actuals over controlled 7, 14, or 30-day windows to quantify realized ROI, averted stockouts, and unlocked working capital.
          </p>
        </div>

        <button
          onClick={openImplementModal}
          style={{
            backgroundColor: 'var(--primary)',
            color: '#ffffff',
            border: 'none',
            padding: '0.75rem 1.4rem',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          ➕ Confirm Implementation
        </button>
      </div>

      {/* Executive KPI Summary Grid */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Implemented</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.35rem' }}>
              {formatNumber(summary.totalImplemented)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {summary.inObservationCount} maturing | {summary.maturedCount} evaluated
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Success Rate</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: summary.successRate !== null ? 'var(--success)' : 'var(--text-muted)', marginTop: '0.35rem' }}>
              {summary.successRate !== null ? `${summary.successRate}%` : 'N/A'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {summary.favorableCount} favorable / {summary.maturedCount} evaluated
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Capital Recovered</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#d97706', marginTop: '0.35rem' }}>
              {formatCurrency(summary.totalCapitalRecovered)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Unlocked dead stock liquidity
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Stockouts Averted</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2563eb', marginTop: '0.35rem' }}>
              {formatNumber(summary.stockoutsAvertedCount)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Protected revenue velocity
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Incremental Net Benefit</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: summary.totalIncrementalNetBenefit >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '0.35rem' }}>
              {summary.totalIncrementalNetBenefit >= 0 ? '+' : ''}{formatCurrency(summary.totalIncrementalNetBenefit)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Cumulative gross profit delta
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs & Selectors */}
      <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status:</span>
          {['all', 'in_observation', 'evaluated_matured', 'insufficient_data'].map((s) => (
            <button
              key={s}
              onClick={() => setSelectedStatus(s)}
              style={{
                backgroundColor: selectedStatus === s ? 'var(--primary)' : 'var(--bg-main)',
                color: selectedStatus === s ? '#ffffff' : 'var(--text-main)',
                border: '1px solid var(--border)',
                padding: '0.4rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: selectedStatus === s ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {s === 'all' ? 'All' : s === 'in_observation' ? 'In Observation' : s === 'evaluated_matured' ? 'Evaluated' : 'Insufficient Data'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
            }}
          >
            <option value="all">All Decision Types</option>
            <option value="inventory_restock">Inventory Restock</option>
            <option value="clearance_markdown">Clearance Markdown</option>
            <option value="price_optimization">Price Optimization</option>
            <option value="promotional_discount">Promotional Discount</option>
            <option value="demand_stabilization">Demand Stabilization</option>
          </select>

          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
            }}
          >
            <option value="all">All Sources</option>
            <option value="recommendation">Recommendations</option>
            <option value="scenario">What-If Scenarios</option>
            <option value="manual_action">Manual Actions</option>
          </select>
        </div>
      </div>

      {/* Main Audit Records List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-muted)' }}>Synchronizing Decision Audit Trail...</div>
        </div>
      ) : error ? (
        <div style={{ padding: '1.5rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 'var(--radius-md)', border: '1px solid #fca5a5' }}>
          {error}
        </div>
      ) : audits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.5rem 0' }}>No Implemented Decisions Tracked</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '520px', margin: '0 auto 1.5rem auto' }}>
            Closed-loop tracking begins when you confirm implementation of an accepted recommendation, link a What-If scenario, or log an operational action.
          </p>
          <button
            onClick={openImplementModal}
            style={{
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              padding: '0.65rem 1.3rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Confirm an Action Now &rarr;
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {audits.map((audit) => {
            const isExpanded = expandedCards.has(audit._id);
            const isMatured = audit.evaluation?.status === 'evaluated_matured';
            const daysElapsed = audit.postMetrics?.daysElapsed || 0;
            const windowDays = audit.observationWindowDays || 14;

            return (
              <div
                key={audit._id}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.5rem',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'box-shadow 0.2s ease',
                }}
              >
                {/* Top Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                      {renderTypeBadge(audit.decisionType)}
                      {renderSourceBadge(audit.decisionSource)}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Implemented on {formatDate(audit.implementedAt)} ({windowDays}-Day Window)
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                      {audit.title}
                    </h3>
                    {audit.productName && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Product: <strong>{audit.productName}</strong> {audit.sku ? `(${audit.sku})` : ''}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {renderStatusBadge(audit.evaluation?.status)}
                    {renderRatingBadge(audit.evaluation?.outcomeRating)}
                  </div>
                </div>

                {/* Progress & Headline Box */}
                <div
                  style={{
                    backgroundColor: isMatured ? '#f0fdf4' : '#eff6ff',
                    border: `1px solid ${isMatured ? '#bbf7d0' : '#bfdbfe'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem 1rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: isMatured ? '#166534' : '#1e40af' }}>
                      {isMatured ? '🏁 Final Evaluation:' : '⏳ Observation Active:'} {audit.evaluation?.headline}
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                      Progress: Day {daysElapsed} of {windowDays} ({Math.max(0, windowDays - daysElapsed)} days remaining)
                    </div>
                  </div>
                </div>

                {/* Paired Metrics Comparison Matrix */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ backgroundColor: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Units Sold (Pre &rarr; Post)</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                      {audit.baselineMetrics?.totalUnitsSold || 0} &rarr; {audit.postMetrics?.totalUnitsSold || 0}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: (audit.evaluation?.deltaUnits || 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {(audit.evaluation?.deltaUnits || 0) >= 0 ? '+' : ''}{audit.evaluation?.deltaUnits || 0} units
                    </span>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Revenue (Pre &rarr; Post)</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                      {formatCurrency(audit.baselineMetrics?.totalRevenue)} &rarr; {formatCurrency(audit.postMetrics?.totalRevenue)}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: (audit.evaluation?.deltaRevenue || 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {(audit.evaluation?.deltaRevenue || 0) >= 0 ? '+' : ''}{formatCurrency(audit.evaluation?.deltaRevenue)}
                    </span>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Profit (Pre &rarr; Post)</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                      {audit.baselineMetrics?.grossProfit !== null ? formatCurrency(audit.baselineMetrics?.grossProfit) : 'N/A'} &rarr; {audit.postMetrics?.grossProfit !== null ? formatCurrency(audit.postMetrics?.grossProfit) : 'N/A'}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: (audit.evaluation?.deltaGrossProfit || 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {audit.evaluation?.deltaGrossProfit !== null ? `${(audit.evaluation?.deltaGrossProfit || 0) >= 0 ? '+' : ''}${formatCurrency(audit.evaluation?.deltaGrossProfit)}` : 'N/A'}
                    </span>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Capital Value Sold (COGS)</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                      {formatCurrency(audit.postMetrics?.totalCOGS)}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Wholesale cost of goods sold
                    </span>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Defensible ROI (%)</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: audit.evaluation?.roiPercent !== null ? 'var(--success)' : 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {audit.evaluation?.roiPercent !== null ? `${audit.evaluation?.roiPercent}%` : 'N/A'}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={audit.evaluation?.roiExplanation}>
                      {audit.evaluation?.roiExplanation || 'Zero capital outlay'}
                    </span>
                  </div>
                </div>

                {/* Specific Outcome Metrics Strip */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {audit.decisionType === 'inventory_restock' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <strong>Stockout Protection:</strong>{' '}
                      {audit.evaluation?.stockoutAverted === true ? (
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                          ✅ Averted (No stockout during window)
                        </span>
                      ) : audit.evaluation?.stockoutAverted === false &&
                        (Number(audit.postMetrics?.distinctTradingDays || 0) > 0 ||
                          Number(audit.postMetrics?.totalUnitsSold || 0) > 0 ||
                          Number(audit.postMetrics?.currentStock ?? 1) <= 0) ? (
                        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                          ❌ Not Averted (Stock reached 0)
                        </span>
                      ) : (
                        <span style={{ color: '#d97706', fontWeight: 700 }}>
                          ⏳ Pending (Awaiting post-decision trading data)
                        </span>
                      )}
                    </span>
                  )}

                  {audit.evaluation?.deadCapitalRecovered !== null && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <strong>Trapped Capital Recovered:</strong>{' '}
                      <span style={{ color: '#d97706', fontWeight: 700 }}>
                        {formatCurrency(audit.evaluation?.deadCapitalRecovered)}
                      </span>
                    </span>
                  )}

                  {(audit.implementedParameters?.purchaseOutlay ?? audit.implementedParameters?.capitalInvested) > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <strong>Purchase Outlay:</strong>{' '}
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                        {formatCurrency(audit.implementedParameters?.purchaseOutlay ?? audit.implementedParameters?.capitalInvested)}
                      </span>
                    </span>
                  )}
                </div>

                {/* Simulation vs Actual Comparison Strip (if linked to scenario) */}
                {audit.simulationComparison?.isLinked && (
                  <div
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.85rem 1rem',
                      marginBottom: '1rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        🧪 What-If Simulation vs. Real-World Calibration:
                      </span>
                      <span
                        style={{
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          backgroundColor: audit.simulationComparison.calibrationAssessment === 'aligned' ? '#dcfce7' : audit.simulationComparison.calibrationAssessment === 'overperformed' ? '#dbeafe' : '#fee2e2',
                          color: audit.simulationComparison.calibrationAssessment === 'aligned' ? '#166534' : audit.simulationComparison.calibrationAssessment === 'overperformed' ? '#1e40af' : '#991b1b',
                        }}
                      >
                        {audit.simulationComparison.calibrationAssessment === 'aligned' ? '🎯 Well-Calibrated (±15%)' : audit.simulationComparison.calibrationAssessment === 'overperformed' ? '🚀 Overperformed Simulation' : '📉 Underperformed Simulation'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {audit.simulationComparison.explanation}
                    </div>
                  </div>
                )}

                {/* Expandable Empirical Evidence Drawer */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: '1rem',
                      paddingTop: '1rem',
                      borderTop: '1px dashed var(--border)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.4rem 0' }}>
                          📅 Non-Overlapping Window Boundaries
                        </h4>
                        <div style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          • <strong>Pre-Window ({windowDays}D):</strong> {formatDate(audit.evidence?.windowConfig?.preStart || audit.baselineMetrics?.startDate)} to {formatDate(audit.evidence?.windowConfig?.preEnd || audit.baselineMetrics?.endDate)} ({audit.baselineMetrics?.distinctTradingDays || 0} active trading days)
                          <br />
                          • <strong>Implementation Day:</strong> {formatDate(audit.implementedAt)} (strictly excluded from calculation)
                          <br />
                          • <strong>Post-Window ({windowDays}D):</strong> {formatDate(audit.evidence?.windowConfig?.postStart)} to {formatDate(audit.evidence?.windowConfig?.postEnd)} ({audit.postMetrics?.distinctTradingDays || 0} active trading days)
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.4rem 0' }}>
                          📝 Implementation Notes & Parameters
                        </h4>
                        <div style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          {audit.implementationNotes ? audit.implementationNotes : 'No operational notes provided.'}
                          <br />
                          {audit.implementedParameters?.quantityOrdered > 0 && `• Order Qty: ${audit.implementedParameters.quantityOrdered} units`}
                          {(audit.implementedParameters?.unitCost ?? audit.implementedParameters?.costPrice) > 0 &&
                            ` | Unit Cost: ${formatCurrency(audit.implementedParameters?.unitCost ?? audit.implementedParameters?.costPrice)}`}
                          {(audit.implementedParameters?.purchaseOutlay ?? audit.implementedParameters?.capitalInvested) > 0 &&
                            ` | Purchase Outlay: ${formatCurrency(audit.implementedParameters?.purchaseOutlay ?? audit.implementedParameters?.capitalInvested)}`}
                          {audit.implementedParameters?.newPrice > 0 && ` | New Price: ${formatCurrency(audit.implementedParameters.newPrice)}`}
                        </div>
                      </div>
                    </div>

                    {/* Audit History Trail */}
                    {audit.auditHistory && audit.auditHistory.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Audit History Trail:</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                          {audit.auditHistory.map((h, i) => (
                            <span key={i} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              • {formatDate(h.performedAt)}: <strong>{h.action}</strong> — {h.notes}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Card Bottom Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={() => toggleExpand(audit._id)}
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
                    {isExpanded ? '▲ Hide Empirical Evidence' : '▼ View Empirical Evidence & Audit Trail'}
                  </button>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleRecalculate(audit._id)}
                      disabled={recalculatingId === audit._id}
                      style={{
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-main)',
                        padding: '0.35rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: recalculatingId === audit._id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {recalculatingId === audit._id ? 'Recalculating...' : '🔄 Recalculate'}
                    </button>

                    <button
                      onClick={() => handleDelete(audit._id)}
                      disabled={deletingId === audit._id}
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid #fca5a5',
                        color: '#dc2626',
                        padding: '0.35rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: deletingId === audit._id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {deletingId === audit._id ? 'Deleting...' : '🗑️ Delete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Implementation Modal */}
      {showImplementModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '2rem',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                🎯 Confirm Decision Implementation
              </h2>
              <button
                onClick={() => setShowImplementModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.45 }}>
              Confirming implementation registers the physical execution date (t_impl) and begins tracking real-world results over an empirical observation window.
            </p>

            {implementError && (
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.82rem' }}>
                {implementError}
              </div>
            )}

            <form onSubmit={handleSubmitImplementation}>
              {/* Decision Source Tabs */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Decision Origin:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {[
                    { id: 'recommendation', label: 'Accepted Recommendation' },
                    { id: 'scenario', label: 'What-If Scenario' },
                    { id: 'manual_action', label: 'Manual Store Action' },
                  ].map((src) => (
                    <button
                      type="button"
                      key={src.id}
                      onClick={() => setImplementSource(src.id)}
                      style={{
                        padding: '0.5rem',
                        fontSize: '0.78rem',
                        fontWeight: implementSource === src.id ? 700 : 500,
                        backgroundColor: implementSource === src.id ? 'var(--primary-light)' : 'var(--bg-main)',
                        color: implementSource === src.id ? 'var(--primary)' : 'var(--text-main)',
                        border: `1px solid ${implementSource === src.id ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source-specific Link Selectors */}
              {implementSource === 'recommendation' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Select Recommendation:
                  </label>
                  <select
                    value={selectedRecId}
                    onChange={(e) => handleRecommendationSelect(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                  >
                    <option value="">-- Choose recommendation to implement --</option>
                    {recommendationsList.map((r) => (
                      <option key={r._id} value={r._id}>
                        [{r.type}] {r.title} ({r.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {implementSource === 'scenario' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Select Saved What-If Scenario:
                  </label>
                  <select
                    value={selectedScenarioId}
                    onChange={(e) => handleScenarioSelect(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                  >
                    <option value="">-- Choose saved scenario --</option>
                    {scenariosList.map((s) => (
                      <option key={s._id} value={s._id}>
                        [{s.scenarioType}] {s.name} ({s.productName || 'General'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Product Selector */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                  Target Product (Optional for store-wide decisions):
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                >
                  <option value="">-- Store-Wide (No Single Product) --</option>
                  {productsList.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} (SKU: {p.sku} | Unit Cost: {formatCurrency(p.costPrice)} | Price: {formatCurrency(p.sellingPrice)} | Stock: {p.stockQuantity})
                    </option>
                  ))}
                </select>
              </div>

              {/* Title & Decision Type */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Decision Action Title:
                  </label>
                  <input
                    type="text"
                    required
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    placeholder="e.g. Restock Whole Milk - 40 units"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Decision Type:
                  </label>
                  <select
                    value={modalType}
                    onChange={(e) => setModalType(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                  >
                    <option value="inventory_restock">Inventory Restock</option>
                    <option value="clearance_markdown">Clearance Markdown</option>
                    <option value="price_optimization">Price Optimization</option>
                    <option value="promotional_discount">Promotional Discount</option>
                    <option value="demand_stabilization">Demand Stabilization</option>
                  </select>
                </div>
              </div>

              {/* Implementation Date & Observation Window */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Confirmed Implementation Date:
                  </label>
                  <input
                    type="date"
                    required
                    value={modalDate}
                    onChange={(e) => setModalDate(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Observation Period:
                  </label>
                  <select
                    value={modalWindow}
                    onChange={(e) => setModalWindow(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                  >
                    <option value="7">7 Days (Short Horizon)</option>
                    <option value="14">14 Days (Standard Window)</option>
                    <option value="30">30 Days (Extended Horizon)</option>
                  </select>
                </div>
              </div>

              {/* Quantitative Parameters */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                {modalType === 'inventory_restock' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      Quantity Ordered (units):
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={modalQuantity}
                      onChange={(e) => setModalQuantity(e.target.value)}
                      placeholder="e.g. 18"
                      style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Unit Wholesale Cost (₹ / unit):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={modalCostPrice}
                    onChange={(e) => setModalCostPrice(e.target.value)}
                    placeholder="e.g. 18.00"
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                  />
                </div>

                {modalType === 'inventory_restock' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      Total Purchase Outlay (₹):
                    </label>
                    <div
                      style={{
                        width: '100%',
                        padding: '0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px dashed var(--border)',
                        backgroundColor: '#f8fafc',
                        color: 'var(--text-main)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                      }}
                    >
                      {formatCurrency((Number(modalQuantity) || 0) * (Number(modalCostPrice) || 0))}
                    </div>
                  </div>
                )}

                {(modalType === 'price_optimization' || modalType === 'promotional_discount') && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      Applied Price (₹):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={modalNewPrice}
                      onChange={(e) => setModalNewPrice(e.target.value)}
                      placeholder="e.g. 4.50"
                      style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                  Operational Notes / Audit Details:
                </label>
                <textarea
                  rows="2"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="e.g. Purchase order PO#882 dispatched to supplier; goods arrived on store shelf."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowImplementModal(false)}
                  style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingImplement}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: submittingImplement ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submittingImplement ? 'Confirming...' : 'Confirm & Begin Tracking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DecisionAudit;
