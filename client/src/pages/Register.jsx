import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const { registerUser } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    businessType: 'grocery',
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (serverError) {
      setServerError('');
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please provide a valid email address';
    }

    if (!formData.businessName.trim()) {
      newErrors.businessName = 'Shop name is required';
    }

    if (!formData.businessType) {
      newErrors.businessType = 'Please select a shop category';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setServerError('');

    const payload = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      password: formData.password,
      confirmPassword: formData.confirmPassword,
      businessName: formData.businessName.trim(),
      businessType: formData.businessType,
    };

    const result = await registerUser(payload);
    setLoading(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setServerError(result.message);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 80px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2.5rem 1rem'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '2.5rem 2rem',
        boxShadow: 'var(--shadow-md)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex',
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            marginBottom: '0.75rem',
            fontWeight: 800
          }}>
            🏪
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
            Register Retail Business
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Set up your shop profile for AI & Decision Intelligence
          </p>
        </div>

        {serverError && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #f87171',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.875rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>⚠️</span>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Full Name & Email (Row) */}
          <div className="form-row">
            <div>
              <label className="form-label">
                Full Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Name"
                disabled={loading}
                className={`form-input ${errors.name ? 'has-error' : ''}`}
                style={{
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                  caretColor: '#2563eb',
                }}
              />
              {errors.name && (
                <span style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  {errors.name}
                </span>
              )}
            </div>

            <div>
              <label className="form-label">
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="owner@shop.com"
                disabled={loading}
                className={`form-input ${errors.email ? 'has-error' : ''}`}
                style={{
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                  caretColor: '#2563eb',
                }}
              />
              {errors.email && (
                <span style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  {errors.email}
                </span>
              )}
            </div>
          </div>

          {/* Shop Name & Shop Category (Row) */}
          <div className="form-row" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
            <div>
              <label className="form-label">
                Shop Name *
              </label>
              <input
                type="text"
                name="businessName"
                value={formData.businessName}
                onChange={handleChange}
                placeholder="City Supermarket"
                disabled={loading}
                className={`form-input ${errors.businessName ? 'has-error' : ''}`}
                style={{
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                  caretColor: '#2563eb',
                }}
              />
              {errors.businessName && (
                <span style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  {errors.businessName}
                </span>
              )}
            </div>

            <div>
              <label className="form-label">
                Shop Category *
              </label>
              <select
                name="businessType"
                value={formData.businessType}
                onChange={handleChange}
                disabled={loading}
                className={`form-select ${errors.businessType ? 'has-error' : ''}`}
                style={{
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                  fontWeight: 500,
                }}
              >
                <option value="grocery" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>Grocery Store</option>
                <option value="clothing" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>Clothing Shop</option>
                <option value="supermarket" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>Supermarket</option>
              </select>
            </div>
          </div>

          {/* Password & Confirm Password (Row) */}
          <div className="form-row" style={{ marginBottom: '1.75rem' }}>
            <div>
              <label className="form-label">
                Password (min 6 chars) *
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                disabled={loading}
                className={`form-input ${errors.password ? 'has-error' : ''}`}
                style={{
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                  caretColor: '#2563eb',
                }}
              />
              {errors.password && (
                <span style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  {errors.password}
                </span>
              )}
            </div>

            <div>
              <label className="form-label">
                Confirm Password *
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                disabled={loading}
                className={`form-input ${errors.confirmPassword ? 'has-error' : ''}`}
                style={{
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                  caretColor: '#2563eb',
                }}
              />
              {errors.confirmPassword && (
                <span style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  {errors.confirmPassword}
                </span>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              padding: '0.75rem',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '0.95rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            {loading ? 'Creating Shop Account...' : 'Complete Registration & Open Dashboard'}
          </button>
        </form>

        <div style={{
          marginTop: '1.75rem',
          textAlign: 'center',
          fontSize: '0.875rem',
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border)',
          paddingTop: '1.25rem'
        }}>
          Already have a retail account?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
