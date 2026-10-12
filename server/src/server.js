import 'dotenv/config';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './app.js';
import { connectDB } from './config/db.js';
import { checkMLServiceHealth, getMLServiceBaseUrl } from './services/mlServiceClient.js';

const PORT = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let localMlProcess = null;

async function ensureLocalMLService() {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
    return;
  }
  const primaryUrl = getMLServiceBaseUrl();
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:8000)?$/i.test(primaryUrl)) {
    return;
  }

  const health = await checkMLServiceHealth(primaryUrl);
  if (health.online) {
    console.log(`🧠 [ML Service]: Local Python FastAPI online at ${primaryUrl}`);
    return;
  }

  const mlServiceDir = path.resolve(__dirname, '../../ml_service');
  if (!fs.existsSync(path.join(mlServiceDir, 'app.py'))) {
    return;
  }

  const winPython = 'C:\\Users\\keert\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
  const pythonCmd = fs.existsSync(winPython) ? winPython : 'python';

  try {
    localMlProcess = spawn(
      pythonCmd,
      ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8000'],
      {
        cwd: mlServiceDir,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    localMlProcess.on('error', () => {
      localMlProcess = null;
    });
    console.log(`🧠 [ML Service]: Auto-starting local Python FastAPI service on ${primaryUrl}...`);
  } catch {
    // Fallback URL chain in mlServiceClient handles cases where local Python is unavailable
  }
}

// Initialize Database Connection
await connectDB();
ensureLocalMLService();

// Start HTTP Server
const server = app.listen(PORT, () => {
  console.log(`🚀 [Server Started]: Listening on http://localhost:${PORT}`);
  console.log(`📡 [Health Check]: http://localhost:${PORT}/api/health`);
});

const cleanup = () => {
  if (localMlProcess && !localMlProcess.killed) {
    try {
      localMlProcess.kill();
    } catch {
      // Ignore cleanup errors
    }
  }
};

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err);
});
