import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('bi_auth_token') || null);
  const [loading, setLoading] = useState(true);

  // Rehydrate & verify existing session on mount
  useEffect(() => {
    const verifyStoredAuth = async () => {
      const savedToken = localStorage.getItem('bi_auth_token');
      const savedUser = localStorage.getItem('bi_user_data');

      if (savedToken) {
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
          } catch {
            localStorage.removeItem('bi_user_data');
          }
        }

        try {
          // Verify with backend protected endpoint
          const res = await api.get('/auth/profile');
          if (res.data?.data?.user) {
            setUser(res.data.data.user);
            localStorage.setItem('bi_user_data', JSON.stringify(res.data.data.user));
          }
        } catch (err) {
          // If token expired or invalid, reset session
          if (err.response?.status === 401) {
            console.warn('Session expired or invalid, logging out.');
            localStorage.removeItem('bi_auth_token');
            localStorage.removeItem('bi_user_data');
            setToken(null);
            setUser(null);
          }
        }
      }
      setLoading(false);
    };

    verifyStoredAuth();
  }, []);

  /**
   * Log in user with email & password
   */
  const loginUser = async (email, password) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token: receivedToken, user: receivedUser } = res.data.data;

      setToken(receivedToken);
      setUser(receivedUser);
      localStorage.setItem('bi_auth_token', receivedToken);
      localStorage.setItem('bi_user_data', JSON.stringify(receivedUser));

      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed. Please check your credentials.';
      return { success: false, message };
    }
  };

  /**
   * Register new user account
   */
  const registerUser = async (formData) => {
    try {
      const res = await api.post('/auth/register', formData);
      const { token: receivedToken, user: receivedUser } = res.data.data;

      setToken(receivedToken);
      setUser(receivedUser);
      localStorage.setItem('bi_auth_token', receivedToken);
      localStorage.setItem('bi_user_data', JSON.stringify(receivedUser));

      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Registration failed. Please try again.';
      return { success: false, message };
    }
  };

  /**
   * Log out user
   */
  const logout = () => {
    localStorage.removeItem('bi_auth_token');
    localStorage.removeItem('bi_user_data');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        loading,
        loginUser,
        registerUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
