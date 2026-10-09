import express from 'express';
import {
  getSales,
  createSale,
  updateSale,
  deleteSale,
  getSalesTemplate,
  previewSalesCSV,
  importSalesCSV,
} from '../controllers/salesController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload, handleUploadError } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Apply auth protection to all sales endpoints
router.use(protect);

// CRUD Endpoints
router.route('/').get(getSales).post(createSale);
router.route('/:id').put(updateSale).delete(deleteSale);

// CSV Upload & Template Endpoints
router.get('/template', getSalesTemplate);
router.post('/preview-csv', upload.single('file'), handleUploadError, previewSalesCSV);
router.post('/import-csv', importSalesCSV);

export default router;
