# ProdReady Example: Before & After

This example shows how ProdReady transforms a typical AI-generated Express API into production-ready code.

## 🚨 Before (AI-Generated Code)

```javascript
// Typical ChatGPT/Claude generated Express API
const express = require('express');
const app = express();
const db = require('./db');

app.use(express.json());

// Get user endpoint
app.get('/api/users/:id', async (req, res) => {
  const user = await db.query('SELECT * FROM users WHERE id = ' + req.params.id);
  res.json(user);
});

// Process payment
app.post('/api/payment', async (req, res) => {
  const stripe = require('stripe')('sk_test_51H3...'); 
  const charge = await stripe.charges.create({
    amount: req.body.amount * 100,
    currency: 'usd',
    source: req.body.token
  });
  res.json({ success: true, charge });
});

// Create user
app.post('/api/users', async (req, res) => {
  const result = await db.query(
    `INSERT INTO users (email, password) VALUES ('${req.body.email}', '${req.body.password}')`
  );
  res.json({ id: result.insertId });
});

app.listen(3000);
```

### Production Issues Found:
- 🔴 **SQL Injection** (Line 9, 25): Direct string concatenation in queries
- 🔴 **No Error Handling**: Unhandled promise rejections will crash the app
- 🔴 **Hardcoded Secrets** (Line 16): API key in source code
- 🟡 **No Input Validation**: User input not validated
- 🟡 **No Rate Limiting**: APIs vulnerable to abuse
- 🟡 **Plain Text Password** (Line 25): Storing unhashed passwords
- 🟡 **No Authentication**: Public endpoints
- 🟡 **No Logging**: No visibility into errors

**Production Readiness Score: 15/100** 😱

---

## ✅ After (ProdReady Transformed)

```javascript
// Production-ready code after ProdReady transformation
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const winston = require('winston');
const app = express();
const db = require('./db');

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5 // limit each IP to 5 requests per windowMs for sensitive operations
});

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Get user endpoint - SECURED
app.get('/api/users/:id', 
  limiter,
  param('id').isInt().withMessage('ID must be an integer'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // SQL injection prevented with parameterized query
      const user = await db.query(
        'SELECT id, email, created_at FROM users WHERE id = ?',
        [req.params.id]
      );
      
      if (!user || user.length === 0) {
        logger.info(`User not found: ${req.params.id}`);
        return res.status(404).json({ error: 'User not found' });
      }
      
      logger.info(`User retrieved: ${req.params.id}`);
      res.json(user[0]);
    } catch (error) {
      logger.error('Error fetching user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// Process payment - PCI COMPLIANT
app.post('/api/payment',
  strictLimiter,
  body('amount').isFloat({ min: 0.01 }).withMessage('Invalid amount'),
  body('token').notEmpty().withMessage('Payment token required'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // API key from environment variable
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      
      // Add idempotency for payment processing
      const idempotencyKey = require('crypto').randomBytes(16).toString('hex');
      
      // Create charge with proper error handling
      const charge = await stripe.charges.create({
        amount: Math.round(req.body.amount * 100), // Prevent floating point issues
        currency: 'usd',
        source: req.body.token,
        description: `Charge for user ${req.user?.id || 'guest'}`,
        metadata: {
          user_id: req.user?.id,
          timestamp: new Date().toISOString()
        }
      }, {
        idempotencyKey: idempotencyKey
      });
      
      // Audit log for compliance
      logger.info('Payment processed', {
        chargeId: charge.id,
        amount: charge.amount,
        userId: req.user?.id
      });
      
      res.json({ 
        success: true, 
        chargeId: charge.id,
        amount: charge.amount
      });
    } catch (error) {
      logger.error('Payment processing error:', error);
      
      // Don't leak internal errors to client
      if (error.type === 'StripeCardError') {
        res.status(400).json({ error: 'Card was declined' });
      } else {
        res.status(500).json({ error: 'Payment processing failed' });
      }
    }
  })
);

// Create user - SECURE
app.post('/api/users',
  limiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Check if user exists
      const existing = await db.query(
        'SELECT id FROM users WHERE email = ?',
        [req.body.email]
      );
      
      if (existing.length > 0) {
        return res.status(409).json({ error: 'User already exists' });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      
      // Insert with parameterized query
      const result = await db.query(
        'INSERT INTO users (email, password) VALUES (?, ?)',
        [req.body.email, hashedPassword]
      );
      
      logger.info('New user created', { userId: result.insertId });
      
      res.status(201).json({ 
        id: result.insertId,
        email: req.body.email 
      });
    } catch (error) {
      logger.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  })
);

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
const server = app.listen(process.env.PORT || 3000, () => {
  logger.info(`Server started on port ${process.env.PORT || 3000}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server');
  server.close(() => {
    logger.info('Server closed');
    db.end(() => {
      logger.info('Database connections closed');
      process.exit(0);
    });
  });
});
```

### Improvements Made:
- ✅ **SQL Injection Fixed**: Parameterized queries
- ✅ **Error Handling Added**: Try-catch blocks, error middleware
- ✅ **Secrets Secured**: Environment variables
- ✅ **Input Validation**: Express-validator on all inputs
- ✅ **Rate Limiting**: Different limits for different endpoints
- ✅ **Password Security**: Bcrypt hashing
- ✅ **Logging**: Winston for structured logs
- ✅ **Security Headers**: Helmet.js
- ✅ **Graceful Shutdown**: Proper cleanup
- ✅ **PCI Compliance**: Idempotency, audit logs
- ✅ **Error Messages**: Safe error responses

**Production Readiness Score: 95/100** 🎉

---

## The ProdReady Difference

This transformation happened automatically with just two commands:
```bash
prodready scan app.js
prodready fix app.js
```

Every fix includes educational comments explaining why the change was made, helping developers learn production best practices while shipping safer code.