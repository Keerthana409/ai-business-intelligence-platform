import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Middleware to protect routes via Bearer JWT token verification
 * Ensures user exists and populates req.user with authenticated user data
 */
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      status: 'fail',
      message: 'Access denied: No authentication token provided',
    });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'retail_bi_platform_jwt_secret_key_2026_secure_default';


    const decoded = jwt.verify(token, jwtSecret);

    // Verify user still exists in database and attach sanitized user to request
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'User belonging to this token no longer exists',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'fail',
        message: 'Your session has expired. Please log in again.',
      });
    }
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid authentication token',
    });
  }
};
