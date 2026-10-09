import express from 'express';
import { runSimulation, getScenarios } from '../controllers/scenarioController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

// Compatibility aliases for /api/simulation
router.post('/what-if', runSimulation);
router.post('/simulate', runSimulation);
router.get('/history', getScenarios);

export default router;
