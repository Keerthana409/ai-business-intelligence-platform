import express from 'express';
import {
  getSalesForecast,
  getProductDemandForecast,
  getInventoryRiskAnalysis,
  getForecastEvaluation,
} from '../controllers/forecastController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/sales', getSalesForecast);
router.get('/demand', getProductDemandForecast);
router.get('/inventory-risk', getInventoryRiskAnalysis);
router.get('/evaluation', getForecastEvaluation);

export default router;

