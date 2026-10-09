import express from 'express';
import { registerUser, loginUser, getUserProfile } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public Authentication Endpoints
router.post('/register', registerUser);
router.post('/login', loginUser);

// Private / Protected Endpoints
router.get('/profile', protect, getUserProfile);

export default router;
