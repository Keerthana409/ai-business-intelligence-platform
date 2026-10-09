import '../config/testEnv.js';
import 'dotenv/config';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import { connectDB } from '../config/db.js';

/**
 * Automated test suite for Module 1 Authentication
 */
async function runAuthTests() {
  console.log('🧪 [START] Running Module 1 Authentication Tests...\n');
  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  };

  try {
    await connectDB();

    // Clean up test user if previously exists
    const testEmail = 'test.retailer@example.com';
    await User.deleteMany({ email: testEmail });

    // Test 1: Missing registration fields
    const resMissing = await request(app).post('/api/auth/register').send({
      name: 'Test Retailer',
      // email missing
      password: 'password123',
    });
    assert(resMissing.status === 400, 'Rejects registration with missing required fields (400)');

    // Test 2: Short password (< 6 chars)
    const resShortPw = await request(app).post('/api/auth/register').send({
      name: 'Test Retailer',
      email: testEmail,
      password: '123',
      businessName: 'My Grocery Shop',
      businessType: 'grocery',
    });
    assert(resShortPw.status === 400, 'Rejects registration with password shorter than 6 characters (400)');

    // Test 3: Password mismatch
    const resMismatch = await request(app).post('/api/auth/register').send({
      name: 'Test Retailer',
      email: testEmail,
      password: 'password123',
      confirmPassword: 'differentPassword',
      businessName: 'My Grocery Shop',
      businessType: 'grocery',
    });
    assert(resMismatch.status === 400, 'Rejects registration when password and confirm password do not match (400)');

    // Test 4: Invalid email format
    const resInvalidEmail = await request(app).post('/api/auth/register').send({
      name: 'Test Retailer',
      email: 'not-an-email',
      password: 'password123',
      businessName: 'My Grocery Shop',
      businessType: 'grocery',
    });
    assert(resInvalidEmail.status === 400, 'Rejects registration with malformed email format (400)');

    // Test 5: Successful registration
    const resRegister = await request(app).post('/api/auth/register').send({
      name: 'Test Retailer',
      email: testEmail,
      password: 'securePassword123',
      confirmPassword: 'securePassword123',
      businessName: 'Fresh Mart Grocery',
      businessType: 'grocery',
    });
    assert(resRegister.status === 201, 'Successfully registers new retail user (201)');
    assert(resRegister.body.data && resRegister.body.data.token, 'Registration returns JWT token');
    assert(resRegister.body.data && resRegister.body.data.user, 'Registration returns user profile');
    assert(!resRegister.body.data.user.password, 'Password hash is NOT exposed in registration response');

    const authToken = resRegister.body.data?.token;

    // Test 6: Verify password hashing in DB
    const dbUser = await User.findOne({ email: testEmail }).select('+password');
    assert(dbUser && dbUser.password !== 'securePassword123', 'Password is NOT stored in plain text');
    assert(dbUser && dbUser.password.startsWith('$2'), 'Password is encrypted using bcrypt hash ($2a/$2b)');

    // Test 7: Duplicate email rejection
    const resDuplicate = await request(app).post('/api/auth/register').send({
      name: 'Duplicate Retailer',
      email: testEmail,
      password: 'anotherPassword123',
      businessName: 'Another Shop',
      businessType: 'clothing',
    });
    assert(resDuplicate.status === 400, 'Rejects duplicate registration with existing email (400)');

    // Test 8: Successful login
    const resLogin = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: 'securePassword123',
    });
    assert(resLogin.status === 200, 'Authenticates valid credentials on login (200)');
    assert(resLogin.body.data && resLogin.body.data.token, 'Login returns valid JWT token');
    assert(!resLogin.body.data.user.password, 'Password hash is NOT exposed in login response');

    // Test 9: Failed login with wrong password
    const resWrongPw = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: 'wrongPassword999',
    });
    assert(resWrongPw.status === 401, 'Rejects login with incorrect password (401)');

    // Test 10: Failed login with non-existent email
    const resNoUser = await request(app).post('/api/auth/login').send({
      email: 'nonexistent@example.com',
      password: 'anyPassword',
    });
    assert(resNoUser.status === 401, 'Rejects login for non-existent user (401)');

    // Test 11: Protected route access without token
    const resNoToken = await request(app).get('/api/auth/profile');
    assert(resNoToken.status === 401, 'Blocks unauthenticated access to protected route (401)');

    // Test 12: Protected route access with invalid token
    const resBadToken = await request(app).get('/api/auth/profile').set('Authorization', 'Bearer invalid.token.value');
    assert(resBadToken.status === 401, 'Blocks access with invalid/malformed token (401)');

    // Test 13: Protected route access with valid JWT
    const resProfile = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${authToken}`);
    assert(resProfile.status === 200, 'Grants access to protected route with valid JWT (200)');
    assert(resProfile.body.data?.user?.email === testEmail, 'Protected route returns authenticated user data');

    console.log(`\n📊 [SUMMARY]: ${passed} passed, ${failed} failed`);
  } catch (err) {
    console.error('❌ Test Execution Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runAuthTests();
