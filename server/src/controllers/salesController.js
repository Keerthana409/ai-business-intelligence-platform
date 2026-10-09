import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import { parseAndValidateSalesCSV } from '../utils/csvParser.js';

/**
 * @desc    Get all sales records for authenticated user
 * @route   GET /api/sales
 * @access  Private
 */
export const getSales = async (req, res) => {
  try {
    const { startDate, endDate, search, productId } = req.query;
    const query = { userId: req.user.id };

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    // Product search or filter
    if (productId) {
      query.productId = productId;
    } else if (search) {
      query.productName = { $regex: search.trim(), $options: 'i' };
    }

    const sales = await Sale.find(query).sort({ date: -1, createdAt: -1 });

    return res.status(200).json({
      status: 'success',
      count: sales.length,
      data: { sales },
    });
  } catch (error) {
    console.error('[Get Sales Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve sales records',
    });
  }
};

/**
 * @desc    Add a sales record manually and update product stock
 * @route   POST /api/sales
 * @access  Private
 */
export const createSale = async (req, res) => {
  try {
    const { productName, productId, quantitySold, unitPrice, date, paymentMethod } = req.body;

    if (!productName || quantitySold === undefined || unitPrice === undefined) {
      return res.status(400).json({
        status: 'fail',
        message: 'Product name, quantity sold, and unit price are required',
      });
    }

    const qty = Number(quantitySold);
    const price = Number(unitPrice);

    if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Quantity sold must be a positive whole number (at least 1)',
      });
    }

    if (isNaN(price) || price < 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Unit selling price cannot be negative',
      });
    }

    let linkedProduct = null;
    let resolvedProductId = null;

    // Check if productId provided or find matching product by name
    if (productId) {
      linkedProduct = await Product.findOne({ _id: productId, userId: req.user.id });
    } else {
      linkedProduct = await Product.findOne({
        userId: req.user.id,
        name: { $regex: `^${productName.trim()}$`, $options: 'i' },
      });
    }

    if (linkedProduct) {
      resolvedProductId = linkedProduct._id;
      // Deduct stock safely (cannot go below 0)
      linkedProduct.stockQuantity = Math.max(0, linkedProduct.stockQuantity - qty);
      await linkedProduct.save();
    }

    const sale = await Sale.create({
      userId: req.user.id,
      productId: resolvedProductId,
      productName: productName.trim(),
      quantitySold: qty,
      unitPrice: Number(price.toFixed(2)),
      totalRevenue: Number((qty * price).toFixed(2)),
      date: date ? new Date(date) : new Date(),
      paymentMethod: paymentMethod || 'cash',
    });

    return res.status(201).json({
      status: 'success',
      message: 'Sale record created successfully',
      data: { sale },
    });
  } catch (error) {
    console.error('[Create Sale Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create sale record',
    });
  }
};

/**
 * @desc    Edit a sales record and adjust inventory stock
 * @route   PUT /api/sales/:id
 * @access  Private
 */
export const updateSale = async (req, res) => {
  try {
    const { productName, quantitySold, unitPrice, date, paymentMethod } = req.body;

    const sale = await Sale.findOne({ _id: req.params.id, userId: req.user.id });
    if (!sale) {
      return res.status(404).json({
        status: 'fail',
        message: 'Sale record not found',
      });
    }

    const oldQty = sale.quantitySold;
    let newQty = oldQty;

    if (quantitySold !== undefined) {
      newQty = Number(quantitySold);
      if (isNaN(newQty) || newQty <= 0 || !Number.isInteger(newQty)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Quantity sold must be a positive integer',
        });
      }

      // If linked product exists, adjust stock by the delta
      if (sale.productId) {
        const product = await Product.findOne({ _id: sale.productId, userId: req.user.id });
        if (product) {
          const delta = newQty - oldQty;
          product.stockQuantity = Math.max(0, product.stockQuantity - delta);
          await product.save();
        }
      }

      sale.quantitySold = newQty;
    }

    if (unitPrice !== undefined) {
      const price = Number(unitPrice);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'Unit price cannot be negative',
        });
      }
      sale.unitPrice = Number(price.toFixed(2));
    }

    if (productName) sale.productName = productName.trim();
    if (date) sale.date = new Date(date);
    if (paymentMethod) sale.paymentMethod = paymentMethod;

    // Recalculate revenue
    sale.totalRevenue = Number((sale.quantitySold * sale.unitPrice).toFixed(2));
    await sale.save();

    return res.status(200).json({
      status: 'success',
      message: 'Sale record updated successfully',
      data: { sale },
    });
  } catch (error) {
    console.error('[Update Sale Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update sale record',
    });
  }
};

/**
 * @desc    Delete sales record and restore inventory stock
 * @route   DELETE /api/sales/:id
 * @access  Private
 */
export const deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!sale) {
      return res.status(404).json({
        status: 'fail',
        message: 'Sale record not found',
      });
    }

    // Restore stock if linked to a product
    if (sale.productId) {
      const product = await Product.findOne({ _id: sale.productId, userId: req.user.id });
      if (product) {
        product.stockQuantity += sale.quantitySold;
        await product.save();
      }
    }

    return res.status(200).json({
      status: 'success',
      message: 'Sale record deleted and inventory stock restored',
    });
  } catch (error) {
    console.error('[Delete Sale Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete sale record',
    });
  }
};

/**
 * @desc    Download standard CSV template for Sales
 * @route   GET /api/sales/template
 * @access  Private
 */
export const getSalesTemplate = (req, res) => {
  const templateCsv =
    'date,productName,quantity,unitPrice\n' +
    '2026-10-01,Organic Whole Milk 1L,4,3.20\n' +
    '2026-10-01,Cotton T-Shirt Blue,2,24.99\n' +
    '2026-10-02,Basmati Rice 5kg,1,14.50\n';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sales_template.csv"');
  return res.status(200).send(templateCsv);
};

/**
 * @desc    Preview and validate Sales CSV file without writing to DB
 * @route   POST /api/sales/preview-csv
 * @access  Private
 */
export const previewSalesCSV = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please upload a CSV file',
      });
    }

    const validationResult = await parseAndValidateSalesCSV(req.file.buffer);

    return res.status(200).json({
      status: 'success',
      data: validationResult,
    });
  } catch (error) {
    console.error('[Preview Sales CSV Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to process Sales CSV file',
    });
  }
};

/**
 * @desc    Confirm and import validated sales rows into MongoDB
 * @route   POST /api/sales/import-csv
 * @access  Private
 */
export const importSalesCSV = async (req, res) => {
  try {
    const { items, deductStock } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'No valid sales items provided for import',
      });
    }

    let importedCount = 0;

    for (const item of items) {
      if (!item.productName || !item.quantitySold || item.unitPrice === undefined) {
        continue;
      }

      // Look up existing product by name in user's catalog to link
      const product = await Product.findOne({
        userId: req.user.id,
        name: { $regex: `^${item.productName.trim()}$`, $options: 'i' },
      });

      let productId = null;
      if (product) {
        productId = product._id;
        // Optionally deduct stock if user selected stock deduction
        if (deductStock) {
          product.stockQuantity = Math.max(0, product.stockQuantity - item.quantitySold);
          await product.save();
        }
      }

      await Sale.create({
        userId: req.user.id,
        productId,
        productName: item.productName.trim(),
        quantitySold: Number(item.quantitySold),
        unitPrice: Number(item.unitPrice),
        totalRevenue: Number((item.quantitySold * item.unitPrice).toFixed(2)),
        date: item.date ? new Date(item.date) : new Date(),
      });

      importedCount++;
    }

    return res.status(200).json({
      status: 'success',
      message: `Successfully imported ${importedCount} sales transactions.`,
      data: {
        importedCount,
        totalProvided: items.length,
      },
    });
  } catch (error) {
    console.error('[Import Sales CSV Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to import sales transactions',
    });
  }
};
