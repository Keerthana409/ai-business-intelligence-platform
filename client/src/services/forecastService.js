import api from './api';

export const getSalesForecast = async (params = {}) => {
  const res = await api.get('/forecast/sales', { params });
  return res.data;
};

export const getProductDemandForecast = async (params = {}) => {
  const res = await api.get('/forecast/demand', { params });
  return res.data;
};

export const getInventoryRiskAnalysis = async (params = {}) => {
  const res = await api.get('/forecast/inventory-risk', { params });
  return res.data;
};

export const getForecastEvaluation = async () => {
  const res = await api.get('/forecast/evaluation');
  return res.data;
};
