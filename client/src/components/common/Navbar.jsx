import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [backendStatus, setBackendStatus] = useState('checking...');

  useEffect(() => {
    // Check backend health on mount
    api.get('/health')
      .then((res) => {
        setBackendStatus(`Online (${res.data.status})`);
      })
      .catch(() => {
        setBackendStatus('Offline');
      });
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav style={{
      backgroundColor: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      padding: '0.875rem 1.5rem',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        {/* Brand / Title */}
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1rem'
          }}>
            BI
          </div>
          <div>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', lineHeight: 1.2 }}>
              Retail Decision Platform
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Business Intelligence & Analytics
            </span>
          </div>
        </Link>

        {/* Status Pill & Navigation Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Live Backend Health Pill */}
          <div style={{
            padding: '0.25rem 0.65rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: backendStatus.startsWith('Online') ? '#dcfce7' : '#fee2e2',
            color: backendStatus.startsWith('Online') ? '#166534' : '#991b1b',
            border: '1px solid currentColor'
          }}>
            API: {backendStatus}
          </div>

          <Link to="/" style={{
            textDecoration: 'none',
            color: 'var(--text-main)',
            fontSize: '0.875rem',
            fontWeight: 500
          }}>
            Home
          </Link>

          {isAuthenticated ? (
            <>
              <Link to="/dashboard" style={{
                textDecoration: 'none',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
                fontWeight: 600
              }}>
                Dashboard
              </Link>
              <Link to="/sales" style={{
                textDecoration: 'none',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
                fontWeight: 600
              }}>
                Sales
              </Link>
              <Link to="/inventory" style={{
                textDecoration: 'none',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
                fontWeight: 600
              }}>
                Inventory
              </Link>
              <Link to="/upload" style={{
                textDecoration: 'none',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
                fontWeight: 600
              }}>
                Upload Data
              </Link>
              <Link to="/forecast" style={{
                textDecoration: 'none',
                color: 'var(--primary)',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <span>📈 Forecast</span>
              </Link>
              <Link to="/anomalies" style={{
                textDecoration: 'none',
                color: '#b91c1c',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <span>🚨 Anomalies</span>
              </Link>
              <Link to="/recommendations" style={{
                textDecoration: 'none',
                color: '#d97706',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <span>💡 Recommendations</span>
              </Link>
              <Link to="/scenarios" style={{
                textDecoration: 'none',
                color: '#7c3aed',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <span>🧪 What-If Simulator</span>
              </Link>
              <Link to="/decision-audit" style={{
                textDecoration: 'none',
                color: '#059669',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <span>🎯 Decision Audit</span>
              </Link>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: 'var(--primary-light)',
                padding: '0.25rem 0.65rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                color: 'var(--primary)',
                fontWeight: 600
              }}>
                <span>🏪 {user?.businessName || 'My Shop'}</span>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.15s ease'
                }}
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" style={{
                textDecoration: 'none',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
                fontWeight: 500,
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)'
              }}>
                Log In
              </Link>
              <Link to="/register" style={{
                textDecoration: 'none',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: 600,
                padding: '0.4rem 0.9rem',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                Register Shop
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
