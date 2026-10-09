import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sku: {
      type: String,
      required: [true, 'SKU or unique product code is required'],
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Product category is required'],
      trim: true,
      default: 'General',
    },
    costPrice: {
      type: Number,
      required: [true, 'Cost price is required'],
      min: [0, 'Cost price cannot be negative'],
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative'],
    },
    stockQuantity: {
      type: Number,
      required: [true, 'Current stock quantity is required'],
      default: 0,
      min: [0, 'Stock quantity cannot be negative'],
    },
    reorderThreshold: {
      type: Number,
      required: [true, 'Reorder threshold is required'],
      default: 10,
      min: [0, 'Reorder threshold cannot be negative'],
    },
    unit: {
      type: String,
      default: 'pcs',
      trim: true,
    },
    supplier: {
      type: String,
      trim: true,
      default: '',
    },
    leadTimeDays: {
      type: Number,
      default: 7,
      min: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure unique SKU per user/shop
productSchema.index({ userId: 1, sku: 1 }, { unique: true });
productSchema.index({ userId: 1, name: 1 });
productSchema.index({ userId: 1, category: 1 });

const Product = mongoose.model('Product', productSchema);
export default Product;
