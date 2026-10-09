import express from 'express';
import {
  getRecommendations,
  updateRecommendationStatus,
  getRecommendationSummary,
} from '../controllers/recommendationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce JWT authentication on all recommendation decision support endpoints
router.use(protect);

router.get('/', getRecommendations);
router.get('/summary', getRecommendationSummary);
router.patch('/:id/status', updateRecommendationStatus);

export default router;
