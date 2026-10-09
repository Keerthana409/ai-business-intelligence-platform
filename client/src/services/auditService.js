import api from './api';

export const implementDecision = async (payload) => {
  const response = await api.post('/audit/implement', payload);
  return response.data;
};

export const getAudits = async (params = {}) => {
  const response = await api.get('/audit', { params });
  return response.data;
};

export const getAuditById = async (id) => {
  const response = await api.get(`/audit/${id}`);
  return response.data;
};

export const getAuditSummary = async () => {
  const response = await api.get('/audit/summary');
  return response.data;
};

export const recalculateAudit = async (id) => {
  const response = await api.patch(`/audit/${id}/recalculate`);
  return response.data;
};

export const deleteAudit = async (id) => {
  const response = await api.delete(`/audit/${id}`);
  return response.data;
};
