const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const subscriptionRoutes = require('./routes/subscriptions');
const webhookRoutes = require('./routes/webhooks');
const translateRoutes = require('./routes/translate');
const { initializeDatabase } = require('./models/database');

const app = express();
const PORT = process.env.PORT || 8080;

// Cloud Run sits behind a reverse proxy and sets X-Forwarded-* headers.
// Trusting the first proxy hop lets middleware (e.g. rate limiter) resolve client IP correctly.
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Webhook endpoint needs raw body, so we set it up before JSON parsing
app.use('/api/webhooks', webhookRoutes);

// JSON parsing for other routes
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

function renderCheckoutPage({ title, message, hint, color }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f6f8fb; margin: 0; padding: 24px; color: #1f2937; }
    .card { max-width: 640px; margin: 40px auto; background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; padding: 24px; box-shadow: 0 10px 24px rgba(0,0,0,0.08); }
    .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; color: #fff; background: ${color}; margin-bottom: 10px; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 0 0 10px; line-height: 1.5; }
    .muted { color: #6b7280; font-size: 14px; margin-top: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${title}</div>
    <h1>${message}</h1>
    <p>${hint}</p>
    <p class="muted">You can safely close this window.</p>
  </div>
</body>
</html>`;
}

app.get('/checkout/success', (req, res) => {
  res
    .status(200)
    .type('html')
    .send(
      renderCheckoutPage({
        title: 'Payment Success',
        message: 'Thanks! Your subscription is being activated.',
        hint: 'Close this tab and reopen the extension popup to refresh your subscription status.',
        color: '#16a34a'
      })
    );
});

app.get('/checkout/cancel', (req, res) => {
  res
    .status(200)
    .type('html')
    .send(
      renderCheckoutPage({
        title: 'Payment Canceled',
        message: 'Checkout was canceled.',
        hint: 'No changes were made. You can reopen the extension popup and try again any time.',
        color: '#dc2626'
      })
    );
});

// API routes
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/translate', translateRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.type === 'StripeCardError') {
    return res.status(400).json({ 
      error: 'Payment failed', 
      message: err.message 
    });
  }
  
  if (err.type === 'StripeInvalidRequestError') {
    return res.status(400).json({ 
      error: 'Invalid request', 
      message: err.message 
    });
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('Database initialized successfully');
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
