import React, { useState } from 'react';
import {
  downloadSalesTemplate,
  previewSalesCSV,
  importSalesCSV,
} from '../services/salesService';
import {
  downloadInventoryTemplate,
  previewInventoryCSV,
  importInventoryCSV,
} from '../services/inventoryService';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';

const UploadData = () => {
  const [activeTab, setActiveTab] = useState('sales'); // 'sales' | 'inventory'
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [importResult, setImportResult] = useState(null);

  // Sales-specific options
  const [deductStock, setDeductStock] = useState(false);

  const resetUploadState = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setErrorMessage('');
    setImportResult(null);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    resetUploadState();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setErrorMessage('Please select a valid .csv file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 5MB maximum limit.');
      return;
    }

    setSelectedFile(file);
    setErrorMessage('');
    setImportResult(null);
    handlePreviewFile(file);
  };

  const handlePreviewFile = async (file) => {
    setValidating(true);
    setErrorMessage('');
    try {
      let res;
      if (activeTab === 'sales') {
        res = await previewSalesCSV(file);
      } else {
        res = await previewInventoryCSV(file);
      }

      if (res.data?.success) {
        setPreviewData(res.data);
      } else {
        setErrorMessage(res.data?.message || 'Failed to parse CSV file');
        setPreviewData(null);
      }
    } catch (err) {
      console.error('CSV Preview error:', err);
      setErrorMessage(err.response?.data?.message || 'Error uploading or validating CSV file.');
      setPreviewData(null);
    } finally {
      setValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData || previewData.validRows.length === 0) return;

    setImporting(true);
    setErrorMessage('');
    try {
      let res;
      if (activeTab === 'sales') {
        res = await importSalesCSV(previewData.validRows, deductStock);
      } else {
        res = await importInventoryCSV(previewData.validRows);
      }

      setImportResult({
        success: true,
        message: res.message,
        importedCount: previewData.validCount,
        rejectedCount: previewData.invalidCount,
      });
      setPreviewData(null);
      setSelectedFile(null);
    } catch (err) {
      console.error('Import error:', err);
      setErrorMessage(err.response?.data?.message || 'Failed to complete import.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
          Batch Data Ingestion
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Import your store's historical sales transactions or catalog inventory using CSV files
        </p>
      </div>

      {/* Tab Switcher */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '2px solid var(--border)',
        marginBottom: '2rem',
      }}>
        <button
          onClick={() => handleTabChange('sales')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderBottom: activeTab === 'sales' ? '3px solid var(--primary)' : '3px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'sales' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            marginBottom: '-2px',
          }}
        >
          💳 Sales Transactions CSV
        </button>
        <button
          onClick={() => handleTabChange('inventory')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderBottom: activeTab === 'inventory' ? '3px solid var(--primary)' : '3px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'inventory' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            marginBottom: '-2px',
          }}
        >
          📦 Catalog Inventory CSV
        </button>
      </div>

      {/* Top Banner / Template Download */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '1.5rem',
        marginBottom: '2rem',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
            {activeTab === 'sales' ? 'Sales CSV Specifications' : 'Inventory CSV Specifications'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {activeTab === 'sales' ? (
              <>
                Required columns: <code>date</code> (YYYY-MM-DD), <code>productName</code>, <code>quantity</code> (integer &gt; 0), <code>unitPrice</code> (number).
              </>
            ) : (
              <>
                Required columns: <code>productName</code>, <code>sku</code>, <code>category</code>, <code>costPrice</code>, <code>sellingPrice</code>, <code>stockQuantity</code>, <code>reorderThreshold</code>.
              </>
            )}
          </p>
        </div>

        <button
          onClick={activeTab === 'sales' ? downloadSalesTemplate : downloadInventoryTemplate}
          style={{
            backgroundColor: 'var(--bg-main)',
            color: 'var(--text-main)',
            border: '1.5px solid var(--border)',
            padding: '0.55rem 1.15rem',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span>📥</span>
          <span>Download {activeTab === 'sales' ? 'Sales' : 'Inventory'} Template (.csv)</span>
        </button>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #f87171',
          color: '#991b1b',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.75rem',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
        }}>
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Import Result Banner */}
      {importResult && (
        <div style={{
          backgroundColor: '#dcfce7',
          border: '1px solid #86efac',
          color: '#166534',
          padding: '1.25rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '2rem',
        }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.35rem' }}>
            ✓ Import Completed
          </h4>
          <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>{importResult.message}</p>
          <div style={{ fontSize: '0.85rem', display: 'flex', gap: '1.5rem' }}>
            <span>Successfully imported: <strong>{importResult.importedCount}</strong></span>
            {importResult.rejectedCount > 0 && (
              <span style={{ color: '#b91c1c' }}>Invalid / rejected rows: <strong>{importResult.rejectedCount}</strong></span>
            )}
          </div>
        </div>
      )}

      {/* Upload Dropzone */}
      {!previewData && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '2px dashed var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '3rem 2rem',
          textAlign: 'center',
          marginBottom: '2rem',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.75rem' }}>📄</span>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            Upload {activeTab === 'sales' ? 'Sales' : 'Inventory'} CSV
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            Drag and drop your spreadsheet file here or browse from your computer (Maximum file size: 5MB).
          </p>

          <label style={{
            display: 'inline-block',
            backgroundColor: 'var(--primary)',
            color: '#fff',
            padding: '0.65rem 1.5rem',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <span>Choose CSV File</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              disabled={validating}
            />
          </label>
        </div>
      )}

      {/* Validating Spinner */}
      {validating && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid var(--border)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            margin: '0 auto 1rem',
            animation: 'spin 0.8s linear infinite',
          }}></div>
          <p>Analyzing and validating CSV rows...</p>
        </div>
      )}

      {/* Preview Section */}
      {previewData && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem',
          marginBottom: '2rem',
          boxShadow: 'var(--shadow-sm)',
        }}>
          {/* File Overview Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{
              backgroundColor: 'var(--bg-main)',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Total Rows
              </span>
              <h4 style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.2rem' }}>
                {previewData.totalRows}
              </h4>
            </div>

            <div style={{
              backgroundColor: '#f0fdf4',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #bbf7d0',
            }}>
              <span style={{ fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', fontWeight: 600 }}>
                Valid Rows
              </span>
              <h4 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#166534', marginTop: '0.2rem' }}>
                {previewData.validCount}
              </h4>
            </div>

            <div style={{
              backgroundColor: previewData.invalidCount > 0 ? '#fef2f2' : 'var(--bg-main)',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${previewData.invalidCount > 0 ? '#fecaca' : 'var(--border)'}`,
            }}>
              <span style={{
                fontSize: '0.75rem',
                color: previewData.invalidCount > 0 ? '#991b1b' : 'var(--text-muted)',
                textTransform: 'uppercase',
                fontWeight: 600
              }}>
                Invalid Rows
              </span>
              <h4 style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                color: previewData.invalidCount > 0 ? '#991b1b' : 'var(--text-muted)',
                marginTop: '0.2rem'
              }}>
                {previewData.invalidCount}
              </h4>
            </div>
          </div>

          {/* Column Mapping Summary (if available) */}
          {previewData.columnMapping?.length > 0 && (
            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.8rem',
            }}>
              <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.35rem' }}>
                🔗 Detected CSV Column Mapping:
              </strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {previewData.columnMapping.map((col, idx) => (
                  <span
                    key={idx}
                    style={{
                      backgroundColor: col.wasAliased ? '#eff6ff' : '#ffffff',
                      border: `1px solid ${col.wasAliased ? '#bfdbfe' : 'var(--border)'}`,
                      color: col.wasAliased ? '#1e40af' : 'var(--text-main)',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                    }}
                  >
                    {col.originalHeader} &rarr; <strong>{col.mappedTo}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Unknown Product Warnings Box (if any) */}
          {previewData.warnings?.length > 0 && (
            <div style={{
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
              color: '#92400e',
              fontSize: '0.82rem',
            }}>
              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>
                ⚠️ Catalog Matching Notice:
              </strong>
              {previewData.warnings.map((w, idx) => (
                <div key={idx}>{w}</div>
              ))}
            </div>
          )}

          {/* Validation Errors Box (if any) */}
          {previewData.invalidRows?.length > 0 && (
            <div style={{
              backgroundColor: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#9f1239', marginBottom: '0.5rem' }}>
                ⚠️ Validation Issues Detected ({previewData.invalidRows.length} Rows With Errors)
              </h4>
              <p style={{ fontSize: '0.8rem', color: '#881337', marginBottom: '0.75rem' }}>
                The following rows will be skipped during import unless fixed. Details:
              </p>
              <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                {previewData.invalidRows.map((inv) => (
                  <div
                    key={inv.rowNumber}
                    style={{
                      fontSize: '0.8rem',
                      color: '#9f1239',
                      padding: '0.3rem 0',
                      borderBottom: '1px dashed #fecdd3',
                    }}
                  >
                    <strong>Row {inv.rowNumber}:</strong> {inv.errors.join('; ')}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview Table */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
              Sample Preview (First {previewData.preview.length} Valid Rows)
            </h4>
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>Row #</th>
                    {activeTab === 'sales' ? (
                      <>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>Date</th>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>Product</th>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Quantity</th>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Unit Price</th>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Revenue</th>
                      </>
                    ) : (
                      <>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>SKU</th>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>Product</th>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>Category</th>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Cost</th>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Price</th>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Stock</th>
                        <th style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Lead Time</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewData.preview.map((row) => (
                    <tr key={row.rowNumber} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-muted)' }}>{row.rowNumber}</td>
                      {activeTab === 'sales' ? (
                        <>
                          <td style={{ padding: '0.6rem 0.85rem' }}>{formatDate(row.date)}</td>
                          <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600 }}>
                            {row.productName}
                            {row.isKnownProduct === false && (
                              <span
                                style={{
                                  marginLeft: '0.4rem',
                                  fontSize: '0.7rem',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '4px',
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  fontWeight: 600,
                                }}
                              >
                                Unknown Product
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'center' }}>{formatNumber(row.quantitySold)}</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{formatCurrency(row.unitPrice)}</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                            {formatCurrency(row.totalRevenue)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600 }}>{row.sku}</td>
                          <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600 }}>{row.name}</td>
                          <td style={{ padding: '0.6rem 0.85rem' }}>{row.category}</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{formatCurrency(row.costPrice)}</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{formatCurrency(row.sellingPrice)}</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'center', fontWeight: 700 }}>{formatNumber(row.stockQuantity)}</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'center', color: 'var(--text-muted)' }}>{row.leadTimeDays || 7}d</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sales Options */}
          {activeTab === 'sales' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={deductStock}
                  onChange={(e) => setDeductStock(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                />
                <span>Automatically deduct sold quantities from matching products in inventory</span>
              </label>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              onClick={resetUploadState}
              disabled={importing}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--border)',
                padding: '0.6rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={importing || previewData.validCount === 0}
              style={{
                backgroundColor: 'var(--primary)',
                color: '#fff',
                border: 'none',
                padding: '0.6rem 1.5rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: importing || previewData.validCount === 0 ? 'not-allowed' : 'pointer',
                opacity: importing || previewData.validCount === 0 ? 0.6 : 1,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {importing ? 'Importing...' : `Confirm & Import (${previewData.validCount} Records)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadData;
