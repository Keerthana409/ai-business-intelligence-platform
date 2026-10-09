import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import api from '../services/api';
import {
  runSimulation,
  saveScenario,
  getSavedScenarios,
  deleteScenario,
} from '../services/scenarioService';
import { formatCurrency, formatNumber } from '../utils/formatters';

const Scenarios = () => {
  // Scenario Selection State
  const [scenarioType, setScenarioType] = useState('price_change');
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Simulation Input States
  // Price Change
  const [proposedPrice, setProposedPrice] = useState('');
  const [demandMode, setDemandMode] = useState('constant');
  const [demandChangePercent, setDemandChangePercent] = useState('0');

  // Demand Shift
  const [demandShiftPercent, setDemandShiftPercent] = useState('15');
  const [simulationPeriodDays, setSimulationPeriodDays] = useState('30');

  // Inventory Reorder
  const [currentStockInput, setCurrentStockInput] = useState('');
  const [proposedOrderQuantity, setProposedOrderQuantity] = useState('50');
  const [leadTimeDays, setLeadTimeDays] = useState('7');
  const [safetyStockTarget, setSafetyStockTarget] = useState('10');

  // Discount
  const [discountPercent, setDiscountPercent] = useState('15');
  const [hypotheticalDemandBump, setHypotheticalDemandBump] = useState('0');

  // Execution States
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationError, setSimulationError] = useState(null);

  // Persistence States
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);

  // Fetch product catalog for selection
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const res = await api.get('/inventory');
      const list = res.data?.data?.products || [];
      setProducts(list);
      if (list.length > 0 && !selectedProductId) {
        setSelectedProductId(list[0]._id);
      }
    } catch (err) {
      console.error('Failed to load products for simulation:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, [selectedProductId]);

  // Fetch user's saved scenarios
  const fetchSavedScenarios = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const res = await getSavedScenarios();
      setSavedScenarios(res.data?.scenarios || []);
    } catch (err) {
      console.error('Failed to load saved scenarios:', err);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchSavedScenarios();
  }, [fetchProducts, fetchSavedScenarios]);

  // Sync default input values when selected product changes
  const selectedProduct = products.find((p) => p._id === selectedProductId) || null;

  useEffect(() => {
    if (selectedProduct) {
      setProposedPrice(selectedProduct.sellingPrice?.toString() || '');
      setCurrentStockInput(selectedProduct.stockQuantity?.toString() || '0');
      setLeadTimeDays(selectedProduct.leadTimeDays?.toString() || '7');
      setSafetyStockTarget(selectedProduct.reorderThreshold?.toString() || '10');
    }
  }, [selectedProductId, selectedProduct]);

  // Execute in-memory what-if simulation
  const handleRunSimulation = async (e) => {
    if (e) e.preventDefault();
    if (!selectedProductId && products.length > 0) return;

    setSimulating(true);
    setSimulationError(null);
    setSaveSuccessMsg(null);

    try {
      const payload = {
        scenarioType,
        productId: selectedProductId,
      };

      if (scenarioType === 'price_change') {
        payload.proposedPrice = Number(proposedPrice);
        payload.demandMode = demandMode;
        payload.demandChangePercent = Number(demandChangePercent);
      } else if (scenarioType === 'demand_change') {
        payload.demandChangePercent = Number(demandShiftPercent);
        payload.simulationPeriodDays = Number(simulationPeriodDays);
      } else if (scenarioType === 'inventory_reorder') {
        payload.currentStock = Number(currentStockInput);
        payload.proposedOrderQuantity = Number(proposedOrderQuantity);
        payload.leadTimeDays = Number(leadTimeDays);
        payload.safetyStockTarget = Number(safetyStockTarget);
      } else if (scenarioType === 'discount') {
        payload.discountPercent = Number(discountPercent);
        payload.hypotheticalDemandChangePercent = Number(hypotheticalDemandBump);
      }

      const res = await runSimulation(payload);
      setSimulationResult(res.data);
    } catch (err) {
      console.error('Simulation execution failed:', err);
      setSimulationError(
        err.response?.data?.message || err.message || 'Simulation execution encountered an error.'
      );
    } finally {
      setSimulating(false);
    }
  };

  // Save current simulation
  const handleSaveScenario = async (e) => {
    e.preventDefault();
    if (!simulationResult || !saveName.trim()) return;

    setSaving(true);
    try {
      await saveScenario({
        name: saveName.trim(),
        description: saveDescription.trim(),
        scenarioType: simulationResult.scenarioType,
        productId: simulationResult.product?.id,
        productName: simulationResult.product?.name,
        inputs: simulationResult.inputs,
        baselineResults: simulationResult.baseline || {},
        simulatedResults: simulationResult.simulated || {},
        comparison: simulationResult.comparison || {},
        timeline: simulationResult.timeline || null,
        profitMatch: simulationResult.profitMatch || null,
        assumptions: simulationResult.assumptions || [],
        limitations: simulationResult.limitations || [],
      });

      setShowSaveModal(false);
      setSaveName('');
      setSaveDescription('');
      setSaveSuccessMsg('Scenario saved successfully to your decision history.');
      await fetchSavedScenarios();
    } catch (err) {
      console.error('Failed to save scenario:', err);
      alert(err.response?.data?.message || 'Failed to save scenario.');
    } finally {
      setSaving(false);
    }
  };

  // Delete saved scenario
  const handleDeleteScenario = async (id) => {
    if (!window.confirm('Are you sure you want to delete this saved scenario?')) return;
    try {
      await deleteScenario(id);
      await fetchSavedScenarios();
    } catch (err) {
      console.error('Failed to delete scenario:', err);
      alert(err.response?.data?.message || 'Failed to delete scenario.');
    }
  };

  // Load a saved scenario snapshot into view
  const handleLoadScenario = (sc) => {
    setScenarioType(sc.scenarioType);
    if (sc.productId) {
      setSelectedProductId(sc.productId._id || sc.productId);
    }
    setSimulationResult({
      scenarioType: sc.scenarioType,
      product: {
        id: sc.productId?._id || sc.productId,
        name: sc.productName,
        sku: sc.productId?.sku,
        sellingPrice: sc.baselineResults?.sellingPrice,
        unitCost: sc.baselineResults?.unitCost,
        hasValidCost: sc.baselineResults?.grossProfit !== null,
      },
      inputs: sc.inputs,
      baseline: sc.baselineResults,
      simulated: sc.simulatedResults,
      comparison: sc.comparison,
      timeline: sc.timeline,
      profitMatch: sc.profitMatch,
      assumptions: sc.assumptions,
      limitations: sc.limitations,
      isSavedSnapshot: true,
      savedAt: sc.createdAt,
    });
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  // Helper to format percentage delta safely
  const formatDeltaPercent = (pct) => {
    if (pct === null || pct === undefined) return 'N/A (Baseline is 0)';
    return `${pct > 0 ? '+' : ''}${pct}%`;
  };

  // Prepare chart comparison dataset
  const getChartData = () => {
    if (!simulationResult) return [];

    if (scenarioType === 'inventory_reorder') {
      const t = simulationResult.timeline;
      return [
        {
          name: 'Current Shelf',
          Units: t.stockBeforeArrival,
        },
        {
          name: 'Lead-Time Demand',
          Units: t.leadTimeDemand !== null ? t.leadTimeDemand : 0,
        },
        {
          name: 'Post-Delivery Stock',
          Units: t.stockPostDeliveryAndDemand,
        },
        {
          name: 'Safety Buffer Target',
          Units: t.safetyStockTarget,
        },
      ];
    }

    const b = simulationResult.baseline || {};
    const s = simulationResult.simulated || {};

    return [
      {
        name: 'Revenue ($)',
        Baseline: b.revenue || 0,
        Simulated: s.revenue || 0,
      },
      {
        name: 'Gross Profit ($)',
        Baseline: b.grossProfit !== null ? b.grossProfit : 0,
        Simulated: s.grossProfit !== null ? s.grossProfit : 0,
      },
      {
        name: 'Volume (Units)',
        Baseline: b.quantitySold || 0,
        Simulated: s.quantitySold || 0,
      },
    ];
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.75rem' }}>🧪</span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              What-If Scenario Simulation Engine
            </h1>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, backgroundColor: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
              Module 7
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '850px', lineHeight: 1.5 }}>
            Model pricing adjustments, hypothetical demand shifts, supplier lead-time buffers, and promotional discounts without mutating catalog prices or stock records. Pure deterministic business arithmetic.
          </p>
        </div>

        <button
          onClick={() => setShowSaveModal(true)}
          disabled={!simulationResult}
          style={{
            backgroundColor: simulationResult ? 'var(--primary)' : 'var(--bg-card)',
            color: simulationResult ? '#fff' : 'var(--text-muted)',
            border: '1px solid var(--border)',
            padding: '0.6rem 1.15rem',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: simulationResult ? 'pointer' : 'not-allowed',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            boxShadow: simulationResult ? 'var(--shadow-sm)' : 'none',
          }}
        >
          💾 Save Current Scenario
        </button>
      </div>

      {saveSuccessMsg && (
        <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          ✓ {saveSuccessMsg}
        </div>
      )}

      {/* Scenario Type Selection Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'price_change', label: '🏷️ Price Change Simulation', desc: 'Price adjustments & constant/assumption demand' },
          { id: 'demand_change', label: '📈 Demand Shift Simulation', desc: 'Hypothetical sales volume increases or decreases' },
          { id: 'inventory_reorder', label: '📦 Inventory & Lead Time', desc: 'Replenishment order timing & transit depletion' },
          { id: 'discount', label: '🏷️ Discount & Profit Match', desc: 'Promotional markdowns & profit-neutral volume' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setScenarioType(tab.id);
              setSimulationResult(null);
              setSimulationError(null);
            }}
            style={{
              flex: '1 1 200px',
              textAlign: 'left',
              padding: '0.85rem 1rem',
              backgroundColor: scenarioType === tab.id ? 'var(--primary)' : 'var(--bg-card)',
              color: scenarioType === tab.id ? '#fff' : 'var(--text-main)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              boxShadow: scenarioType === tab.id ? 'var(--shadow-md)' : 'var(--shadow-sm)',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{tab.label}</div>
            <div style={{ fontSize: '0.75rem', opacity: scenarioType === tab.id ? 0.9 : 0.7, marginTop: '0.2rem' }}>
              {tab.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Main Interactive Workspace Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '1.5rem', alignItems: 'start', marginBottom: '2.5rem' }}>
        {/* Left Column: Input Form */}
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem', color: 'var(--text-main)' }}>
            Simulation Parameters
          </h2>

          <form onSubmit={handleRunSimulation}>
            {/* Product Selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
                Target Catalog Product
              </label>
              {loadingProducts ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading catalog products...</div>
              ) : products.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: '#b45309' }}>No products found in inventory.</div>
              ) : (
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                >
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.sku}) — ${p.sellingPrice?.toFixed(2)} [Stock: {p.stockQuantity}]
                    </option>
                  ))}
                </select>
              )}

              {selectedProduct && (
                <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                  <div>Catalog Price: <strong>${selectedProduct.sellingPrice?.toFixed(2)}</strong></div>
                  <div>Unit Cost: <strong>{selectedProduct.costPrice ? `$${selectedProduct.costPrice.toFixed(2)}` : 'N/A'}</strong></div>
                  <div>Current Stock: <strong>{selectedProduct.stockQuantity} units</strong></div>
                  <div>Lead Time: <strong>{selectedProduct.leadTimeDays || 7} days</strong></div>
                </div>
              )}
            </div>

            {/* Type-Specific Parameter Inputs */}
            {scenarioType === 'price_change' && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                    Proposed Selling Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={proposedPrice}
                    onChange={(e) => setProposedPrice(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                    Demand Response Assumption
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setDemandMode('constant')}
                      style={{
                        flex: 1,
                        padding: '0.4rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        backgroundColor: demandMode === 'constant' ? 'var(--primary)' : 'var(--bg-main)',
                        color: demandMode === 'constant' ? '#fff' : 'var(--text-main)',
                        cursor: 'pointer',
                      }}
                    >
                      Constant Demand
                    </button>
                    <button
                      type="button"
                      onClick={() => setDemandMode('assumption')}
                      style={{
                        flex: 1,
                        padding: '0.4rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        backgroundColor: demandMode === 'assumption' ? 'var(--primary)' : 'var(--bg-main)',
                        color: demandMode === 'assumption' ? '#fff' : 'var(--text-main)',
                        cursor: 'pointer',
                      }}
                    >
                      Assumption Mode
                    </button>
                  </div>

                  {demandMode === 'assumption' ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                        Hypothetical Volume Change (%):
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="-99"
                        value={demandChangePercent}
                        onChange={(e) => setDemandChangePercent(e.target.value)}
                        placeholder="e.g. -15 for 15% drop"
                        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                      />
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Volume remains fixed at baseline historical quantity.
                    </div>
                  )}
                </div>
              </>
            )}

            {scenarioType === 'demand_change' && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                    Demand Shift Percentage (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="-99"
                    required
                    value={demandShiftPercent}
                    onChange={(e) => setDemandShiftPercent(e.target.value)}
                    placeholder="e.g. +20 or -15"
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                    Positive value simulates surge; negative simulates slump.
                  </span>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                    Simulation Horizon (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={simulationPeriodDays}
                    onChange={(e) => setSimulationPeriodDays(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                  />
                </div>
              </>
            )}

            {scenarioType === 'inventory_reorder' && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                    Current Shelf Stock (Units)
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={currentStockInput}
                    onChange={(e) => setCurrentStockInput(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                    Proposed Reorder Batch (Units)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={proposedOrderQuantity}
                    onChange={(e) => setProposedOrderQuantity(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                      Lead Time (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={leadTimeDays}
                      onChange={(e) => setLeadTimeDays(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                      Safety Target (Units)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={safetyStockTarget}
                      onChange={(e) => setSafetyStockTarget(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                    />
                  </div>
                </div>
              </>
            )}

            {scenarioType === 'discount' && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                    Proposed Discount Percentage (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="99.9"
                    required
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    placeholder="e.g. 15 for 15% discount"
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                  />
                  {selectedProduct && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                      Discounted Price: $
                      {(
                        (selectedProduct.sellingPrice || 0) *
                        (1 - Number(discountPercent || 0) / 100)
                      ).toFixed(2)}
                    </span>
                  )}
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                    Hypothetical Volume Bump (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={hypotheticalDemandBump}
                    onChange={(e) => setHypotheticalDemandBump(e.target.value)}
                    placeholder="e.g. 25 for +25% units"
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                    Optional assumed customer volume response.
                  </span>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={simulating || products.length === 0}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: simulating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                marginTop: '0.5rem',
              }}
            >
              {simulating ? 'Computing Simulation...' : '▶️ Run What-If Simulation'}
            </button>
          </form>
        </div>

        {/* Right Column: Simulation Results & Analytics */}
        <div>
          {simulationError && (
            <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              ⚠️ <strong>Error:</strong> {simulationError}
            </div>
          )}

          {!simulationResult && !simulating && (
            <div style={{ backgroundColor: 'var(--bg-card)', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '3.5rem 2rem', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>🧪</span>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                Simulator Ready
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: '480px', margin: '0 auto' }}>
                Select a target product, adjust your hypothesis parameters on the left, and click <strong>Run What-If Simulation</strong> to evaluate financial and operational impacts.
              </p>
            </div>
          )}

          {simulating && (
            <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                Computing deterministic simulation models...
              </p>
              <p style={{ fontSize: '0.85rem' }}>Evaluating historical baselines and hypothetical projections.</p>
            </div>
          )}

          {simulationResult && !simulating && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Snapshot Disclosure Banner */}
              {simulationResult.isSavedSnapshot && (
                <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#1e40af' }}>
                  ℹ️ <strong>Saved Historical Snapshot:</strong> Viewing simulation recorded on {new Date(simulationResult.savedAt).toLocaleDateString()} without modifying live database states.
                </div>
              )}

              {/* KPI Comparison Cards (Revenue, Profit, Quantity) */}
              {scenarioType !== 'inventory_reorder' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  {/* Revenue Card */}
                  <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Projected Revenue
                    </span>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.3rem 0', color: 'var(--text-main)' }}>
                      {formatCurrency(simulationResult.simulated?.revenue || 0)}
                    </h3>
                    <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Baseline: {formatCurrency(simulationResult.baseline?.revenue || 0)}</span>
                      <strong style={{ color: (simulationResult.comparison?.revenue?.absolute || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                        {formatDeltaPercent(simulationResult.comparison?.revenue?.percentage)}
                      </strong>
                    </div>
                  </div>

                  {/* Gross Profit Card */}
                  <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Gross Profit Impact
                    </span>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.3rem 0', color: simulationResult.simulated?.grossProfit !== null ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {simulationResult.simulated?.grossProfit !== null ? formatCurrency(simulationResult.simulated.grossProfit) : 'Uncomputable'}
                    </h3>
                    <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Baseline: {simulationResult.baseline?.grossProfit !== null ? formatCurrency(simulationResult.baseline.grossProfit) : 'N/A'}
                      </span>
                      {simulationResult.comparison?.grossProfit?.percentage !== null && (
                        <strong style={{ color: (simulationResult.comparison?.grossProfit?.absolute || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                          {formatDeltaPercent(simulationResult.comparison?.grossProfit?.percentage)}
                        </strong>
                      )}
                    </div>
                  </div>

                  {/* Sales Volume Card */}
                  <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Sales Volume
                    </span>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.3rem 0', color: 'var(--text-main)' }}>
                      {formatNumber(simulationResult.simulated?.quantitySold || 0)} units
                    </h3>
                    <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Baseline: {formatNumber(simulationResult.baseline?.quantitySold || 0)} units</span>
                      <strong style={{ color: (simulationResult.comparison?.quantity?.absolute || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                        {formatDeltaPercent(simulationResult.comparison?.quantity?.percentage)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Inventory-Specific KPI Cards */}
              {scenarioType === 'inventory_reorder' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Post-Arrival Shelf Stock
                    </span>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.3rem 0', color: 'var(--primary)' }}>
                      {simulationResult.timeline?.stockPostDeliveryAndDemand} units
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      After transit depletion & delivery receipt
                    </span>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Estimated Order Outlay
                    </span>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.3rem 0', color: '#d97706' }}>
                      {simulationResult.financialImpact?.estimatedInvestment !== null ? formatCurrency(simulationResult.financialImpact.estimatedInvestment) : 'N/A'}
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {simulationResult.inputs?.proposedOrderQuantity} units @ {simulationResult.financialImpact?.unitCost ? `$${simulationResult.financialImpact.unitCost.toFixed(2)}` : 'N/A'}
                    </span>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Pre-Receipt Stockout Exposure
                    </span>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.3rem 0', color: simulationResult.timeline?.isStockoutBeforeArrival ? '#dc2626' : '#16a34a' }}>
                      {simulationResult.timeline?.isStockoutBeforeArrival === null
                        ? 'Unmodeled'
                        : simulationResult.timeline.isStockoutBeforeArrival
                        ? `🚨 ${simulationResult.timeline.preReceiptStockoutUnits} units gap`
                        : '✓ Sufficient'}
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {simulationResult.timeline?.isStockoutBeforeArrival ? 'Shelf depletes before arrival' : 'Stock satisfies lead demand'}
                    </span>
                  </div>
                </div>
              )}

              {/* Discount Profit-Matching Analysis Box */}
              {scenarioType === 'discount' && simulationResult.profitMatch && (
                <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '1.15rem' }}>🎯</span>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Baseline Profit-Neutral Sales Volume
                    </h3>
                  </div>

                  {simulationResult.profitMatch.isMarginZeroOrNegative && (
                    <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.85rem', fontSize: '0.8rem' }}>
                      ⚠️ <strong>Zero/Negative Contribution Margin:</strong> Discounted price ($
                      {simulationResult.simulated?.sellingPrice?.toFixed(2)}) is at or below unit cost ($
                      {simulationResult.simulated?.unitCost?.toFixed(2)}). Selling additional units will not recover profit.
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Discounted Unit Margin:</span>
                      <strong style={{ fontSize: '1.1rem', color: (simulationResult.profitMatch.discountedUnitMargin || 0) > 0 ? 'var(--text-main)' : '#dc2626' }}>
                        {simulationResult.profitMatch.discountedUnitMargin !== null ? formatCurrency(simulationResult.profitMatch.discountedUnitMargin) : 'N/A'}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Profit-Matching Quantity:</span>
                      <strong style={{ fontSize: '1.1rem', color: simulationResult.profitMatch.profitMatchQuantity !== null ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {simulationResult.profitMatch.profitMatchQuantity !== null ? `${formatNumber(simulationResult.profitMatch.profitMatchQuantity)} units` : 'Not Applicable'}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Required Volume Lift:</span>
                      <strong style={{ fontSize: '1.1rem', color: (simulationResult.profitMatch.pctVolumeIncreaseNeeded || 0) > 0 ? '#d97706' : 'var(--text-muted)' }}>
                        {formatDeltaPercent(simulationResult.profitMatch.pctVolumeIncreaseNeeded)}
                      </strong>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                    {simulationResult.profitMatch.explanation}
                  </p>
                </div>
              )}

              {/* Comparative Chart Visualization */}
              <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-main)' }}>
                  {scenarioType === 'inventory_reorder' ? 'Chronological Inventory Timeline' : 'Comparative Impact: Baseline vs. Simulated'}
                </h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={getChartData()} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                      <Tooltip />
                      <Legend />
                      {scenarioType === 'inventory_reorder' ? (
                        <Bar dataKey="Units" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      ) : (
                        <>
                          <Bar dataKey="Baseline" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Simulated" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                        </>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Assumptions & Limitations Box */}
              <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  Transparent Model Assumptions & Notes
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {simulationResult.assumptions?.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                  {simulationResult.limitations?.map((l, i) => (
                    <li key={`lim-${i}`} style={{ color: '#b45309', fontWeight: 600 }}>
                      ℹ️ {l}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Saved Scenarios History Drawer / List */}
      <section style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Saved Simulation Archive
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Historical scenario snapshots saved for retailer reference
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            {savedScenarios.length} {savedScenarios.length === 1 ? 'Snapshot' : 'Snapshots'}
          </span>
        </div>

        {loadingSaved ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading saved simulation history...
          </div>
        ) : savedScenarios.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
            No saved scenarios found. Run a simulation above and click <strong>Save Current Scenario</strong> to record decisions.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {savedScenarios.map((sc) => (
              <div
                key={sc._id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', backgroundColor: '#e2e8f0', color: '#334155', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                      {sc.scenarioType.replace('_', ' ')}
                    </span>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{sc.name}</strong>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Product: <strong>{sc.productName || sc.productId?.name || 'Catalog Item'}</strong> • Saved: {new Date(sc.createdAt).toLocaleDateString()}
                    {sc.description && ` — ${sc.description}`}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    onClick={() => handleLoadScenario(sc)}
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--primary)',
                      padding: '0.35rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🔍 Inspect Snapshot
                  </button>
                  <button
                    onClick={() => handleDeleteScenario(sc._id)}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #fca5a5',
                      color: '#dc2626',
                      padding: '0.35rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Save Scenario Modal */}
      {showSaveModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', maxWidth: '500px', width: '100%', padding: '1.75rem', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
              Save Scenario Snapshot
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Record this simulation into your saved platform history.
            </p>

            <form onSubmit={handleSaveScenario}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                  Scenario Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q4 Price Increase on Milk"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
                  Strategic Rationale / Notes
                </label>
                <textarea
                  rows="3"
                  placeholder="Briefly describe the rationale or context for this hypothesis..."
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !saveName.trim()}
                  style={{ backgroundColor: 'var(--primary)', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? 'Saving...' : 'Confirm & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scenarios;
