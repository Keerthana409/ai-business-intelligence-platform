import '../config/testEnv.js';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { connectDB, isTestEnvironment, getDatabaseNameFromURI } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runSafeguardTests() {
  console.log('🔒 ==========================================');
  console.log('🔒 RUNNING DATABASE PROTECTION SAFEGUARD TESTS');
  console.log('🔒 ==========================================\n');

  try {
    // 1. Verify Test Environment Detection
    console.log('--- 1. Environment & Target DB Resolution ---');
    assert(isTestEnvironment() === true, 'isTestEnvironment() returns true in test mode');
    assert(process.env.NODE_ENV === 'test', 'NODE_ENV is set to "test"');

    const defaultTestUri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/retail_bi_test_db';
    const testDbName = getDatabaseNameFromURI(defaultTestUri);
    assert(testDbName === 'retail_bi_test_db', `Default test database resolved to "retail_bi_test_db" (found: "${testDbName}")`);

    // 2. Verify Rejection of Live Database (retail_bi_db) in Test Environment
    console.log('\n--- 2. Live Database Connection Rejection ---');
    let liveDbRejected = false;
    try {
      await connectDB('mongodb://127.0.0.1:27017/retail_bi_db');
    } catch (err) {
      if (err.message.includes('CRITICAL DATABASE SAFEGUARD')) {
        liveDbRejected = true;
      }
    }
    assert(liveDbRejected === true, 'Attempt to connect to "retail_bi_db" under test mode was successfully blocked');

    // 3. Verify Connection to Dedicated Test Database
    console.log('\n--- 3. Dedicated Test DB Connection ---');
    const conn = await connectDB();
    assert(conn !== null, 'Successfully established connection to MongoDB');
    const connectedName = conn.connection.name;
    assert(connectedName === 'retail_bi_test_db', `Connected strictly to "${connectedName}", NOT "retail_bi_db"`);
    await mongoose.disconnect();

    // 4. Static Codebase Scanner for Unscoped Destructive Operations
    console.log('\n--- 4. Static Scan: Unscoped Deletions & Dangerous Teardowns ---');
    const testFiles = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js'));
    assert(testFiles.length >= 8, `Discovered ${testFiles.length} test files in tests directory`);

    let foundUnscopedCalls = [];
    let missingTestEnvImports = [];

    const dangerousPatterns = [
      /deleteMany\(\s*\{\s*\}\s*\)/,
      /deleteMany\(\s*\)/,
      /remove\(\s*\{\s*\}\s*\)/,
      /dropDatabase\(/,
    ];

    for (const file of testFiles) {
      const filePath = path.join(__dirname, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // Check for testEnv import
      if (!content.includes('testEnv.js')) {
        missingTestEnvImports.push(file);
      }

      // Check for unscoped deletions
      dangerousPatterns.forEach((pattern) => {
        if (pattern.test(content)) {
          foundUnscopedCalls.push(`${file} matches ${pattern}`);
        }
      });
    }

    assert(
      missingTestEnvImports.length === 0,
      `All test files import testEnv.js at entry (missing: [${missingTestEnvImports.join(', ')}])`
    );
    assert(
      foundUnscopedCalls.length === 0,
      `Zero test files contain unscoped deleteMany/remove/dropDatabase calls (found: [${foundUnscopedCalls.join(', ')}])`
    );

    console.log(`\n🎉 Safeguard Tests Completed: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ Safeguard Test Exception:', err);
    process.exit(1);
  }
}

runSafeguardTests();
