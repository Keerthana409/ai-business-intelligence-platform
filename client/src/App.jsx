import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/common/Navbar';
import ProtectedRoute from './components/common/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import UploadData from './pages/UploadData';
import Forecast from './pages/Forecast';
import Anomalies from './pages/Anomalies';
import Recommendations from './pages/Recommendations';
import Scenarios from './pages/Scenarios';
import DecisionAudit from './pages/DecisionAudit';
import './styles/theme.css';

const RootRedirect = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return null;
  }
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Navbar />
          <main style={{ flex: 1 }}>
            <Routes>
              {/* Default route redirects logged-in users to BI Dashboard and logged-out users to Login */}
              <Route path="/" element={<RootRedirect />} />

              {/* Public Authentication Pages */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Authenticated Dashboard */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              {/* Module 2: Inventory Management */}
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute>
                    <Inventory />
                  </ProtectedRoute>
                }
              />

              {/* Module 2: Sales Transactions */}
              <Route
                path="/sales"
                element={
                  <ProtectedRoute>
                    <Sales />
                  </ProtectedRoute>
                }
              />

              {/* Module 2: CSV Data Upload */}
              <Route
                path="/upload"
                element={
                  <ProtectedRoute>
                    <UploadData />
                  </ProtectedRoute>
                }
              />

              {/* Module 4: Predictive Forecasting & ML */}
              <Route
                path="/forecast"
                element={
                  <ProtectedRoute>
                    <Forecast />
                  </ProtectedRoute>
                }
              />

              {/* Module 5: Anomaly Detection */}
              <Route
                path="/anomalies"
                element={
                  <ProtectedRoute>
                    <Anomalies />
                  </ProtectedRoute>
                }
              />

              {/* Module 6: Business Recommendations & Decision Support */}
              <Route
                path="/recommendations"
                element={
                  <ProtectedRoute>
                    <Recommendations />
                  </ProtectedRoute>
                }
              />

              {/* Module 7: What-If Scenario Simulation Engine */}
              <Route
                path="/scenarios"
                element={
                  <ProtectedRoute>
                    <Scenarios />
                  </ProtectedRoute>
                }
              />

              {/* Module 8: Decision Audit & Outcome Tracking */}
              <Route
                path="/decision-audit"
                element={
                  <ProtectedRoute>
                    <DecisionAudit />
                  </ProtectedRoute>
                }
              />

              {/* Fallback to default route */}
              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
