import api from './api';

export const getDailyAnomalies = async (params = {}) => {
  const res = await api.get('/anomalies/daily', { params });
  return res.data;
};

export const getTransactionOutliers = async (params = {}) => {
  const res = await api.get('/anomalies/transactions', { params });
  return res.data;
};

export const getAnomalySummary = async () => {
  const res = await api.get('/anomalies/summary');
  return res.data;
};
