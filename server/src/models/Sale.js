import mongoose from 'mongoose';

const saleSchema = new mongoose.Schema(
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
      index: true,
    },
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    date: {
      type: Date,
      required: [true, 'Sale date is required'],
      default: Date.now,
      index: true,
    },
    quantitySold: {
      type: Number,
      required: [true, 'Quantity sold is required'],
      min: [1, 'Quantity sold must be at least 1'],
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit selling price is required'],
      min: [0, 'Unit price cannot be negative'],
    },
    totalRevenue: {
      type: Number,
      required: true,
      min: [0, 'Total revenue cannot be negative'],
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'credit', 'other'],
      default: 'cash',
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to ensure totalRevenue = quantitySold * unitPrice
saleSchema.pre('validate', function (next) {
  if (this.quantitySold !== undefined && this.unitPrice !== undefined) {
    this.totalRevenue = Number((this.quantitySold * this.unitPrice).toFixed(2));
  }
  next();
});

// Indexes for fast querying & multi-tenant isolation
saleSchema.index({ userId: 1, date: -1 });
saleSchema.index({ userId: 1, productName: 1 });
saleSchema.index({ userId: 1, productId: 1 });

const Sale = mongoose.model('Sale', saleSchema);
export default Sale;
