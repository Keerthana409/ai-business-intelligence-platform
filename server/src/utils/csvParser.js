import { Readable } from 'stream';
import csvParser from 'csv-parser';

/**
 * Normalizes header string (lowercase, trims whitespace and quotes)
 */
const normalizeHeader = (header) => {
  return (header || '').toString().trim().toLowerCase().replace(/['"]/g, '');
};

/**
 * Parses raw CSV buffer into array of raw row objects
 */
const parseCsvBuffer = (buffer) => {
  return new Promise((resolve, reject) => {
    const rows = [];
    const headers = [];

    if (!buffer || buffer.length === 0) {
      return resolve({ headers: [], rows: [] });
    }

    Readable.from(buffer)
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => {
            const normalized = normalizeHeader(header);
            headers.push(normalized);
            return normalized;
          },
        })
      )
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve({ headers, rows }))
      .on('error', (err) => reject(err));
  });
};

/**
 * Validate and parse Sales CSV
 * Required columns: date, productName, quantity, unitPrice
 */
export const parseAndValidateSalesCSV = async (buffer) => {
  const { headers, rows } = await parseCsvBuffer(buffer);

  if (rows.length === 0) {
    return {
      success: false,
      message: 'The uploaded CSV file is empty or contains no data rows.',
      headers: [],
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      preview: [],
    };
  }

  // Check required headers
  const requiredHeaders = ['date', 'productname', 'quantity', 'unitprice'];
  const presentHeaders = Object.keys(rows[0] || {});
  const missingHeaders = requiredHeaders.filter((h) => !presentHeaders.includes(h));

  if (missingHeaders.length > 0) {
    return {
      success: false,
      message: `Missing required CSV column(s): ${missingHeaders.join(', ')}. Expected columns: date, productName, quantity, unitPrice`,
      headers: presentHeaders,
      totalRows: rows.length,
      validRows: [],
      invalidRows: [],
      preview: [],
    };
  }

  const validRows = [];
  const invalidRows = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 accounting for 1-based index and header line
    const errors = [];

    // 1. Date validation
    const rawDate = row.date?.trim();
    const parsedDate = new Date(rawDate);
    if (!rawDate || isNaN(parsedDate.getTime())) {
      errors.push(`Invalid date format '${rawDate || ''}'. Expected YYYY-MM-DD or standard date format`);
    }

    // 2. Product Name validation
    const productName = row.productname?.trim();
    if (!productName) {
      errors.push('Product name is required');
    }

    // 3. Quantity validation
    const quantity = Number(row.quantity);
    if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      errors.push(`Quantity must be a positive integer (found '${row.quantity}')`);
    }

    // 4. Unit Price validation
    const unitPrice = Number(row.unitprice);
    if (isNaN(unitPrice) || unitPrice < 0) {
      errors.push(`Unit price must be a valid positive number (found '${row.unitprice}')`);
    }

    if (errors.length > 0) {
      invalidRows.push({
        rowNumber,
        data: row,
        errors,
      });
    } else {
      validRows.push({
        rowNumber,
        date: parsedDate,
        productName,
        quantitySold: quantity,
        unitPrice: Number(unitPrice.toFixed(2)),
        totalRevenue: Number((quantity * unitPrice).toFixed(2)),
      });
    }
  });

  return {
    success: true,
    headers: presentHeaders,
    totalRows: rows.length,
    validCount: validRows.length,
    invalidCount: invalidRows.length,
    validRows,
    invalidRows,
    preview: validRows.slice(0, 10),
  };
};

/**
 * Validate and parse Inventory CSV
 * Required columns: productName, sku, category, costPrice, sellingPrice, stockQuantity, reorderThreshold
 */
export const parseAndValidateInventoryCSV = async (buffer) => {
  const { headers, rows } = await parseCsvBuffer(buffer);

  if (rows.length === 0) {
    return {
      success: false,
      message: 'The uploaded CSV file is empty or contains no data rows.',
      headers: [],
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      preview: [],
    };
  }

  // Check required headers
  const requiredHeaders = [
    'productname',
    'sku',
    'category',
    'costprice',
    'sellingprice',
    'stockquantity',
    'reorderthreshold',
  ];
  const presentHeaders = Object.keys(rows[0] || {});
  const missingHeaders = requiredHeaders.filter((h) => !presentHeaders.includes(h));

  if (missingHeaders.length > 0) {
    return {
      success: false,
      message: `Missing required CSV column(s): ${missingHeaders.join(', ')}. Expected columns: productName, sku, category, costPrice, sellingPrice, stockQuantity, reorderThreshold`,
      headers: presentHeaders,
      totalRows: rows.length,
      validRows: [],
      invalidRows: [],
      preview: [],
    };
  }

  const validRows = [];
  const invalidRows = [];
  const seenSkusInFile = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const errors = [];

    // 1. Product Name validation
    const name = row.productname?.trim();
    if (!name) {
      errors.push('Product name is required');
    }

    // 2. SKU validation
    const sku = row.sku?.trim();
    if (!sku) {
      errors.push('SKU code is required');
    } else if (seenSkusInFile.has(sku.toLowerCase())) {
      errors.push(`Duplicate SKU '${sku}' found in the same file`);
    } else {
      seenSkusInFile.add(sku.toLowerCase());
    }

    // 3. Category validation
    const category = (row.category?.trim() || 'General');

    // 4. Cost Price validation
    const costPrice = Number(row.costprice);
    if (isNaN(costPrice) || costPrice < 0) {
      errors.push(`Cost price must be a valid non-negative number (found '${row.costprice}')`);
    }

    // 5. Selling Price validation
    const sellingPrice = Number(row.sellingprice);
    if (isNaN(sellingPrice) || sellingPrice < 0) {
      errors.push(`Selling price must be a valid non-negative number (found '${row.sellingprice}')`);
    }

    // 6. Stock Quantity validation
    const stockQuantity = Number(row.stockquantity);
    if (isNaN(stockQuantity) || stockQuantity < 0) {
      errors.push(`Stock quantity must be a non-negative number (found '${row.stockquantity}')`);
    }

    // 7. Reorder Threshold validation
    const reorderThreshold = Number(row.reorderthreshold);
    if (isNaN(reorderThreshold) || reorderThreshold < 0) {
      errors.push(`Reorder threshold must be a non-negative number (found '${row.reorderthreshold}')`);
    }

    if (errors.length > 0) {
      invalidRows.push({
        rowNumber,
        data: row,
        errors,
      });
    } else {
      validRows.push({
        rowNumber,
        name,
        sku,
        category,
        costPrice: Number(costPrice.toFixed(2)),
        sellingPrice: Number(sellingPrice.toFixed(2)),
        stockQuantity: Math.floor(stockQuantity),
        reorderThreshold: Math.floor(reorderThreshold),
      });
    }
  });

  return {
    success: true,
    headers: presentHeaders,
    totalRows: rows.length,
    validCount: validRows.length,
    invalidCount: invalidRows.length,
    validRows,
    invalidRows,
    preview: validRows.slice(0, 10),
  };
};
