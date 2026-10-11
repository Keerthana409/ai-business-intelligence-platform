import mongoose from 'mongoose';

const decisionAuditSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Decision Origin & Linkage
    decisionSource: {
      type: String,
      enum: {
        values: ['recommendation', 'scenario', 'manual_action'],
        message: '{VALUE} is not a supported decision source',
      },
      required: true,
    },
    recommendationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recommendation',
      required: false,
    },
    scenarioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Scenario',
      required: false,
    },
    decisionType: {
      type: String,
      enum: {
        values: [
          'inventory_restock',
          'clearance_markdown',
          'price_optimization',
          'promotional_discount',
          'demand_stabilization',
        ],
        message: '{VALUE} is not a supported decision type',
      },
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Decision title is required'],
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: false,
      index: true,
    },
    productName: {
      type: String,
      trim: true,
      default: '',
    },
    sku: {
      type: String,
      trim: true,
      default: '',
    },

    // Implementation State (Explicitly separated from Acceptance)
    implementationStatus: {
      type: String,
      enum: ['implemented', 'cancelled', 'superseded'],
      default: 'implemented',
    },
    implementedAt: {
      type: Date,
      required: [true, 'Confirmed implementation date is required'],
      index: true,
    },
    implementationNotes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    implementedParameters: {
      quantityOrdered: { type: Number, default: 0 },
      unitCost: { type: Number, default: 0 }, // Per-unit wholesale cost ($/unit)
      costPrice: { type: Number, default: 0 }, // Alias synced with unitCost for backward compatibility
      oldPrice: { type: Number, default: 0 },
      newPrice: { type: Number, default: 0 },
      discountPercent: { type: Number, default: 0 },
      purchaseOutlay: { type: Number, default: 0 }, // Total order outlay: quantityOrdered * unitCost
      capitalInvested: { type: Number, default: 0 }, // Alias synced with purchaseOutlay for backward compatibility
    },

    // Observation Window Configuration
    observationWindowDays: {
      type: Number,
      enum: [7, 14, 30],
      default: 14,
    },

    // Baseline Metrics (Captured over window [t_impl - k, t_impl - 1])
    baselineMetrics: {
      capturedAt: { type: Date, default: Date.now },
      windowDays: { type: Number, default: 14 },
      stockAtImplementation: { type: Number, default: 0 },
      distinctTradingDays: { type: Number, default: 0 },
      totalUnitsSold: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      totalCOGS: { type: Number, default: 0 },
      grossProfit: { type: Number, default: null },
      averageDailyDemand: { type: Number, default: 0 },
      hasSufficientData: { type: Boolean, default: true },
    },

    // Post-Decision Realized Metrics (Observed over [t_impl + 1, min(t_now, t_impl + k)])
    postMetrics: {
      evaluatedAt: { type: Date, default: null },
      daysElapsed: { type: Number, default: 0 },
      isWindowCompleted: { type: Boolean, default: false },
      currentStock: { type: Number, default: 0 },
      distinctTradingDays: { type: Number, default: 0 },
      totalUnitsSold: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      totalCOGS: { type: Number, default: 0 },
      grossProfit: { type: Number, default: null },
      averageDailyDemand: { type: Number, default: 0 },
      minStockObserved: { type: Number, default: null },
      capitalRecovered: { type: Number, default: 0 }, // For dead stock clearance
      hasSufficientData: { type: Boolean, default: true },
    },

    // Simulation vs. Actual Reality Comparison (When linked to Module 7 Scenario)
    simulationComparison: {
      isLinked: { type: Boolean, default: false },
      isCompatible: { type: Boolean, default: false },
      projectedRevenue: { type: Number, default: null },
      actualRevenue: { type: Number, default: null },
      revenueVariance: { type: Number, default: null },
      revenueVariancePercent: { type: Number, default: null },
      projectedProfit: { type: Number, default: null },
      actualProfit: { type: Number, default: null },
      profitVariance: { type: Number, default: null },
      projectedUnits: { type: Number, default: null },
      actualUnits: { type: Number, default: null },
      unitsVariance: { type: Number, default: null },
      calibrationAssessment: {
        type: String,
        enum: ['aligned', 'overperformed', 'underperformed', 'not_applicable'],
        default: 'not_applicable',
      },
      explanation: { type: String, default: '' },
    },

    // Closed-Loop Outcome Evaluation
    evaluation: {
      status: {
        type: String,
        enum: ['in_observation', 'evaluated_matured', 'insufficient_data', 'abandoned'],
        default: 'in_observation',
      },
      outcomeRating: {
        type: String,
        enum: ['favorable', 'neutral', 'unfavorable', 'inconclusive', 'pending'],
        default: 'pending',
      },
      headline: { type: String, default: 'Observation window in progress' },
      stockoutAverted: { type: Boolean, default: null },
      deadCapitalRecovered: { type: Number, default: null },
      investmentCost: { type: Number, default: 0 },
      capitalValueSold: { type: Number, default: 0 },
      deltaRevenue: { type: Number, default: null },
      deltaUnits: { type: Number, default: null },
      deltaGrossProfit: { type: Number, default: null },
      incrementalNetBenefit: { type: Number, default: null },
      roiPercent: { type: Number, default: null }, // Strictly calculated when investmentCost > 0
      roiExplanation: { type: String, default: '' },
      empiricalVarianceDisclaimer: {
        type: String,
        default:
          'Observed metric variance represents empirical before-and-after performance during the evaluation window. Observational variance indicates correlation rather than isolated laboratory causation.',
      },
      evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    // Audit Trail
    auditHistory: [
      {
        action: { type: String, required: true },
        performedAt: { type: Date, default: Date.now },
        notes: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Multi-tenant indexes & compound queries
decisionAuditSchema.index({ userId: 1, createdAt: -1 });
decisionAuditSchema.index({ userId: 1, 'evaluation.status': 1 });
decisionAuditSchema.index({ userId: 1, decisionType: 1 });
decisionAuditSchema.index({ userId: 1, recommendationId: 1 }, { sparse: true });
decisionAuditSchema.index({ userId: 1, scenarioId: 1 }, { sparse: true });

const DecisionAudit = mongoose.model('DecisionAudit', decisionAuditSchema);
export default DecisionAudit;
