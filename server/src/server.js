import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';

const PORT = process.env.PORT || 5000;

// Initialize Database Connection
await connectDB();

// Start HTTP Server
const server = app.listen(PORT, () => {
  console.log(`🚀 [Server Started]: Listening on http://localhost:${PORT}`);
  console.log(`📡 [Health Check]: http://localhost:${PORT}/api/health`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err);
});
