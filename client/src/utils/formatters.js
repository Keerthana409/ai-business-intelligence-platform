/**
 * Presentation Formatters for Currency, Numbers, and Dates
 */

export const formatCurrency = (amount, currency = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
};

export const formatNumber = (num) => {
  return new Intl.NumberFormat('en-US').format(num || 0);
};

export const formatPercent = (val) => {
  return `${(val || 0).toFixed(1)}%`;
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const SHOP_CATEGORY_LABELS = {
  grocery: 'Grocery Store',
  'grocery store': 'Grocery Store',
  supermarket: 'Supermarket',
  clothing: 'Clothing & Fashion',
  'clothing & fashion': 'Clothing & Fashion',
  'clothing shop': 'Clothing & Fashion',
  electronics: 'Electronics Store',
  'electronics store': 'Electronics Store',
  pharmacy: 'Pharmacy / Medical Store',
  'pharmacy / medical store': 'Pharmacy / Medical Store',
  other: 'Other',
  general_retail: 'General Retail',
};

export const formatShopCategory = (businessType) => {
  if (!businessType || typeof businessType !== 'string') return 'Grocery Store';
  const key = businessType.trim().toLowerCase();
  return SHOP_CATEGORY_LABELS[key] || businessType.replace(/_/g, ' ');
};
