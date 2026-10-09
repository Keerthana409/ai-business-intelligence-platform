import api from './api';

export const getRecommendations = async (params = {}) => {
  const res = await api.get('/recommendations', { params });
  return res.data;
};

export const updateRecommendationStatus = async (id, status) => {
  const res = await api.patch(`/recommendations/${id}/status`, { status });
  return res.data;
};

export const getRecommendationSummary = async () => {
  const res = await api.get('/recommendations/summary');
  return res.data;
};
