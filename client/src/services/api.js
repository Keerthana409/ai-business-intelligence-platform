import axios from 'axios';

/**
 * Resolves and normalizes the backend API base URL.
 * Supports both VITE_API_URL (common Vercel convention) and VITE_API_BASE_URL.
 * Automatically ensures the URL includes the '/api' prefix and strips trailing slashes.
 * Preserves local development default 'http://localhost:5000/api'.
 */
const getBaseURL = () => {
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  if (!envUrl || !envUrl.trim()) {
    return 'http://localhost:5000/api';
  }

  // Trim whitespace and remove trailing slashes
  const trimmed = envUrl.trim().replace(/\/+$/, '');

  // Append /api if not already present
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every outgoing request if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('bi_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
