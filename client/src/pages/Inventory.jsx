import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../services/inventoryService';
import { formatCurrency, formatNumber } from '../utils/formatters';

const Inventory = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [lowStockFilter, setLowStockFilter] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [modalForm, setModalForm] = useState({
    name: '',
    sku: '',
    category: 'General',
    costPrice: '',
    sellingPrice: '',
    stockQuantity: '',
    reorderThreshold: '10',
    leadTimeDays: '7',
    unit: 'pcs',
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiMessage, setApiMessage] = useState({ type: '', text: '' });

  // Delete confirmation
  const [deletingProduct, setDeletingProduct] = useState(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (category !== 'all') params.category = category;
      if (lowStockFilter) params.lowStock = 'true';

      const res = await getProducts(params);
      setProducts(res.data?.products || []);
    } catch (err) {
      console.error('Fetch products error:', err);
      setApiMessage({ type: 'error', text: 'Failed to load inventory records' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [category, lowStockFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchProducts();
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setModalForm({
      name: '',
      sku: '',
      category: 'General',
      costPrice: '',
      sellingPrice: '',
      stockQuantity: '0',
      reorderThreshold: '10',
      leadTimeDays: '7',
      unit: 'pcs',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (p) => {
    setEditingProduct(p);
    setModalForm({
      name: p.name,
      sku: p.sku,
      category: p.category || 'General',
      costPrice: p.costPrice.toString(),
      sellingPrice: p.sellingPrice.toString(),
      stockQuantity: p.stockQuantity.toString(),
      reorderThreshold: p.reorderThreshold.toString(),
      leadTimeDays: (p.leadTimeDays ?? 7).toString(),
      unit: p.unit || 'pcs',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const validateModal = () => {
    const errs = {};
    if (!modalForm.name.trim()) errs.name = 'Product name is required';
    if (!modalForm.sku.trim()) errs.sku = 'SKU is required';
    if (!modalForm.costPrice || isNaN(Number(modalForm.costPrice)) || Number(modalForm.costPrice) < 0) {
      errs.costPrice = 'Valid non-negative cost price required';
    }
    if (!modalForm.sellingPrice || isNaN(Number(modalForm.sellingPrice)) || Number(modalForm.sellingPrice) < 0) {
      errs.sellingPrice = 'Valid non-negative selling price required';
    }
    if (modalForm.stockQuantity === '' || isNaN(Number(modalForm.stockQuantity)) || Number(modalForm.stockQuantity) < 0) {
      errs.stockQuantity = 'Valid stock quantity required (0 or greater)';
    }
    if (modalForm.reorderThreshold === '' || isNaN(Number(modalForm.reorderThreshold)) || Number(modalForm.reorderThreshold) < 0) {
      errs.reorderThreshold = 'Valid reorder threshold required';
    }
    if (
      modalForm.leadTimeDays !== '' &&
      (isNaN(Number(modalForm.leadTimeDays)) || Number(modalForm.leadTimeDays) < 1)
    ) {
      errs.leadTimeDays = 'Supplier lead time must be at least 1 day';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!validateModal()) return;

    setSubmitting(true);
    setApiMessage({ type: '', text: '' });
    try {
      const payload = {
        name: modalForm.name.trim(),
        sku: modalForm.sku.trim(),
        category: modalForm.category.trim(),
        costPrice: Number(modalForm.costPrice),
        sellingPrice: Number(modalForm.sellingPrice),
        stockQuantity: Math.floor(Number(modalForm.stockQuantity)),
        reorderThreshold: Math.floor(Number(modalForm.reorderThreshold)),
        leadTimeDays:
          modalForm.leadTimeDays !== ''
            ? Math.max(1, Math.round(Number(modalForm.leadTimeDays)))
            : 7,
        unit: modalForm.unit.trim() || 'pcs',
      };

      if (editingProduct) {
        await updateProduct(editingProduct._id, payload);
        setApiMessage({ type: 'success', text: `Product '${payload.name}' updated successfully!` });
      } else {
        await createProduct(payload);
        setApiMessage({ type: 'success', text: `Product '${payload.name}' added successfully!` });
      }

      setIsModalOpen(false);
      fetchProducts();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save product';
      setFormErrors((prev) => ({ ...prev, api: msg }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingProduct) return;
    try {
      await deleteProduct(deletingProduct._id);
      setApiMessage({ type: 'success', text: `Product '${deletingProduct.name}' removed from inventory.` });
      setDeletingProduct(null);
      fetchProducts();
    } catch (err) {
      setApiMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete product' });
    }
  };

  // Distinct categories in the loaded list for quick filter
  const categoriesList = Array.from(new Set(products.map((p) => p.category))).filter(Boolean);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Inventory Management
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Track shelf stock levels, SKU identifiers, cost prices, and reorder alerts
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link
            to="/upload"
            style={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
              border: '1px solid var(--border)',
              padding: '0.6rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>📥</span>
            <span>Upload CSV</span>
          </Link>
          <button
            onClick={openAddModal}
            style={{
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              padding: '0.6rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span>+</span>
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {apiMessage.text && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
          backgroundColor: apiMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: apiMessage.type === 'success' ? '#166534' : '#991b1b',
          border: `1px solid ${apiMessage.type === 'success' ? '#86efac' : '#fca5a5'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{apiMessage.text}</span>
          <button
            onClick={() => setApiMessage({ type: '', text: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: '1 1 300px' }}>
          <input
            type="text"
            placeholder="Search by product name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input"
            style={{
              padding: '0.5rem 0.85rem',
              color: '#0f172a',
              backgroundColor: '#ffffff',
            }}
          />
          <button
            type="submit"
            style={{
              backgroundColor: 'var(--primary)',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Search
          </button>
        </form>

        {/* Category & Low Stock Filter */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Category:</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="form-select"
              style={{
                padding: '0.45rem 0.75rem',
                width: 'auto',
                color: '#0f172a',
                backgroundColor: '#ffffff',
              }}
            >
              <option value="all">All Categories</option>
              {categoriesList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
            <input
              type="checkbox"
              checked={lowStockFilter}
              onChange={(e) => setLowStockFilter(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--danger)' }}
            />
            <span style={{ color: lowStockFilter ? 'var(--danger)' : 'var(--text-main)' }}>
              ⚠️ Low Stock Only
            </span>
          </label>
        </div>
      </div>

      {/* Products Table */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{
              width: '32px',
              height: '32px',
              border: '3px solid var(--border)',
              borderTopColor: 'var(--primary)',
              borderRadius: '50%',
              margin: '0 auto 1rem',
              animation: 'spin 0.8s linear infinite'
            }}></div>
            <p>Loading inventory...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : products.length === 0 ? (
          <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>📦</span>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              No inventory products found
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
              {search || category !== 'all' || lowStockFilter
                ? 'Try adjusting your search criteria or clear the filters.'
                : 'Your catalog is currently empty. Add your first item manually or upload an inventory CSV.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={openAddModal}
                style={{
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  padding: '0.55rem 1.25rem',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                + Add Product
              </button>
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
                Upload CSV
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)' }}>SKU</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)' }}>Product Name</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)' }}>Category</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Cost</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Selling Price</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Stock</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Lead Time</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const isLowStock = p.stockQuantity <= p.reorderThreshold;
                  return (
                    <tr
                      key={p._id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: isLowStock ? '#fffbeb' : 'transparent',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>
                        {p.sku}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        {p.name}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>
                        <span style={{
                          backgroundColor: 'var(--primary-light)',
                          color: 'var(--primary)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}>
                          {p.category}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {formatCurrency(p.costPrice)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-main)' }}>
                        {formatCurrency(p.sellingPrice)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700, color: isLowStock ? 'var(--danger)' : 'var(--text-main)' }}>
                        {formatNumber(p.stockQuantity)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>{p.unit}</span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {p.leadTimeDays ?? 7}d
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {isLowStock ? (
                          <span style={{
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}>
                            ⚠️ Low (&le;{p.reorderThreshold})
                          </span>
                        ) : (
                          <span style={{
                            backgroundColor: '#dcfce7',
                            color: '#166534',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}>
                            ✓ In Stock
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <button
                          onClick={() => openEditModal(p)}
                          style={{
                            background: 'none',
                            border: '1px solid var(--border)',
                            color: 'var(--primary)',
                            padding: '0.25rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            marginRight: '0.4rem',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingProduct(p)}
                          style={{
                            background: 'none',
                            border: '1px solid var(--border)',
                            color: 'var(--danger)',
                            padding: '0.25rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '520px',
            padding: '2rem',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            {formErrors.api && (
              <div style={{
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                padding: '0.6rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}>
                {formErrors.api}
              </div>
            )}

            <form onSubmit={handleModalSubmit} noValidate>
              <div className="form-row">
                <div>
                  <label className="form-label">Product Name *</label>
                  <input
                    type="text"
                    value={modalForm.name}
                    onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                    className={`form-input ${formErrors.name ? 'has-error' : ''}`}
                    placeholder="e.g. Organic Milk 1L"
                  />
                  {formErrors.name && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.name}</span>}
                </div>
                <div>
                  <label className="form-label">SKU / Code *</label>
                  <input
                    type="text"
                    value={modalForm.sku}
                    onChange={(e) => setModalForm({ ...modalForm, sku: e.target.value })}
                    className={`form-input ${formErrors.sku ? 'has-error' : ''}`}
                    placeholder="e.g. MLK-001"
                  />
                  {formErrors.sku && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.sku}</span>}
                </div>
              </div>

              <div className="form-row">
                <div>
                  <label className="form-label">Category *</label>
                  <input
                    type="text"
                    value={modalForm.category}
                    onChange={(e) => setModalForm({ ...modalForm, category: e.target.value })}
                    className="form-input"
                    placeholder="e.g. Grocery, Clothing, Bakery"
                  />
                </div>
                <div>
                  <label className="form-label">Unit of Measure</label>
                  <input
                    type="text"
                    value={modalForm.unit}
                    onChange={(e) => setModalForm({ ...modalForm, unit: e.target.value })}
                    className="form-input"
                    placeholder="pcs, kg, liters, box"
                  />
                </div>
              </div>

              <div className="form-row">
                <div>
                  <label className="form-label">Cost Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={modalForm.costPrice}
                    onChange={(e) => setModalForm({ ...modalForm, costPrice: e.target.value })}
                    className={`form-input ${formErrors.costPrice ? 'has-error' : ''}`}
                    placeholder="10.00"
                  />
                  {formErrors.costPrice && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.costPrice}</span>}
                </div>
                <div>
                  <label className="form-label">Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={modalForm.sellingPrice}
                    onChange={(e) => setModalForm({ ...modalForm, sellingPrice: e.target.value })}
                    className={`form-input ${formErrors.sellingPrice ? 'has-error' : ''}`}
                    placeholder="15.99"
                  />
                  {formErrors.sellingPrice && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.sellingPrice}</span>}
                </div>
              </div>

              <div className="form-row">
                <div>
                  <label className="form-label">Current Stock *</label>
                  <input
                    type="number"
                    min="0"
                    value={modalForm.stockQuantity}
                    onChange={(e) => setModalForm({ ...modalForm, stockQuantity: e.target.value })}
                    className={`form-input ${formErrors.stockQuantity ? 'has-error' : ''}`}
                    placeholder="50"
                  />
                  {formErrors.stockQuantity && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.stockQuantity}</span>}
                </div>
                <div>
                  <label className="form-label">Reorder Alert Threshold *</label>
                  <input
                    type="number"
                    min="0"
                    value={modalForm.reorderThreshold}
                    onChange={(e) => setModalForm({ ...modalForm, reorderThreshold: e.target.value })}
                    className={`form-input ${formErrors.reorderThreshold ? 'has-error' : ''}`}
                    placeholder="10"
                  />
                  {formErrors.reorderThreshold && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.reorderThreshold}</span>}
                </div>
              </div>

              <div className="form-row" style={{ marginBottom: '1.5rem' }}>
                <div>
                  <label className="form-label">Supplier Lead Time (Days) *</label>
                  <input
                    type="number"
                    min="1"
                    value={modalForm.leadTimeDays}
                    onChange={(e) => setModalForm({ ...modalForm, leadTimeDays: e.target.value })}
                    className={`form-input ${formErrors.leadTimeDays ? 'has-error' : ''}`}
                    placeholder="7"
                  />
                  {formErrors.leadTimeDays && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.leadTimeDays}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border)',
                    padding: '0.6rem 1.25rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: 'var(--text-main)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    backgroundColor: 'var(--primary)',
                    color: '#fff',
                    border: 'none',
                    padding: '0.6rem 1.4rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Saving...' : editingProduct ? 'Save Changes' : 'Add to Inventory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '420px',
            padding: '2rem',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border)',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>🗑️</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              Delete Product?
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{deletingProduct.name}</strong> (SKU: {deletingProduct.sku})? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => setDeletingProduct(null)}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border)',
                  padding: '0.6rem 1.25rem',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  backgroundColor: 'var(--danger)',
                  color: '#fff',
                  border: 'none',
                  padding: '0.6rem 1.4rem',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
