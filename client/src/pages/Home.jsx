import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Home = () => {
  const { isAuthenticated, user } = useAuth();

  const modules = [
    { id: 1, title: 'Authentication & Shop Profile', desc: 'Secure JWT-based registration, shop categorization & owner login' },
    { id: 2, title: 'Sales & Inventory Data', desc: 'CRUD operations and CSV bulk data ingestion with schema validation' },
    { id: 3, title: 'BI Dashboard', desc: 'Recharts-powered revenue trends, retail KPIs & category distribution' },
    { id: 4, title: 'ML Demand Forecasting', desc: 'Statistical time-series models, Holt-Winters & linear regression' },
    { id: 5, title: 'Inventory Risk Detection', desc: 'ROP, EOQ, ABC Pareto analysis & stockout probability calculations' },
    { id: 6, title: 'Explainable Recommendations', desc: 'Rule-based decision actions accompanied by transparent mathematical rationale' },
    { id: 7, title: 'What-If Decision Simulation', desc: 'Interactive scenario modeling for price elasticity, costs & lead times' },
    { id: 8, title: 'Outcome Tracking', desc: 'Audit log & post-decision metric impact evaluation to measure real ROI' },
  ];

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Hero Header */}
      <section style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '2.5rem 2rem',
        marginBottom: '2.5rem',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ maxWidth: '800px' }}>
          <span style={{
            display: 'inline-block',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 700,
            marginBottom: '0.75rem'
          }}>
            COLLEGE MAJOR PROJECT
          </span>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.2, marginBottom: '0.75rem' }}>
            AI-Powered Business Intelligence & Decision Intelligence Platform
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            A quantitative analytical web platform designed specifically for small retail businesses—including clothing boutiques, supermarkets, and local grocery stores—to forecast product demand, control inventory stockout risks, and simulate strategic decisions without relying on generative LLM APIs.
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  padding: '0.65rem 1.4rem',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: 'var(--shadow-md)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                Go to Shop Dashboard ({user?.businessName}) &rarr;
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  style={{
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    padding: '0.65rem 1.4rem',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                    textDecoration: 'none',
                    boxShadow: 'var(--shadow-md)'
                  }}
                >
                  Register Retail Shop &rarr;
                </Link>
                <Link
                  to="/login"
                  style={{
                    backgroundColor: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border)',
                    padding: '0.65rem 1.4rem',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                    textDecoration: 'none'
                  }}
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Planned Modules Grid */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Application Modules Architecture
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              8-Stage quantitative analytical pipeline for small retail decision making
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '1.25rem'
        }}>
          {modules.map((m) => (
            <div
              key={m.id}
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  marginBottom: '0.75rem'
                }}>
                  {m.id}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    {m.title}
                  </h3>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  {m.desc}
                </p>
              </div>

              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--success)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  ● Module Active (Ready to Test)
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Engineering Footer */}
      <footer style={{
        marginTop: '3rem',
        paddingTop: '1.5rem',
        borderTop: '1px solid var(--border)',
        color: 'var(--text-muted)',
        fontSize: '0.875rem',
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <span>Stack: MERN (React 19 + Vite, Express, MongoDB, Node.js)</span>
        <span>Decision Engine: Classical Statistics & Transparent Machine Learning (No LLMs)</span>
      </footer>
    </div>
  );
};

export default Home;
