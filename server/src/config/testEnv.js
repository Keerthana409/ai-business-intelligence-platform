/**
 * Test Environment Bootstrap
 * Must be imported at the very top of all test files before any database modules.
 */
process.env.NODE_ENV = 'test';
if (!process.env.TEST_MONGODB_URI) {
  process.env.TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/retail_bi_test_db';
}
