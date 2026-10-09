import mongoose from 'mongoose';

const scenarioSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Scenario name is required'],
      trim: true,
      maxlength: [120, 'Scenario name cannot exceed 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    scenarioType: {
      type: String,
      required: [true, 'Scenario type is required'],
      enum: {
        values: ['price_change', 'demand_change', 'inventory_reorder', 'discount'],
        message: '{VALUE} is not a supported scenario type',
      },
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
    inputs: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },
    baselineResults: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    simulatedResults: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    comparison: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timeline: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    profitMatch: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    assumptions: {
      type: [String],
      default: [],
    },
    limitations: {
      type: [String],
      default: [],
    },
    isSnapshot: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for user-level isolation and fast filtering
scenarioSchema.index({ userId: 1, createdAt: -1 });
scenarioSchema.index({ userId: 1, scenarioType: 1 });
scenarioSchema.index({ userId: 1, productId: 1 });

const Scenario = mongoose.model('Scenario', scenarioSchema);
export default Scenario;
