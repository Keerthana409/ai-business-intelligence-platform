import express from 'express';
import {
  runSimulation,
  saveScenario,
  getScenarios,
  getScenarioById,
  updateScenario,
  deleteScenario,
} from '../controllers/scenarioController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce JWT authentication across all scenario simulation endpoints
router.use(protect);

router.post('/simulate', runSimulation);
router.post('/', saveScenario);
router.get('/', getScenarios);
router.get('/:id', getScenarioById);
router.put('/:id', updateScenario);
router.delete('/:id', deleteScenario);

export default router;
