import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRoutes from './routes/chat.js';
import navigatorRoutes from './routes/navigator.js';
import jobsRoutes from './routes/jobs.js';
import priceRoutes from './routes/price.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/navigator', navigatorRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/price', priceRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Assistant Server running on http://localhost:${PORT}`);
  console.log(`📡 Ollama URL: ${process.env.OLLAMA_URL}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
});
