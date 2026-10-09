import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';

/**
 * @desc    Get real database-derived summary metrics for shop dashboard
 * @route   GET /api/analytics/summary
 * @access  Private
 */
export const getSummaryMetrics = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    // 1. Total products in inventory
    const totalProducts = await Product.countDocuments({ userId: req.user.id });

    // 2. Total sales transaction records
    const totalSalesCount = await Sale.countDocuments({ userId: req.user.id });

    // 3. Products at or below reorder threshold
    const lowStockCount = await Product.countDocuments({
      userId: req.user.id,
      $expr: { $lte: ['$stockQuantity', '$reorderThreshold'] },
    });

    // 4. Products completely out of stock (0 units)
    const outOfStockCount = await Product.countDocuments({
      userId: req.user.id,
      stockQuantity: 0,
    });

    // 5. Aggregate total recorded revenue and units sold
    const salesAggregation = await Sale.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalRevenue' },
          totalUnitsSold: { $sum: '$quantitySold' },
        },
      },
    ]);

    const totalRevenue = salesAggregation[0]?.totalRevenue
      ? Number(salesAggregation[0].totalRevenue.toFixed(2))
      : 0;
    const totalUnitsSold = salesAggregation[0]?.totalUnitsSold || 0;

    // 6. Recent low stock products (alerts)
    const lowStockProducts = await Product.find({
      userId: req.user.id,
      $expr: { $lte: ['$stockQuantity', '$reorderThreshold'] },
    })
      .sort({ stockQuantity: 1 })
      .limit(5)
      .select('name sku stockQuantity reorderThreshold category');

    // 7. Recent sales transactions
    const recentSales = await Sale.find({ userId: req.user.id })
      .sort({ date: -1, createdAt: -1 })
      .limit(5)
      .select('productName date quantitySold unitPrice totalRevenue');

    return res.status(200).json({
      status: 'success',
      data: {
        totalProducts,
        totalSalesCount,
        totalUnitsSold,
        totalRevenue,
        lowStockCount,
        outOfStockCount,
        lowStockProducts,
        recentSales,
        hasData: totalProducts > 0 || totalSalesCount > 0,
      },
    });
  } catch (error) {
    console.error('[Analytics Summary Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to calculate shop metrics',
    });
  }
};

/**
 * @desc    Get top revenue-generating products
 * @route   GET /api/analytics/revenue-by-product
 * @access  Private
 */
export const getRevenueByProduct = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const limit = parseInt(req.query.limit, 10) || 10;

    const data = await Sale.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: '$productName',
          totalRevenue: { $sum: '$totalRevenue' },
          quantitySold: { $sum: '$quantitySold' },
          transactionCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          productName: '$_id',
          totalRevenue: { $round: ['$totalRevenue', 2] },
          quantitySold: 1,
          transactionCount: 1,
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: limit },
    ]);

    return res.status(200).json({
      status: 'success',
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('[Revenue By Product Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to aggregate revenue by product',
    });
  }
};

/**
 * @desc    Get revenue distribution grouped by category
 *          Prefers linked productId, resolves unambiguous product name matches,
 *          and tags unlinked/ambiguous items as 'Uncategorized'.
 * @route   GET /api/analytics/revenue-by-category
 * @access  Private
 */
export const getRevenueByCategory = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    const data = await Sale.aggregate([
      { $match: { userId: userObjectId } },
      // 1. Lookup product by direct productId reference
      {
        $lookup: {
          from: 'products',
          let: { pid: '$productId', uId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$$pid', '$_id'] },
                    { $eq: ['$$uId', '$userId'] },
                  ],
                },
              },
            },
          ],
          as: 'productById',
        },
      },
      // 2. Lookup product by exact/case-insensitive name within user's catalog
      {
        $lookup: {
          from: 'products',
          let: { pName: '$productName', uId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$$uId', '$userId'] },
                    { $eq: [{ $toLower: '$$pName' }, { $toLower: '$name' }] },
                  ],
                },
              },
            },
          ],
          as: 'productsByName',
        },
      },
      // 3. Resolve category reliably
      {
        $addFields: {
          resolvedCategory: {
            $cond: {
              // Priority 1: Direct productId link matched
              if: { $gt: [{ $size: '$productById' }, 0] },
              then: { $arrayElemAt: ['$productById.category', 0] },
              else: {
                // Priority 2: Fallback to productsByName
                $cond: {
                  if: { $eq: [{ $size: '$productsByName' }, 0] },
                  then: 'Uncategorized',
                  else: {
                    // Check if distinct categories in matched products is exactly 1
                    $let: {
                      vars: {
                        distinctCategories: {
                          $setUnion: ['$productsByName.category', []],
                        },
                      },
                      in: {
                        $cond: {
                          if: { $eq: [{ $size: '$$distinctCategories' }, 1] },
                          then: { $arrayElemAt: ['$$distinctCategories', 0] },
                          else: 'Uncategorized', // Ambiguous product name with conflicting categories
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // 4. Group by resolved category
      {
        $group: {
          _id: { $ifNull: ['$resolvedCategory', 'Uncategorized'] },
          totalRevenue: { $sum: '$totalRevenue' },
          quantitySold: { $sum: '$quantitySold' },
          transactionCount: { $sum: 1 },
        },
      },
      // 5. Format projection
      {
        $project: {
          _id: 0,
          category: '$_id',
          totalRevenue: { $round: ['$totalRevenue', 2] },
          quantitySold: 1,
          transactionCount: 1,
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    return res.status(200).json({
      status: 'success',
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('[Revenue By Category Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to aggregate revenue by category',
    });
  }
};

/**
 * @desc    Get chronological sales time-series over date range
 * @route   GET /api/analytics/sales-over-time
 * @access  Private
 */
export const getSalesOverTime = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const { startDate, endDate, range } = req.query;

    const matchQuery = { userId: userObjectId };
    const dateFilter = {};

    // Support quick relative ranges or explicit date bounds
    if (range && !startDate && !endDate) {
      const now = new Date();
      if (range === '7d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        dateFilter.$gte = d;
      } else if (range === '30d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        dateFilter.$gte = d;
      } else if (range === '90d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 90);
        dateFilter.$gte = d;
      }
    } else {
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
    }

    if (Object.keys(dateFilter).length > 0) {
      matchQuery.date = dateFilter;
    }

    const data = await Sale.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$date' },
          },
          revenue: { $sum: '$totalRevenue' },
          unitsSold: { $sum: '$quantitySold' },
          transactionCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          revenue: { $round: ['$revenue', 2] },
          unitsSold: 1,
          transactionCount: 1,
        },
      },
      // Chronological ascending order
      { $sort: { date: 1 } },
    ]);

    return res.status(200).json({
      status: 'success',
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('[Sales Over Time Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to aggregate sales time-series',
    });
  }
};

/**
 * @desc    Get inventory stock quantities and compare with reorder thresholds
 * @route   GET /api/analytics/inventory-stock
 * @access  Private
 */
export const getInventoryStockAnalytics = async (req, res) => {
  try {
    const products = await Product.find({ userId: req.user.id })
      .sort({ stockQuantity: 1 })
      .select('name sku category stockQuantity reorderThreshold costPrice sellingPrice unit');

    const data = products.map((p) => {
      const isOutOfStock = p.stockQuantity === 0;
      const isLowStock = p.stockQuantity <= p.reorderThreshold;

      let status = 'In Stock';
      if (isOutOfStock) {
        status = 'Out of Stock';
      } else if (isLowStock) {
        status = 'Low Stock';
      }

      return {
        id: p._id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        stockQuantity: p.stockQuantity,
        reorderThreshold: p.reorderThreshold,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        stockValue: Number((p.stockQuantity * p.costPrice).toFixed(2)),
        isOutOfStock,
        isLowStock,
        status,
        unit: p.unit || 'pcs',
      };
    });

    return res.status(200).json({
      status: 'success',
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('[Inventory Stock Analytics Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve inventory stock analytics',
    });
  }
};

/**
 * @desc    Get actionable low-stock products, using each product's own reorderThreshold,
 *          and clearly distinguishing out-of-stock items from low-stock items.
 * @route   GET /api/analytics/low-stock
 * @access  Private
 */
export const getLowStockAnalytics = async (req, res) => {
  try {
    const products = await Product.find({
      userId: req.user.id,
      $expr: { $lte: ['$stockQuantity', '$reorderThreshold'] },
    }).select('name sku category stockQuantity reorderThreshold costPrice sellingPrice unit leadTimeDays');

    const data = products.map((p) => {
      const deficit = Math.max(0, p.reorderThreshold - p.stockQuantity);
      const isOutOfStock = p.stockQuantity === 0;

      let status = 'Low Stock';
      if (isOutOfStock) {
        status = 'Out of Stock';
      } else if (p.stockQuantity <= Math.ceil(p.reorderThreshold / 2)) {
        status = 'Critical';
      }

      // Restock recommendation target (double threshold minus current stock)
      const suggestedRestock = Math.max(1, p.reorderThreshold * 2 - p.stockQuantity);

      return {
        id: p._id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        stockQuantity: p.stockQuantity,
        reorderThreshold: p.reorderThreshold,
        deficit,
        isOutOfStock,
        status,
        suggestedRestock,
        unit: p.unit || 'pcs',
        leadTimeDays: p.leadTimeDays || 7,
      };
    });

    // Prioritize out of stock first, then largest deficit, then lowest stock
    data.sort((a, b) => {
      if (a.isOutOfStock && !b.isOutOfStock) return -1;
      if (!a.isOutOfStock && b.isOutOfStock) return 1;
      return b.deficit - a.deficit || a.stockQuantity - b.stockQuantity;
    });

    return res.status(200).json({
      status: 'success',
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('[Low Stock Analytics Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve low-stock analytics',
    });
  }
};
