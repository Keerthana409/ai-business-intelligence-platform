import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Generate signed JWT token
 */
const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET || 'retail_bi_platform_jwt_secret_key_2026_secure_default';
  return jwt.sign({ id: userId }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * @desc    Register a new retail business user
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, businessName, businessType } = req.body;

    // 1. Validate required fields
    if (!name || !email || !password || !businessName) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide full name, email, password, and shop name',
      });
    }

    // 2. Validate password match if confirmPassword is provided
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({
        status: 'fail',
        message: 'Password and Confirm Password do not match',
      });
    }

    // 3. Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        status: 'fail',
        message: 'Password must be at least 6 characters long',
      });
    }

    // 4. Validate & normalize email
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide a valid email address',
      });
    }

    // 5. Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        status: 'fail',
        message: 'An account with this email address already exists. Please log in instead.',
      });
    }

    // 6. Normalize category
    let category = (businessType || 'grocery').toString().toLowerCase().trim();
    const allowedCategories = ['grocery', 'clothing', 'supermarket', 'general_retail'];
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid shop category. Must be one of: Grocery, Clothing, Supermarket`,
      });
    }

    // 7. Create user in database (password is hashed by pre-save hook)
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      businessName: businessName.trim(),
      businessType: category,
    });

    // 8. Generate JWT
    const token = generateToken(user._id);

    // 9. Respond with sanitized user data (password is excluded)
    return res.status(201).json({
      status: 'success',
      message: 'Retail account registered successfully',
      data: {
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          businessName: user.businessName,
          businessType: user.businessType,
          role: user.role,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('[Registration Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error during registration',
    });
  }
};

/**
 * @desc    Authenticate user and get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide both email and password',
      });
    }

    // 2. Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // 3. Find user and explicitly include password field for verification
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password',
      });
    }

    // 4. Compare candidate password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password',
      });
    }

    // 5. Generate token
    const token = generateToken(user._id);

    // 6. Return sanitized user data
    return res.status(200).json({
      status: 'success',
      message: 'Logged in successfully',
      data: {
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          businessName: user.businessName,
          businessType: user.businessType,
          role: user.role,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('[Login Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error during login',
    });
  }
};

/**
 * @desc    Get currently logged in user profile
 * @route   GET /api/auth/profile
 * @access  Private (JWT Protected)
 */
export const getUserProfile = async (req, res) => {
  try {
    // req.user is already populated by authMiddleware.protect
    return res.status(200).json({
      status: 'success',
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    console.error('[Profile Fetch Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve user profile',
    });
  }
};
