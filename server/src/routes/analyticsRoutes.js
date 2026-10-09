import express from 'express';
import {
  getSummaryMetrics,
  getRevenueByProduct,
  getRevenueByCategory,
  getSalesOverTime,
  getInventoryStockAnalytics,
  getLowStockAnalytics,
} from '../controllers/analyticsController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/summary', getSummaryMetrics);
router.get('/revenue-by-product', getRevenueByProduct);
router.get('/revenue-by-category', getRevenueByCategory);
router.get('/sales-over-time', getSalesOverTime);
router.get('/inventory-stock', getInventoryStockAnalytics);
router.get('/low-stock', getLowStockAnalytics);

export default router;

