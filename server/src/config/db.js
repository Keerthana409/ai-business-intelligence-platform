import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Extracts the database name from a MongoDB connection URI
 */
export const getDatabaseNameFromURI = (uri) => {
  if (!uri || typeof uri !== 'string') return '';
  try {
    const cleanUri = uri.split('?')[0];
    const parts = cleanUri.split('/');
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
};

/**
 * Checks whether the current process is running in an automated test context
 */
export const isTestEnvironment = () => {
  if (process.env.NODE_ENV === 'test') {
    return true;
  }
  return process.argv.some(
    (arg) =>
      typeof arg === 'string' &&
      (arg.endsWith('.test.js') ||
        arg.includes('/tests/') ||
        arg.includes('\\tests\\') ||
        arg.includes('src/tests') ||
        arg.includes('src\\tests'))
  );
};

/**
 * Connect to MongoDB database with strict environment isolation safeguards
 * @param {string|null} customURI Optional explicit URI
 */
export const connectDB = async (customURI = null) => {
  const isTest = isTestEnvironment();

  // Resolve target URI
  let mongoURI =
    customURI ||
    (isTest
      ? process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/retail_bi_test_db'
      : process.env.MONGODB_URI);

  if (!mongoURI) {
    console.warn('⚠️  [Database Warning]: MONGODB_URI is not set in environment variables. Database connection skipped.');
    return null;
  }

  const targetDbName = getDatabaseNameFromURI(mongoURI);

  // SAFEGUARD 1: Pre-connection rejection of live database in test environment
  if (isTest && targetDbName === 'retail_bi_db') {
    const errorMsg =
      'CRITICAL DATABASE SAFEGUARD: Automated test suites are strictly prohibited from connecting to the live application database "retail_bi_db". Tests must use "retail_bi_test_db".';
    console.error(`❌ [Database Safeguard Triggered]: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  try {
    const conn = await mongoose.connect(mongoURI);

    // SAFEGUARD 2: Post-connection verification of connected database name
    const activeDbName = conn.connection?.name || mongoose.connection?.name;
    if (isTest && activeDbName === 'retail_bi_db') {
      await mongoose.disconnect();
      const errorMsg =
        'CRITICAL DATABASE SAFEGUARD: Active connection to "retail_bi_db" was detected in test environment. Disconnected immediately to prevent data loss.';
      console.error(`❌ [Database Safeguard Triggered]: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    console.log(`✅ [MongoDB Connected]: ${conn.connection.host} (DB: ${activeDbName || targetDbName})`);
    return conn;
  } catch (error) {
    if (error.message.includes('CRITICAL DATABASE SAFEGUARD')) {
      throw error;
    }
    console.error(`❌ [MongoDB Error]: ${error.message}`);
    return null;
  }
};
