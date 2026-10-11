import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSales, createSale, updateSale, deleteSale } from '../services/salesService';
import { getProducts } from '../services/inventoryService';
import { formatCurrency, formatDate, formatNumber } from '../utils/formatters';

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [modalForm, setModalForm] = useState({
    productId: '',
    productName: '',
    quantitySold: '1',
    unitPrice: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiMessage, setApiMessage] = useState({ type: '', text: '' });

  // Delete Confirmation
  const [deletingSale, setDeletingSale] = useState(null);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await getSales(params);
      setSales(res.data?.sales || []);
    } catch (err) {
      console.error('Fetch sales error:', err);
      setApiMessage({ type: 'error', text: 'Failed to retrieve sales records' });
    } finally {
      setLoading(false);
    }
  };

  const fetchProductsList = async () => {
    try {
      const res = await getProducts();
      setProducts(res.data?.products || []);
    } catch (err) {
      console.error('Fetch products for sales dropdown error:', err);
    }
  };

  useEffect(() => {
    fetchSales();
    fetchProductsList();
  }, [startDate, endDate]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchSales();
  };

  const openAddModal = () => {
    setEditingSale(null);
    setModalForm({
      productId: '',
      productName: '',
      quantitySold: '1',
      unitPrice: '',
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'cash',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (sale) => {
    setEditingSale(sale);
    setModalForm({
      productId: sale.productId || '',
      productName: sale.productName,
      quantitySold: sale.quantitySold.toString(),
      unitPrice: sale.unitPrice.toString(),
      date: new Date(sale.date).toISOString().split('T')[0],
      paymentMethod: sale.paymentMethod || 'cash',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // When a product is selected from dropdown, autofill unitPrice with sellingPrice
  const handleProductSelect = (e) => {
    const selectedId = e.target.value;
    if (!selectedId) {
      setModalForm((prev) => ({ ...prev, productId: '' }));
      return;
    }
    const prod = products.find((p) => p._id === selectedId);
    if (prod) {
      setModalForm((prev) => ({
        ...prev,
        productId: prod._id,
        productName: prod.name,
        unitPrice: prod.sellingPrice.toString(),
      }));
    }
  };

  const calculatedTotal =
    Number(modalForm.quantitySold) > 0 && Number(modalForm.unitPrice) >= 0
      ? (Number(modalForm.quantitySold) * Number(modalForm.unitPrice)).toFixed(2)
      : '0.00';

  const validateModal = () => {
    const errs = {};
    if (!modalForm.productName.trim()) {
      errs.productName = 'Product name is required';
    }
    const qty = Number(modalForm.quantitySold);
    if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      errs.quantitySold = 'Quantity must be a positive integer (at least 1)';
    }
    const price = Number(modalForm.unitPrice);
    if (isNaN(price) || price < 0) {
      errs.unitPrice = 'Unit price must be a valid non-negative number';
    }
    if (!modalForm.date) {
      errs.date = 'Sale date is required';
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
        productName: modalForm.productName.trim(),
        productId: modalForm.productId || undefined,
        quantitySold: Math.floor(Number(modalForm.quantitySold)),
        unitPrice: Number(modalForm.unitPrice),
        date: new Date(modalForm.date),
        paymentMethod: modalForm.paymentMethod,
      };

      if (editingSale) {
        await updateSale(editingSale._id, payload);
        setApiMessage({ type: 'success', text: 'Sale record updated successfully!' });
      } else {
        await createSale(payload);
        setApiMessage({ type: 'success', text: 'Sale recorded and inventory stock updated!' });
      }

      setIsModalOpen(false);
      fetchSales();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save sales record';
      setFormErrors((prev) => ({ ...prev, api: msg }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSale) return;
    try {
      await deleteSale(deletingSale._id);
      setApiMessage({ type: 'success', text: 'Sale record deleted and inventory stock restored.' });
      setDeletingSale(null);
      fetchSales();
    } catch (err) {
      setApiMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete sale' });
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Sales Transactions
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Record customer transactions, compute revenues, and synchronize inventory
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
            <span>Upload Sales CSV</span>
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
            <span>Record Sale</span>
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

      {/* Filters Bar */}
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
        justifyContent: 'space-between',
      }}>
        {/* Search */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: '1 1 280px' }}>
          <input
            type="text"
            placeholder="Search by product name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input"
            style={{ padding: '0.5rem 0.85rem' }}
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
            Filter
          </button>
        </form>

        {/* Date Range Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
            />
          </div>
          {(startDate || endDate || search) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearch('');
              }}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Sales Table */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
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
              animation: 'spin 0.8s linear infinite',
            }}></div>
            <p>Loading sales records...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : sales.length === 0 ? (
          <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>💳</span>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              No sales records found
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
              {search || startDate || endDate
                ? 'No transactions matched the selected date range or product filter.'
                : 'Start recording your retail sales manually or upload a batch sales CSV dataset.'}
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
                + Record Sale
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
                Upload Sales CSV
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)' }}>Date</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)' }}>Product Name</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Unit Price</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Total Revenue</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)' }}>Payment</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr
                    key={s._id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>
                      {formatDate(s.date)}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {s.productName}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-main)' }}>
                      {formatNumber(s.quantitySold)}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {formatCurrency(s.unitPrice)}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                      {formatCurrency(s.totalRevenue)}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span style={{
                        textTransform: 'uppercase',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--primary-light)',
                        color: 'var(--primary)',
                      }}>
                        {s.paymentMethod || 'cash'}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => openEditModal(s)}
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
                        onClick={() => setDeletingSale(s)}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Sale Modal */}
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
            maxWidth: '500px',
            padding: '2rem',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {editingSale ? 'Edit Sale Record' : 'Record New Sale'}
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
              {/* Product Selector / Name */}
              {!editingSale && products.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Select from Existing Inventory (Optional)</label>
                  <select
                    value={modalForm.productId}
                    onChange={handleProductSelect}
                    className="form-select"
                  >
                    <option value="">-- Or enter product name manually below --</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} ({p.sku}) — Stock: {p.stockQuantity} {p.unit}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Product Name *</label>
                <input
                  type="text"
                  value={modalForm.productName}
                  onChange={(e) => setModalForm({ ...modalForm, productName: e.target.value })}
                  className={`form-input ${formErrors.productName ? 'has-error' : ''}`}
                  placeholder="e.g. Cotton T-Shirt Blue"
                />
                {formErrors.productName && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.productName}</span>}
              </div>

              <div className="form-row">
                <div>
                  <label className="form-label">Quantity Sold *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={modalForm.quantitySold}
                    onChange={(e) => setModalForm({ ...modalForm, quantitySold: e.target.value })}
                    className={`form-input ${formErrors.quantitySold ? 'has-error' : ''}`}
                    placeholder="1"
                  />
                  {formErrors.quantitySold && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.quantitySold}</span>}
                </div>
                <div>
                  <label className="form-label">Unit Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={modalForm.unitPrice}
                    onChange={(e) => setModalForm({ ...modalForm, unitPrice: e.target.value })}
                    className={`form-input ${formErrors.unitPrice ? 'has-error' : ''}`}
                    placeholder="25.00"
                  />
                  {formErrors.unitPrice && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.unitPrice}</span>}
                </div>
              </div>

              {/* Calculated Total Revenue Indicator */}
              <div style={{
                backgroundColor: 'var(--primary-light)',
                border: '1px solid #bfdbfe',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem 1rem',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                  Calculated Total Revenue:
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)' }}>
                  ₹{calculatedTotal}
                </span>
              </div>

              <div className="form-row" style={{ marginBottom: '1.5rem' }}>
                <div>
                  <label className="form-label">Sale Date *</label>
                  <input
                    type="date"
                    value={modalForm.date}
                    onChange={(e) => setModalForm({ ...modalForm, date: e.target.value })}
                    className={`form-input ${formErrors.date ? 'has-error' : ''}`}
                  />
                  {formErrors.date && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{formErrors.date}</span>}
                </div>
                <div>
                  <label className="form-label">Payment Method</label>
                  <select
                    value={modalForm.paymentMethod}
                    onChange={(e) => setModalForm({ ...modalForm, paymentMethod: e.target.value })}
                    className="form-select"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card / POS</option>
                    <option value="upi">UPI / Mobile Pay</option>
                    <option value="credit">Store Credit</option>
                    <option value="other">Other</option>
                  </select>
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
                  {submitting ? 'Recording...' : editingSale ? 'Save Changes' : 'Confirm Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSale && (
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
              Delete Sale Record?
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Are you sure you want to delete the sale of <strong>{deletingSale.quantitySold}x {deletingSale.productName}</strong> ({formatCurrency(deletingSale.totalRevenue)})? If this product is in inventory, stock will be automatically restored.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => setDeletingSale(null)}
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

export default Sales;
