/**
 * Standardized API Response Helpers
 */

export const sendSuccess = (res, statusCode = 200, message = 'Success', data = null) => {
  return res.status(statusCode).json({
    status: 'success',
    message,
    data,
  });
};

export const sendError = (res, statusCode = 500, message = 'Server Error', errors = null) => {
  return res.status(statusCode).json({
    status: 'error',
    message,
    ...(errors && { errors }),
  });
};
