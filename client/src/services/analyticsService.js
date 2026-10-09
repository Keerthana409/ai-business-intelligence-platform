import api from './api';

export const getSummaryMetrics = async () => {
  const res = await api.get('/analytics/summary');
  return res.data;
};

export const getRevenueByProduct = async (limit = 8) => {
  const res = await api.get('/analytics/revenue-by-product', {
    params: { limit },
  });
  return res.data;
};

export const getRevenueByCategory = async () => {
  const res = await api.get('/analytics/revenue-by-category');
  return res.data;
};

export const getSalesOverTime = async (params = {}) => {
  const res = await api.get('/analytics/sales-over-time', { params });
  return res.data;
};

export const getInventoryStockAnalytics = async () => {
  const res = await api.get('/analytics/inventory-stock');
  return res.data;
};

export const getLowStockAnalytics = async () => {
  const res = await api.get('/analytics/low-stock');
  return res.data;
};

