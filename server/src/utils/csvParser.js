import { Readable } from 'stream';
import csvParser from 'csv-parser';

/**
 * Normalizes header string (lowercase, strips whitespace, quotes, underscores, hyphens)
 */
const cleanHeaderToken = (header) => {
  return (header || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/['"\s_\-()]/g, '');
};

const SALES_HEADER_ALIASES = {
  date: ['date', 'saledate', 'salesdate', 'transactiondate', 'billdate', 'invoicedate', 'orderdate', 'timestamp', 'day'],
  productname: ['productname', 'product', 'item', 'itemname', 'name', 'description', 'producttitle', 'itemdescription'],
  quantity: ['quantity', 'qty', 'qtysold', 'soldqty', 'quantitysold', 'units', 'unitssold', 'count', 'volume'],
  unitprice: ['unitprice', 'price', 'sellingprice', 'sp', 'rate', 'mrp', 'saleprice', 'retailprice', 'priceperunit'],
  sku: ['sku', 'skucode', 'itemcode', 'productcode', 'barcode', 'code'],
};

const INVENTORY_HEADER_ALIASES = {
  productname: ['productname', 'product', 'item', 'itemname', 'name', 'description', 'producttitle'],
  sku: ['sku', 'skucode', 'itemcode', 'productcode', 'barcode', 'code', 'productid', 'itemid'],
  category: ['category', 'department', 'group', 'productcategory', 'itemcategory', 'type'],
  costprice: ['costprice', 'cost', 'unitcost', 'buyprice', 'buyingprice', 'cp', 'purchaseprice', 'wholesalecost', 'wholesaleprice'],
  sellingprice: ['sellingprice', 'price', 'unitprice', 'sp', 'rate', 'mrp', 'saleprice', 'retailprice'],
  stockquantity: ['stockquantity', 'stock', 'stockqty', 'currentstock', 'onhand', 'quantityonhand', 'inventory', 'availableqty', 'openingstock', 'qty', 'quantity'],
  reorderthreshold: ['reorderthreshold', 'reorderlevel', 'reorderpoint', 'minstock', 'minqty', 'safetystock', 'threshold', 'minimumstock'],
  leadtimedays: ['leadtimedays', 'leadtime', 'supplierleadtime', 'deliverydays', 'replenishmentdays', 'transitdays'],
};

const resolveAlias = (rawHeader, aliasMap) => {
  const token = cleanHeaderToken(rawHeader);
  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    if (aliases.includes(token)) {
      return canonical;
    }
  }
  return (rawHeader || '').toString().trim().toLowerCase().replace(/['"]/g, '');
};

/**
 * Parses raw CSV buffer into array of raw row objects with header alias resolution
 */
const parseCsvBuffer = (buffer, aliasMap = {}) => {
  return new Promise((resolve, reject) => {
    const rows = [];
    const headers = [];
    const columnMapping = [];

    if (!buffer || buffer.length === 0) {
      return resolve({ headers: [], columnMapping: [], rows: [] });
    }

    Readable.from(buffer)
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => {
            const originalHeader = (header || '').toString().trim().replace(/['"]/g, '');
            const mappedTo = resolveAlias(originalHeader, aliasMap);
            headers.push(mappedTo);
            columnMapping.push({
              originalHeader,
              mappedTo,
              wasAliased: originalHeader.toLowerCase() !== mappedTo.toLowerCase(),
            });
            return mappedTo;
          },
        })
      )
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve({ headers, columnMapping, rows }))
      .on('error', (err) => reject(err));
  });
};

/**
 * Validate and parse Sales CSV
 * Required columns (or aliases): date, productName, quantity, unitPrice
 */
export const parseAndValidateSalesCSV = async (buffer, options = {}) => {
  const { headers, columnMapping, rows } = await parseCsvBuffer(buffer, SALES_HEADER_ALIASES);
  const knownProducts = Array.isArray(options.knownProducts) ? options.knownProducts : null;

  if (rows.length === 0) {
    return {
      success: false,
      message: 'The uploaded CSV file is empty or contains no data rows.',
      headers: [],
      columnMapping: [],
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      warnings: [],
      unknownProducts: [],
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
      message: `Missing required CSV column(s): ${missingHeaders.join(', ')}. Expected columns (or common aliases): date, productName, quantity, unitPrice`,
      headers: presentHeaders,
      columnMapping,
      totalRows: rows.length,
      validRows: [],
      invalidRows: [],
      warnings: [],
      unknownProducts: [],
      preview: [],
    };
  }

  const knownNameSet = new Set();
  const knownSkuSet = new Set();
  if (knownProducts) {
    for (const p of knownProducts) {
      if (typeof p === 'string') {
        knownNameSet.add(p.trim().toLowerCase());
      } else if (p && typeof p === 'object') {
        if (p.name) knownNameSet.add(String(p.name).trim().toLowerCase());
        if (p.sku) knownSkuSet.add(String(p.sku).trim().toLowerCase());
      }
    }
  }

  const now = new Date();
  const maxAllowedDateMs = Math.max(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
  );

  const validRows = [];
  const invalidRows = [];
  const unknownProductsSet = new Set();
  const warnings = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 accounting for 1-based index and header line
    const errors = [];

    // 1. Date validation (including future-date rejection)
    const rawDate = row.date?.trim();
    const parsedDate = new Date(rawDate);
    if (!rawDate || isNaN(parsedDate.getTime())) {
      errors.push(`Invalid date format '${rawDate || ''}'. Expected YYYY-MM-DD or standard date format`);
    } else if (parsedDate.getTime() > maxAllowedDateMs) {
      errors.push(`Future sales date '${rawDate}' is not allowed. Sales dates cannot be in the future.`);
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
      const skuVal = row.sku?.trim() || '';
      let isKnownProduct = true;
      if (knownProducts) {
        const matchesName = knownNameSet.has(productName.toLowerCase());
        const matchesSku = skuVal && knownSkuSet.has(skuVal.toLowerCase());
        isKnownProduct = Boolean(matchesName || matchesSku);
        if (!isKnownProduct) {
          unknownProductsSet.add(productName);
        }
      }

      validRows.push({
        rowNumber,
        date: parsedDate,
        productName,
        ...(skuVal ? { sku: skuVal } : {}),
        quantitySold: quantity,
        unitPrice: Number(unitPrice.toFixed(2)),
        totalRevenue: Number((quantity * unitPrice).toFixed(2)),
        isKnownProduct,
      });
    }
  });

  const unknownProducts = Array.from(unknownProductsSet);
  if (unknownProducts.length > 0) {
    warnings.push(
      `Found ${unknownProducts.length} product(s) not currently in your inventory catalog (${unknownProducts.join(', ')}). Consider adding them to Inventory first so stock levels and costs link automatically.`
    );
  }

  return {
    success: true,
    headers: presentHeaders,
    columnMapping,
    totalRows: rows.length,
    validCount: validRows.length,
    invalidCount: invalidRows.length,
    validRows,
    invalidRows,
    warnings,
    unknownProducts,
    preview: validRows.slice(0, 10),
  };
};

/**
 * Validate and parse Inventory CSV
 * Required columns (or aliases): productName, sku, category, costPrice, sellingPrice, stockQuantity, reorderThreshold
 * Optional column: leadTimeDays (defaults to 7 when omitted; must be >= 1 when provided)
 */
export const parseAndValidateInventoryCSV = async (buffer) => {
  const { headers, columnMapping, rows } = await parseCsvBuffer(buffer, INVENTORY_HEADER_ALIASES);

  if (rows.length === 0) {
    return {
      success: false,
      message: 'The uploaded CSV file is empty or contains no data rows.',
      headers: [],
      columnMapping: [],
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      warnings: [],
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
      message: `Missing required CSV column(s): ${missingHeaders.join(', ')}. Expected columns (or common aliases): productName, sku, category, costPrice, sellingPrice, stockQuantity, reorderThreshold`,
      headers: presentHeaders,
      columnMapping,
      totalRows: rows.length,
      validRows: [],
      invalidRows: [],
      warnings: [],
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
    const category = row.category?.trim() || 'General';

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

    // 8. Optional Supplier Lead Time (leadTimeDays) validation — default to 7 when omitted
    const rawLeadTime = row.leadtimedays !== undefined ? String(row.leadtimedays).trim() : '';
    let leadTimeDays = 7;
    if (rawLeadTime !== '') {
      const parsedLeadTime = Number(rawLeadTime);
      if (isNaN(parsedLeadTime) || parsedLeadTime < 1) {
        errors.push(`Supplier lead time (leadTimeDays) must be at least 1 day (found '${row.leadtimedays}')`);
      } else {
        leadTimeDays = Math.round(parsedLeadTime);
      }
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
        leadTimeDays,
      });
    }
  });

  return {
    success: true,
    headers: presentHeaders,
    columnMapping,
    totalRows: rows.length,
    validCount: validRows.length,
    invalidCount: invalidRows.length,
    validRows,
    invalidRows,
    warnings: [],
    preview: validRows.slice(0, 10),
  };
};
