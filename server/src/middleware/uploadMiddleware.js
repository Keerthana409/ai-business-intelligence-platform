import multer from 'multer';

// Memory storage keeps uploaded CSV buffer in memory for safe parsing
const storage = multer.memoryStorage();

// File filter restricting uploads to CSV only
const fileFilter = (req, file, cb) => {
  const isCsvExtension = file.originalname.toLowerCase().endsWith('.csv');
  const isCsvMime =
    file.mimetype === 'text/csv' ||
    file.mimetype === 'application/vnd.ms-excel' ||
    file.mimetype === 'text/plain' ||
    file.mimetype === 'application/csv';

  if (isCsvExtension || isCsvMime) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only .csv files are supported.'), false);
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB maximum file size
  },
  fileFilter,
});

/**
 * Express error handler middleware for Multer errors
 */
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: 'fail',
        message: 'File size exceeds the 5MB limit',
      });
    }
    return res.status(400).json({
      status: 'fail',
      message: `Upload error: ${err.message}`,
    });
  } else if (err) {
    return res.status(400).json({
      status: 'fail',
      message: err.message,
    });
  }
  next();
};
