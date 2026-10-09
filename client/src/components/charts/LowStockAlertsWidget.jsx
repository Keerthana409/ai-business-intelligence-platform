import React from 'react';
import { Link } from 'react-router-dom';
import ChartCard from './ChartCard';
import { formatNumber } from '../../utils/formatters';

const LowStockAlertsWidget = ({ data = [], loading = false, error = null }) => {
  const getBadgeStyle = (status) => {
    switch (status) {
      case 'Out of Stock':
        return {
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          border: '1px solid #fca5a5',
        };
      case 'Critical':
        return {
          backgroundColor: '#ffedd5',
          color: '#c2410c',
          border: '1px solid #fdba74',
        };
      case 'Low Stock':
      default:
        return {
          backgroundColor: '#fef3c7',
          color: '#b45309',
          border: '1px solid #fde68a',
        };
    }
  };

  const emptySuccessState = (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        backgroundColor: '#f0fdf4',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid #bbf7d0',
      }}
    >
      <span style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</span>
      <h4 style={{ color: '#166534', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.35rem' }}>
        Optimal Stock Health
      </h4>
      <p style={{ color: '#15803d', fontSize: '0.85rem', maxWidth: '360px', lineHeight: 1.45 }}>
        All products in your catalog currently meet or exceed their configured reorder thresholds. No immediate restock orders required.
      </p>
      <Link
        to="/inventory"
        style={{
          marginTop: '1rem',
          display: 'inline-block',
          backgroundColor: '#166534',
          color: '#ffffff',
          padding: '0.45rem 1rem',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        View Full Inventory
      </Link>
    </div>
  );

  return (
    <ChartCard
      title="Restock Priority & Low-Stock Alerts"
      subtitle="Evaluated using each product's specific threshold. Distinguishes out-of-stock from low-stock items."
      loading={loading}
      error={error}
      empty={false} // Custom empty handled below
      style={{ minHeight: '380px' }}
    >
      {!data || data.length === 0 ? (
        emptySuccessState
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem 0.75rem',
              backgroundColor: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              color: '#9f1239',
              fontWeight: 600,
            }}
          >
            <span>⚠️ {data.length} item(s) require purchasing attention</span>
            <Link
              to="/inventory"
              style={{
                color: 'var(--primary)',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            >
              Update Quantities &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '280px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {data.map((item) => {
              const badge = getBadgeStyle(item.status);
              const percentage = item.reorderThreshold > 0
                ? Math.min(100, Math.round((item.stockQuantity / item.reorderThreshold) * 100))
                : 0;

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: item.isOutOfStock ? '#fffafb' : '#fafbfc',
                    border: `1.5px solid ${item.isOutOfStock ? '#fca5a5' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  {/* Top line: Name + Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                        {item.name}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                        SKU: {item.sku}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '9999px',
                        ...badge,
                      }}
                    >
                      {item.status}
                    </span>
                  </div>

                  {/* Stock bar comparison */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                      <span style={{ color: item.isOutOfStock ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>
                        Current: {formatNumber(item.stockQuantity)} / Threshold: {formatNumber(item.reorderThreshold)} {item.unit}
                      </span>
                      <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                        Deficit: -{formatNumber(item.deficit)} {item.unit}
                      </span>
                    </div>

                    {/* Progress track */}
                    <div
                      style={{
                        width: '100%',
                        height: '6px',
                        backgroundColor: '#e2e8f0',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${percentage}%`,
                          height: '100%',
                          backgroundColor: item.isOutOfStock
                            ? '#ef4444'
                            : item.status === 'Critical'
                            ? '#f97316'
                            : '#f59e0b',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Suggested restock & lead time */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: '0.4rem',
                    }}
                  >
                    <span>
                      Suggested Order: <strong style={{ color: 'var(--text-main)' }}>+{formatNumber(item.suggestedRestock)} {item.unit}</strong>
                    </span>
                    <span>
                      Est. Lead Time: {item.leadTimeDays}d
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ChartCard>
  );
};

export default LowStockAlertsWidget;
