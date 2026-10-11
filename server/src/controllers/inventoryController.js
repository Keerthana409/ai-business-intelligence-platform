import Product from '../models/Product.js';
import { parseAndValidateInventoryCSV } from '../utils/csvParser.js';

/**
 * @desc    Get all inventory products for authenticated user
 * @route   GET /api/inventory
 * @access  Private
 */
export const getProducts = async (req, res) => {
  try {
    const { search, category, lowStock } = req.query;
    const query = { userId: req.user.id };

    if (search) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { sku: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    if (category && category.toLowerCase() !== 'all') {
      query.category = { $regex: `^${category.trim()}$`, $options: 'i' };
    }

    if (lowStock === 'true') {
      query.$expr = { $lte: ['$stockQuantity', '$reorderThreshold'] };
    }

    const products = await Product.find(query).sort({ createdAt: -1 });

    return res.status(200).json({
      status: 'success',
      count: products.length,
      data: { products },
    });
  } catch (error) {
    console.error('[Get Products Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve products',
    });
  }
};

/**
 * @desc    Add a single product manually
 * @route   POST /api/inventory
 * @access  Private
 */
export const createProduct = async (req, res) => {
  try {
    const {
      sku,
      name,
      category,
      costPrice,
      sellingPrice,
      stockQuantity,
      reorderThreshold,
      leadTimeDays,
      unit,
      supplier,
    } = req.body;

    if (!sku || !name || costPrice === undefined || sellingPrice === undefined) {
      return res.status(400).json({
        status: 'fail',
        message: 'Product name, SKU, cost price, and selling price are required',
      });
    }

    if (Number(costPrice) < 0 || Number(sellingPrice) < 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cost price and selling price cannot be negative',
      });
    }

    if (Number(stockQuantity) < 0 || Number(reorderThreshold) < 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Stock quantity and reorder threshold cannot be negative',
      });
    }

    const resolvedLeadTime =
      leadTimeDays !== undefined && leadTimeDays !== null && String(leadTimeDays).trim() !== ''
        ? Number(leadTimeDays)
        : 7;

    if (isNaN(resolvedLeadTime) || resolvedLeadTime < 1) {
      return res.status(400).json({
        status: 'fail',
        message: 'Supplier lead time (leadTimeDays) must be at least 1 day',
      });
    }

    // Check duplicate SKU for this user
    const existing = await Product.findOne({
      userId: req.user.id,
      sku: sku.trim(),
    });

    if (existing) {
      return res.status(400).json({
        status: 'fail',
        message: `A product with SKU code '${sku.trim()}' already exists in your inventory.`,
      });
    }

    const product = await Product.create({
      userId: req.user.id,
      sku: sku.trim(),
      name: name.trim(),
      category: category ? category.trim() : 'General',
      costPrice: Number(costPrice),
      sellingPrice: Number(sellingPrice),
      stockQuantity: stockQuantity !== undefined ? Number(stockQuantity) : 0,
      reorderThreshold: reorderThreshold !== undefined ? Number(reorderThreshold) : 10,
      leadTimeDays: Math.round(resolvedLeadTime),
      unit: unit || 'pcs',
      supplier: supplier || '',
    });

    return res.status(201).json({
      status: 'success',
      message: 'Product added successfully',
      data: { product },
    });
  } catch (error) {
    console.error('[Create Product Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create product',
    });
  }
};

/**
 * @desc    Update product information
 * @route   PUT /api/inventory/:id
 * @access  Private
 */
export const updateProduct = async (req, res) => {
  try {
    const {
      sku,
      name,
      category,
      costPrice,
      sellingPrice,
      stockQuantity,
      reorderThreshold,
      leadTimeDays,
      unit,
      supplier,
    } = req.body;

    const product = await Product.findOne({ _id: req.params.id, userId: req.user.id });

    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }

    if (leadTimeDays !== undefined && leadTimeDays !== null && String(leadTimeDays).trim() !== '') {
      const parsedLead = Number(leadTimeDays);
      if (isNaN(parsedLead) || parsedLead < 1) {
        return res.status(400).json({
          status: 'fail',
          message: 'Supplier lead time (leadTimeDays) must be at least 1 day',
        });
      }
      product.leadTimeDays = Math.round(parsedLead);
    }

    // Check if new SKU clashes with another product
    if (sku && sku.trim().toLowerCase() !== product.sku.toLowerCase()) {
      const existing = await Product.findOne({
        userId: req.user.id,
        sku: sku.trim(),
        _id: { $ne: product._id },
      });
      if (existing) {
        return res.status(400).json({
          status: 'fail',
          message: `SKU code '${sku.trim()}' is already used by another product.`,
        });
      }
      product.sku = sku.trim();
    }

    if (name) product.name = name.trim();
    if (category) product.category = category.trim();
    if (costPrice !== undefined) product.costPrice = Math.max(0, Number(costPrice));
    if (sellingPrice !== undefined) product.sellingPrice = Math.max(0, Number(sellingPrice));
    if (stockQuantity !== undefined) product.stockQuantity = Math.max(0, Number(stockQuantity));
    if (reorderThreshold !== undefined) product.reorderThreshold = Math.max(0, Number(reorderThreshold));
    if (unit !== undefined) product.unit = unit.trim();
    if (supplier !== undefined) product.supplier = supplier.trim();

    await product.save();

    return res.status(200).json({
      status: 'success',
      message: 'Product updated successfully',
      data: { product },
    });
  } catch (error) {
    console.error('[Update Product Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update product',
    });
  }
};

/**
 * @desc    Delete product
 * @route   DELETE /api/inventory/:id
 * @access  Private
 */
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, userId: req.user.id });

    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: `Product '${product.name}' deleted successfully`,
    });
  } catch (error) {
    console.error('[Delete Product Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete product',
    });
  }
};

/**
 * @desc    Download standard CSV template for Inventory
 * @route   GET /api/inventory/template
 * @access  Private
 */
export const getInventoryTemplate = (req, res) => {
  const templateCsv =
    'productName,sku,category,costPrice,sellingPrice,stockQuantity,reorderThreshold,leadTimeDays\n' +
    'Milk,S001,Grocery,22.00,30.00,60,15,7\n' +
    'Wheat Flour,S004,Grocery,38.00,50.00,50,15,7\n' +
    'Rice,S005,Supermarket,60.00,80.00,45,10,7\n';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory_template.csv"');
  return res.status(200).send(templateCsv);
};

/**
 * @desc    Preview and validate Inventory CSV file without writing to DB
 * @route   POST /api/inventory/preview-csv
 * @access  Private
 */
export const previewInventoryCSV = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please upload a CSV file',
      });
    }

    const validationResult = await parseAndValidateInventoryCSV(req.file.buffer);

    return res.status(200).json({
      status: 'success',
      data: validationResult,
    });
  } catch (error) {
    console.error('[Preview Inventory CSV Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to process CSV file',
    });
  }
};

/**
 * @desc    Confirm and import validated inventory rows into MongoDB
 * @route   POST /api/inventory/import-csv
 * @access  Private
 */
export const importInventoryCSV = async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'No valid inventory items provided for import',
      });
    }

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of items) {
      // Validate item integrity
      if (!item.sku || !item.name) continue;

      const filter = { userId: req.user.id, sku: item.sku.trim() };
      const existing = await Product.findOne(filter);
      const itemLeadTime =
        item.leadTimeDays !== undefined && Number(item.leadTimeDays) >= 1
          ? Math.round(Number(item.leadTimeDays))
          : 7;

      if (existing) {
        existing.name = item.name.trim();
        existing.category = item.category?.trim() || existing.category;
        existing.costPrice = Number(item.costPrice);
        existing.sellingPrice = Number(item.sellingPrice);
        existing.stockQuantity = Number(item.stockQuantity);
        existing.reorderThreshold = Number(item.reorderThreshold);
        if (item.leadTimeDays !== undefined) {
          existing.leadTimeDays = itemLeadTime;
        }
        await existing.save();
        updatedCount++;
      } else {
        await Product.create({
          userId: req.user.id,
          sku: item.sku.trim(),
          name: item.name.trim(),
          category: item.category?.trim() || 'General',
          costPrice: Number(item.costPrice),
          sellingPrice: Number(item.sellingPrice),
          stockQuantity: Number(item.stockQuantity),
          reorderThreshold: Number(item.reorderThreshold),
          leadTimeDays: itemLeadTime,
        });
        createdCount++;
      }
    }

    return res.status(200).json({
      status: 'success',
      message: `Successfully imported ${createdCount + updatedCount} products (${createdCount} added, ${updatedCount} updated).`,
      data: {
        totalProcessed: items.length,
        createdCount,
        updatedCount,
      },
    });
  } catch (error) {
    console.error('[Import Inventory CSV Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to import inventory items',
    });
  }
};
