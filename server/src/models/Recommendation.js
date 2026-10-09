import mongoose from 'mongoose';

const recommendationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: false,
    },
    dedupKey: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        'reorder_urgency',
        'high_demand_stockout_risk',
        'declining_sales_alert',
        'slow_moving_overstock',
        'anomaly_investigation',
        'overstock_clearance',
        'price_optimization',
        'seasonal_adjustment',
      ],
      required: true,
    },
    category: {
      type: String,
      enum: ['Restock Urgency', 'Inventory Optimization', 'Demand Trends', 'Store Operations'],
      default: 'Inventory Optimization',
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
    },
    actionProposed: {
      type: String,
      required: true,
    },
    isDataSufficient: {
      type: Boolean,
      default: true,
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Explainable AI metrics - why this was triggered
    explanation: {
      ruleTriggered: { type: String, required: true },
      factors: [
        {
          metric: String,
          value: Number,
          threshold: Number,
          description: String,
        },
      ],
    },
    // Status tracking
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'completed'],
      default: 'pending',
    },
    // Module 8: Recommendation outcome tracking
    outcomeTracking: {
      actionTakenDate: Date,
      preMetricValue: Number,
      postMetricValue: Number,
      observedImpact: String,
      measuredSuccess: Boolean,
    },
  },
  {
    timestamps: true,
  }
);

recommendationSchema.index({ userId: 1, dedupKey: 1 }, { unique: true });
recommendationSchema.index({ userId: 1, status: 1 });

const Recommendation = mongoose.model('Recommendation', recommendationSchema);
export default Recommendation;
