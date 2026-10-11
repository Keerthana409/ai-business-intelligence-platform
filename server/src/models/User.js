import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false, // Never return password in queries unless explicitly selected
    },
    businessName: {
      type: String,
      required: [true, 'Shop/Business name is required'],
      trim: true,
    },
    businessType: {
      type: String,
      required: [true, 'Shop category is required'],
      enum: {
        values: [
          'Grocery Store',
          'Supermarket',
          'Clothing & Fashion',
          'Electronics Store',
          'Pharmacy / Medical Store',
          'Other',
          'grocery',
          'grocery store',
          'supermarket',
          'clothing',
          'clothing & fashion',
          'electronics',
          'electronics store',
          'pharmacy',
          'pharmacy / medical store',
          'other',
          'general_retail',
        ],
        message: '{VALUE} is not a supported shop category',
      },
      default: 'Grocery Store',
    },
    role: {
      type: String,
      enum: ['owner', 'manager', 'staff'],
      default: 'owner',
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving if modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare candidate password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
