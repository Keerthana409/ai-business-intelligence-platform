import express from 'express';
import {
  getDailyAnomalies,
  getTransactionOutliers,
  getAnomalySummary,
} from '../controllers/anomalyController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply JWT authentication to all anomaly intelligence endpoints
router.use(protect);

router.get('/daily', getDailyAnomalies);
router.get('/transactions', getTransactionOutliers);
router.get('/summary', getAnomalySummary);

export default router;
