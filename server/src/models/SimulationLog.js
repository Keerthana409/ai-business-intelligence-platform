import mongoose from 'mongoose';

const simulationLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    scenarioName: {
      type: String,
      required: true,
      trim: true,
    },
    simulationType: {
      type: String,
      enum: ['price_change', 'demand_surge', 'supplier_lead_time_delay', 'discount_campaign'],
      required: true,
    },
    parameters: {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      priceDeltaPercent: Number,
      costDeltaPercent: Number,
      demandDeltaPercent: Number,
      leadTimeDays: Number,
      priceElasticityEstimate: Number,
    },
    baselineMetrics: {
      revenue: Number,
      profit: Number,
      unitsSold: Number,
      stockoutDays: Number,
    },
    projectedMetrics: {
      revenue: Number,
      profit: Number,
      unitsSold: Number,
      stockoutDays: Number,
    },
    variancePercent: {
      revenueChange: Number,
      profitChange: Number,
    },
  },
  {
    timestamps: true,
  }
);

const SimulationLog = mongoose.model('SimulationLog', simulationLogSchema);
export default SimulationLog;
