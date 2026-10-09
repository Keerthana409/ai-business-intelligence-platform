import React from 'react';

const ChartCard = ({
  title,
  subtitle,
  actions,
  loading = false,
  error = null,
  empty = false,
  emptyMessage = 'No data recorded for this visual.',
  emptyAction = null,
  children,
  style = {},
}) => {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '380px',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <h3
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.825rem',
                marginTop: '0.2rem',
                lineHeight: 1.4,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {actions}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid var(--border)',
                borderTopColor: 'var(--primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span style={{ fontSize: '0.875rem' }}>Aggregating MongoDB data...</span>
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        ) : error ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--danger)',
              textAlign: 'center',
              padding: '1rem',
            }}
          >
            <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</span>
            <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Unable to load chart data</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {error}
            </p>
          </div>
        ) : empty ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: '1.5rem',
              backgroundColor: '#fafbfc',
              borderRadius: 'var(--radius-sm)',
              border: '1px dashed var(--border)',
            }}
          >
            <span style={{ fontSize: '2.2rem', marginBottom: '0.5rem', opacity: 0.8 }}>
              📊
            </span>
            <p
              style={{
                fontWeight: 600,
                color: 'var(--text-main)',
                fontSize: '0.95rem',
                marginBottom: '0.25rem',
              }}
            >
              No Data Available
            </p>
            <p
              style={{
                fontSize: '0.825rem',
                color: 'var(--text-muted)',
                maxWidth: '340px',
                lineHeight: 1.45,
                marginBottom: emptyAction ? '1rem' : 0,
              }}
            >
              {emptyMessage}
            </p>
            {emptyAction}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default ChartCard;
