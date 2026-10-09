import api from './api';

export const runSimulation = async (payload) => {
  const res = await api.post('/scenarios/simulate', payload);
  return res.data;
};

export const saveScenario = async (payload) => {
  const res = await api.post('/scenarios', payload);
  return res.data;
};

export const getSavedScenarios = async (params = {}) => {
  const res = await api.get('/scenarios', { params });
  return res.data;
};

export const getScenarioById = async (id) => {
  const res = await api.get(`/scenarios/${id}`);
  return res.data;
};

export const updateScenario = async (id, payload) => {
  const res = await api.put(`/scenarios/${id}`, payload);
  return res.data;
};

export const deleteScenario = async (id) => {
  const res = await api.delete(`/scenarios/${id}`);
  return res.data;
};
