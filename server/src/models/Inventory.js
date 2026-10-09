import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema(
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
      required: true,
      unique: true,
    },
    currentStock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    safetyStock: {
      type: Number,
      default: 0,
    },
    reorderPoint: {
      type: Number,
      default: 0,
    },
    recommendedOrderQty: {
      type: Number,
      default: 0,
    },
    stockoutRiskScore: {
      type: Number, // 0 to 100 percentage
      default: 0,
    },
    abcCategory: {
      type: String,
      enum: ['A', 'B', 'C', 'Unclassified'],
      default: 'Unclassified',
    },
    lastRestockedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

inventorySchema.index({ userId: 1, currentStock: 1 });

const Inventory = mongoose.model('Inventory', inventorySchema);
export default Inventory;
