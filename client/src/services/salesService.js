import api from './api';

export const getSales = async (params = {}) => {
  const res = await api.get('/sales', { params });
  return res.data;
};

export const createSale = async (saleData) => {
  const res = await api.post('/sales', saleData);
  return res.data;
};

export const updateSale = async (id, saleData) => {
  const res = await api.put(`/sales/${id}`, saleData);
  return res.data;
};

export const deleteSale = async (id) => {
  const res = await api.delete(`/sales/${id}`);
  return res.data;
};

export const downloadSalesTemplate = async () => {
  const res = await api.get('/sales/template', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'sales_template.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const previewSalesCSV = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/sales/preview-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const importSalesCSV = async (items, deductStock = false) => {
  const res = await api.post('/sales/import-csv', { items, deductStock });
  return res.data;
};
