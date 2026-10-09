import express from 'express';
import {
  implementDecision,
  getAudits,
  getAuditById,
  getAuditSummary,
  recalculateAudit,
  deleteAudit,
} from '../controllers/auditController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply JWT authentication protection across all decision audit endpoints
router.use(protect);

router.post('/implement', implementDecision);
router.post('/', implementDecision);
router.get('/summary', getAuditSummary);
router.get('/', getAudits);
router.get('/:id', getAuditById);
router.patch('/:id/recalculate', recalculateAudit);
router.delete('/:id', deleteAudit);

export default router;
