import api from './api';

export const getProducts = async (params = {}) => {
  const res = await api.get('/inventory', { params });
  return res.data;
};

export const createProduct = async (productData) => {
  const res = await api.post('/inventory', productData);
  return res.data;
};

export const updateProduct = async (id, productData) => {
  const res = await api.put(`/inventory/${id}`, productData);
  return res.data;
};

export const deleteProduct = async (id) => {
  const res = await api.delete(`/inventory/${id}`);
  return res.data;
};

export const downloadInventoryTemplate = async () => {
  const res = await api.get('/inventory/template', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'inventory_template.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const previewInventoryCSV = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/inventory/preview-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const importInventoryCSV = async (items) => {
  const res = await api.post('/inventory/import-csv', { items });
  return res.data;
};
