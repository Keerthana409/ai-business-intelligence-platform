import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Scenario from '../models/Scenario.js';
import {
  simulatePriceChange,
  simulateDemandChange,
  simulateInventoryReorder,
  simulateDiscount,
} from '../utils/scenarioEngine.js';
import { evaluateProductDemandRisk } from '../utils/forecastingEngine.js';

/**
 * Escape regular expression special characters in string
 */
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Helper to fetch product-specific sales for authenticated user
 */
const fetchProductSales = async (userId, productId, productName) => {
  const queryConditions = [];

  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    queryConditions.push({ productId: new mongoose.Types.ObjectId(productId) });
  }

  if (productName && typeof productName === 'string' && productName.trim().length > 0) {
    const cleanName = productName.trim();
    queryConditions.push({
      productName: {
        $regex: new RegExp(`^${escapeRegex(cleanName)}$`, 'i'),
      },
    });
  }

  if (queryConditions.length === 0) {
    return [];
  }

  return Sale.find({
    userId,
    $or: queryConditions,
  }).sort({ date: 1 });
};

/**
 * @desc    Execute in-memory what-if simulation (Non-destructive)
 * @route   POST /api/scenarios/simulate (also /api/simulation/what-if)
 * @access  Private (JWT protected)
 */
export const runSimulation = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const {
      scenarioType,
      productId,
      // Price change inputs
      proposedPrice,
      priceChangePercent,
      demandMode = 'constant',
      demandChangePercent,
      // Demand change inputs
      simulationPeriodDays = 30,
      // Inventory reorder inputs
      currentStock,
      proposedOrderQuantity,
      leadTimeDays,
      safetyStockTarget,
      // Discount inputs
      discountPercent,
      hypotheticalDemandChangePercent,
    } = req.body;

    const validTypes = ['price_change', 'demand_change', 'inventory_reorder', 'discount'];
    if (!scenarioType || !validTypes.includes(scenarioType)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid scenarioType. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Resolve product if productId provided
    let product = null;
    if (productId) {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid product ID format',
        });
      }

      product = await Product.findOne({ _id: productId, userId });
      if (!product) {
        return res.status(404).json({
          status: 'fail',
          message: 'Product not found or access denied',
        });
      }
    } else {
      // Create a fallback product from request body if simulating a generic item
      product = {
        name: req.body.productName || 'Simulated Product',
        sku: req.body.sku || 'SIM-001',
        sellingPrice: Number(req.body.sellingPrice) || 0,
        costPrice: req.body.costPrice !== undefined ? Number(req.body.costPrice) : null,
        stockQuantity: Number(req.body.currentStock) || 0,
        reorderThreshold: Number(req.body.reorderThreshold) || 10,
        leadTimeDays: Number(req.body.leadTimeDays) || 7,
      };
    }

    // Fetch user-scoped historical sales for this product
    const historicalSales = product._id
      ? await fetchProductSales(userId, product._id, product.name)
      : [];

    let simulationResult;

    switch (scenarioType) {
      case 'price_change': {
        simulationResult = simulatePriceChange({
          product,
          proposedPrice,
          priceChangePercent,
          demandMode,
          demandChangePercent,
          historicalSales,
        });
        break;
      }

      case 'demand_change': {
        simulationResult = simulateDemandChange({
          product,
          demandChangePercent,
          historicalSales,
          simulationPeriodDays,
        });
        break;
      }

      case 'inventory_reorder': {
        const effectiveLeadTime = Math.max(
          1,
          Math.round(Number(leadTimeDays || product.leadTimeDays || 7))
        );
        // Evaluate historical demand velocity from forecasting engine
        const demandRisk = evaluateProductDemandRisk({
          salesRecords: historicalSales.map((s) => ({ date: s.date, quantity: s.quantitySold })),
          stockQuantity: product.stockQuantity || 0,
          reorderThreshold: product.reorderThreshold || 10,
          leadTimeDays: effectiveLeadTime,
          horizon: 7,
        });

        simulationResult = simulateInventoryReorder({
          product,
          currentStock,
          proposedOrderQuantity,
          leadTimeDays: effectiveLeadTime,
          safetyStockTarget,
          historicalDemand: {
            hasSufficientData: demandRisk.hasSufficientData,
            avgDailyDemand: demandRisk.avgDailyDemand,
            distinctRecordedDays: demandRisk.distinctRecordedDays,
          },
        });
        break;
      }

      case 'discount': {
        simulationResult = simulateDiscount({
          product,
          discountPercent,
          hypotheticalDemandChangePercent,
          historicalSales,
        });
        break;
      }

      default:
        return res.status(400).json({
          status: 'fail',
          message: `Unsupported scenario type '${scenarioType}'`,
        });
    }

    return res.status(200).json({
      status: 'success',
      data: simulationResult,
    });
  } catch (error) {
    console.error('[Run Simulation Error]:', error);
    return res.status(400).json({
      status: 'fail',
      message: error.message || 'Failed to execute what-if simulation',
    });
  }
};

/**
 * @desc    Save a what-if scenario record for authenticated user
 * @route   POST /api/scenarios
 * @access  Private (JWT protected)
 */
export const saveScenario = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const {
      name,
      description = '',
      scenarioType,
      productId,
      productName,
      inputs,
      baselineResults,
      simulatedResults,
      comparison,
      timeline,
      profitMatch,
      assumptions = [],
      limitations = [],
    } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Scenario name is required',
      });
    }

    const validTypes = ['price_change', 'demand_change', 'inventory_reorder', 'discount'];
    if (!scenarioType || !validTypes.includes(scenarioType)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid scenarioType. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    let resolvedProductName = productName || '';
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      const prod = await Product.findOne({ _id: productId, userId });
      if (prod) {
        resolvedProductName = prod.name;
      }
    }

    const scenario = await Scenario.create({
      userId,
      name: name.trim(),
      description: description.trim(),
      scenarioType,
      productId: productId && mongoose.Types.ObjectId.isValid(productId) ? productId : undefined,
      productName: resolvedProductName,
      inputs: inputs || {},
      baselineResults: baselineResults || {},
      simulatedResults: simulatedResults || {},
      comparison: comparison || {},
      timeline: timeline || null,
      profitMatch: profitMatch || null,
      assumptions: Array.isArray(assumptions) ? assumptions : [],
      limitations: Array.isArray(limitations) ? limitations : [],
      isSnapshot: true,
    });

    return res.status(201).json({
      status: 'success',
      message: 'Scenario successfully saved',
      data: { scenario },
    });
  } catch (error) {
    console.error('[Save Scenario Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to save scenario',
    });
  }
};

/**
 * @desc    List all saved scenarios for authenticated user
 * @route   GET /api/scenarios (also /api/simulation/history)
 * @access  Private (JWT protected)
 */
export const getScenarios = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { scenarioType, productId } = req.query;

    const query = { userId };
    if (scenarioType && scenarioType !== 'all') {
      query.scenarioType = scenarioType;
    }
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      query.productId = new mongoose.Types.ObjectId(productId);
    }

    const scenarios = await Scenario.find(query)
      .populate('productId', 'name sku sellingPrice costPrice stockQuantity')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 'success',
      data: {
        total: scenarios.length,
        scenarios,
      },
    });
  } catch (error) {
    console.error('[Get Scenarios Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to retrieve scenarios',
    });
  }
};

/**
 * @desc    Get single saved scenario by ID
 * @route   GET /api/scenarios/:id
 * @access  Private (JWT protected)
 */
export const getScenarioById = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid scenario ID format',
      });
    }

    const scenario = await Scenario.findOne({ _id: id, userId }).populate(
      'productId',
      'name sku sellingPrice costPrice stockQuantity'
    );

    if (!scenario) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scenario not found or access denied',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: { scenario },
    });
  } catch (error) {
    console.error('[Get Scenario By ID Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to retrieve scenario',
    });
  }
};

/**
 * @desc    Update a saved scenario (name, description, or parameters)
 * @route   PUT /api/scenarios/:id
 * @access  Private (JWT protected)
 */
export const updateScenario = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { id } = req.params;
    const { name, description, inputs, baselineResults, simulatedResults, comparison, timeline, profitMatch } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid scenario ID format',
      });
    }

    const scenario = await Scenario.findOne({ _id: id, userId });
    if (!scenario) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scenario not found or access denied',
      });
    }

    if (name !== undefined) scenario.name = name.trim();
    if (description !== undefined) scenario.description = description.trim();
    if (inputs !== undefined) scenario.inputs = inputs;
    if (baselineResults !== undefined) scenario.baselineResults = baselineResults;
    if (simulatedResults !== undefined) scenario.simulatedResults = simulatedResults;
    if (comparison !== undefined) scenario.comparison = comparison;
    if (timeline !== undefined) scenario.timeline = timeline;
    if (profitMatch !== undefined) scenario.profitMatch = profitMatch;

    await scenario.save();

    return res.status(200).json({
      status: 'success',
      message: 'Scenario successfully updated',
      data: { scenario },
    });
  } catch (error) {
    console.error('[Update Scenario Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update scenario',
    });
  }
};

/**
 * @desc    Delete a saved scenario
 * @route   DELETE /api/scenarios/:id
 * @access  Private (JWT protected)
 */
export const deleteScenario = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid scenario ID format',
      });
    }

    const scenario = await Scenario.findOneAndDelete({ _id: id, userId });
    if (!scenario) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scenario not found or access denied',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Scenario successfully deleted',
      data: { id },
    });
  } catch (error) {
    console.error('[Delete Scenario Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete scenario',
    });
  }
};
