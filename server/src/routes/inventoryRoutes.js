import express from 'express';
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getInventoryTemplate,
  previewInventoryCSV,
  importInventoryCSV,
} from '../controllers/inventoryController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload, handleUploadError } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Apply auth protection to all inventory endpoints
router.use(protect);

// CRUD Endpoints
router.route('/').get(getProducts).post(createProduct);
router.route('/:id').put(updateProduct).delete(deleteProduct);

// CSV Upload & Template Endpoints
router.get('/template', getInventoryTemplate);
router.post('/preview-csv', upload.single('file'), handleUploadError, previewInventoryCSV);
router.post('/import-csv', importInventoryCSV);

export default router;
