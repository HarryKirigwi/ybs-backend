import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cookieParser from 'cookie-parser';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import referralRoutes from './routes/referral.js';
import transactionRoutes from './routes/transactions.js';
import taskRoutes from './routes/tasks.js';
import withdrawalRoutes from './routes/withdrawals.js';
import earningsRoutes from './routes/earnings.js';
import adminRoutes from './routes/admin.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Trust proxy for Railway deployment
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000/',
      'http://localhost:3001',
      'https://ybslimited.co.ke', // Replace with your actual frontend domain
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all requests
app.use(limiter);

// Stricter rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for password-related routes
const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 password change attempts per hour
  message: {
    error: 'Too many password change attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/admin', adminRoutes);

// Apply password limiter to specific password routes
app.use('/api/auth/change-password', passwordLimiter);
app.use('/api/auth/reset-password', passwordLimiter);

// M-Pesa callback routes (no rate limiting for webhooks)
app.post('/api/mpesa/callback', express.json(), (req, res) => {
  // This will be handled in the payment service
  console.log('M-Pesa callback received:', req.body);
  res.json({ ResultCode: 0, ResultDesc: 'Success' });
});

app.post('/api/mpesa/timeout', express.json(), (req, res) => {
  console.log('M-Pesa timeout received:', req.body);
  res.json({ ResultCode: 0, ResultDesc: 'Success' });
});

// 404 handler for API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.originalUrl} not found`,
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'YBS Referral Platform API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/auth',
      user: '/api/user',
      referral: '/api/referral',
      transactions: '/api/transactions',
      tasks: '/api/tasks',
      withdrawals: '/api/withdrawals',
      earnings: '/api/earnings',
      admin: '/api/admin',
      health: '/health',
    },
    documentation: 'https://docs.yourplatform.com', // Replace with your actual docs URL
  });
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;