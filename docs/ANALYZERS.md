# ProdReady Analyzer Specifications

This document details all the production readiness checks that ProdReady performs, organized by category.

## Categories Overview

1. **Security** - Vulnerabilities that could be exploited
2. **Reliability** - Issues that cause crashes or downtime  
3. **Performance** - Problems that slow down the application
4. **Observability** - Gaps in monitoring and debugging
5. **Maintainability** - Code quality and technical debt
6. **Operational** - Deployment and runtime concerns

## Scoring System

Each issue has a severity that affects the production readiness score:

- **Critical** (-20 points): Security vulnerabilities, data loss risks
- **High** (-10 points): Reliability issues, performance bottlenecks
- **Medium** (-5 points): Missing best practices, maintenance concerns
- **Low** (-2 points): Code style, minor improvements

Starting score: 100 points

## Security Analyzers

### SQL Injection (`sql-injection`)
**Severity**: Critical  
**Detects**: String concatenation or template literals in SQL queries  
**Fix**: Convert to parameterized queries

```javascript
// ❌ Vulnerable
db.query("SELECT * FROM users WHERE id = " + userId);
db.query(`SELECT * FROM users WHERE name = '${name}'`);

// ✅ Fixed
db.query("SELECT * FROM users WHERE id = ?", [userId]);
db.query("SELECT * FROM users WHERE name = ?", [name]);
```

### NoSQL Injection (`nosql-injection`)
**Severity**: Critical  
**Detects**: Unsafe object construction in MongoDB queries  
**Fix**: Validate and sanitize inputs

```javascript
// ❌ Vulnerable
db.users.find({ username: req.body.username });

// ✅ Fixed
db.users.find({ username: String(req.body.username) });
```

### XSS Vulnerabilities (`xss`)
**Severity**: Critical  
**Detects**: Unescaped user input in HTML responses  
**Fix**: HTML escape all user content

```javascript
// ❌ Vulnerable
res.send(`<h1>Welcome ${req.query.name}</h1>`);

// ✅ Fixed
res.send(`<h1>Welcome ${escapeHtml(req.query.name)}</h1>`);
```

### Path Traversal (`path-traversal`)
**Severity**: Critical  
**Detects**: User input in file paths without validation  
**Fix**: Validate and sanitize file paths

```javascript
// ❌ Vulnerable
fs.readFile(`./uploads/${req.params.filename}`);

// ✅ Fixed
const safePath = path.join('./uploads', path.basename(req.params.filename));
fs.readFile(safePath);
```

### Command Injection (`command-injection`)
**Severity**: Critical  
**Detects**: User input in shell commands  
**Fix**: Use array syntax or validate inputs

```javascript
// ❌ Vulnerable
exec(`ping ${req.query.host}`);

// ✅ Fixed
execFile('ping', [req.query.host]);
```

### Hardcoded Secrets (`hardcoded-secrets`)
**Severity**: High  
**Detects**: API keys, passwords, tokens in code  
**Fix**: Move to environment variables

```javascript
// ❌ Vulnerable
const apiKey = 'sk_live_abc123';
const password = 'admin123';

// ✅ Fixed
const apiKey = process.env.API_KEY;
const password = process.env.ADMIN_PASSWORD;
```

### Weak Cryptography (`weak-crypto`)
**Severity**: High  
**Detects**: MD5, SHA1, weak random generation  
**Fix**: Use strong algorithms

```javascript
// ❌ Vulnerable
crypto.createHash('md5').update(password).digest('hex');
Math.random() * 1000000;

// ✅ Fixed
crypto.createHash('sha256').update(password).digest('hex');
crypto.randomBytes(32).toString('hex');
```

### CORS Misconfiguration (`cors-misconfiguration`)
**Severity**: Medium  
**Detects**: Wildcard or overly permissive CORS  
**Fix**: Specify allowed origins

```javascript
// ❌ Vulnerable
app.use(cors({ origin: '*' }));

// ✅ Fixed
app.use(cors({ origin: ['https://app.example.com'] }));
```

### Missing Authentication (`missing-auth`)
**Severity**: Critical  
**Detects**: Sensitive endpoints without auth checks  
**Fix**: Add authentication middleware

```javascript
// ❌ Vulnerable
app.get('/api/admin/users', (req, res) => { ... });

// ✅ Fixed
app.get('/api/admin/users', authenticate, authorize('admin'), (req, res) => { ... });
```

### Insecure Session Management (`insecure-sessions`)
**Severity**: High  
**Detects**: Missing secure flags on cookies  
**Fix**: Set secure cookie options

```javascript
// ❌ Vulnerable
res.cookie('session', token);

// ✅ Fixed
res.cookie('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict'
});
```

## Reliability Analyzers

### No Error Handling (`no-error-handling`)
**Severity**: High  
**Detects**: Async operations without try-catch  
**Fix**: Add comprehensive error handling

```javascript
// ❌ Vulnerable
async function getUser(id) {
  const user = await db.query(`SELECT * FROM users WHERE id = ${id}`);
  return user;
}

// ✅ Fixed
async function getUser(id) {
  try {
    const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return user;
  } catch (error) {
    logger.error('Failed to get user:', error);
    throw new AppError('User fetch failed', 500);
  }
}
```

### Unhandled Promise Rejections (`unhandled-promises`)
**Severity**: High  
**Detects**: Promises without .catch() or try-catch  
**Fix**: Add rejection handling

```javascript
// ❌ Vulnerable
processPayment(amount).then(result => console.log(result));

// ✅ Fixed
processPayment(amount)
  .then(result => console.log(result))
  .catch(error => logger.error('Payment failed:', error));
```

### No Timeouts (`no-timeouts`)
**Severity**: Medium  
**Detects**: Network calls without timeout  
**Fix**: Add timeout configuration

```javascript
// ❌ Vulnerable
const response = await axios.get(url);

// ✅ Fixed
const response = await axios.get(url, { timeout: 5000 });
```

### No Retry Logic (`no-retry`)
**Severity**: Medium  
**Detects**: External calls without retry  
**Fix**: Add exponential backoff retry

```javascript
// ❌ Vulnerable
const data = await fetchExternalAPI();

// ✅ Fixed
const data = await retry(
  () => fetchExternalAPI(),
  { retries: 3, minTimeout: 1000 }
);
```

### No Circuit Breaker (`no-circuit-breaker`)
**Severity**: Medium  
**Detects**: External services without failure protection  
**Fix**: Implement circuit breaker pattern

```javascript
// ❌ Vulnerable
async function callService() {
  return await externalService.call();
}

// ✅ Fixed
const breaker = new CircuitBreaker(externalService.call, {
  timeout: 3000,
  errorThresholdPercentage: 50
});
async function callService() {
  return await breaker.fire();
}
```

### Resource Leaks (`resource-leaks`)
**Severity**: High  
**Detects**: Unclosed connections, file handles  
**Fix**: Ensure proper cleanup

```javascript
// ❌ Vulnerable
const file = fs.createReadStream(path);
processFile(file);

// ✅ Fixed
const file = fs.createReadStream(path);
try {
  await processFile(file);
} finally {
  file.close();
}
```

### Blocking Operations (`blocking-operations`)
**Severity**: High  
**Detects**: Sync I/O in async context  
**Fix**: Use async alternatives

```javascript
// ❌ Vulnerable
app.get('/api/data', (req, res) => {
  const data = fs.readFileSync('./data.json');
  res.json(JSON.parse(data));
});

// ✅ Fixed
app.get('/api/data', async (req, res) => {
  const data = await fs.promises.readFile('./data.json', 'utf8');
  res.json(JSON.parse(data));
});
```

### No Health Checks (`no-health-checks`)
**Severity**: Medium  
**Detects**: Missing health endpoints  
**Fix**: Add health check endpoint

```javascript
// ✅ Fixed
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});
```

### Missing Graceful Shutdown (`no-graceful-shutdown`)
**Severity**: Medium  
**Detects**: No SIGTERM handling  
**Fix**: Add shutdown handler

```javascript
// ✅ Fixed
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
  });
  await db.close();
  process.exit(0);
});
```

## Performance Analyzers

### No Caching Strategy (`no-caching`)
**Severity**: Medium  
**Detects**: Repeated expensive operations  
**Fix**: Implement caching

```javascript
// ❌ Vulnerable
app.get('/api/expensive', async (req, res) => {
  const result = await expensiveOperation();
  res.json(result);
});

// ✅ Fixed
const cache = new NodeCache({ stdTTL: 600 });
app.get('/api/expensive', async (req, res) => {
  const cached = cache.get('expensive');
  if (cached) return res.json(cached);
  
  const result = await expensiveOperation();
  cache.set('expensive', result);
  res.json(result);
});
```

### N+1 Queries (`n-plus-one`)
**Severity**: High  
**Detects**: Database queries in loops  
**Fix**: Use joins or batch queries

```javascript
// ❌ Vulnerable
const users = await getUsers();
for (const user of users) {
  user.posts = await getPosts(user.id);
}

// ✅ Fixed
const users = await getUsersWithPosts(); // JOIN query
```

### No Connection Pooling (`no-connection-pooling`)
**Severity**: High  
**Detects**: Creating connections per request  
**Fix**: Use connection pool

```javascript
// ❌ Vulnerable
app.get('/api/data', async (req, res) => {
  const conn = await mysql.createConnection(config);
  const result = await conn.query('SELECT * FROM data');
  conn.end();
  res.json(result);
});

// ✅ Fixed
const pool = mysql.createPool(config);
app.get('/api/data', async (req, res) => {
  const result = await pool.query('SELECT * FROM data');
  res.json(result);
});
```

### Large Payload Sizes (`large-payloads`)
**Severity**: Medium  
**Detects**: Unbounded response sizes  
**Fix**: Add pagination or limits

```javascript
// ❌ Vulnerable
app.get('/api/users', async (req, res) => {
  const users = await db.query('SELECT * FROM users');
  res.json(users);
});

// ✅ Fixed
app.get('/api/users', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = (page - 1) * limit;
  
  const users = await db.query(
    'SELECT * FROM users LIMIT ? OFFSET ?',
    [limit, offset]
  );
  res.json({ users, page, limit });
});
```

### Inefficient Algorithms (`inefficient-algorithms`)
**Severity**: Medium  
**Detects**: O(n²) or worse complexity  
**Fix**: Use efficient algorithms

```javascript
// ❌ Vulnerable
function findDuplicates(arr) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j]) duplicates.push(arr[i]);
    }
  }
  return duplicates;
}

// ✅ Fixed
function findDuplicates(arr) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of arr) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }
  return Array.from(duplicates);
}
```

### No Lazy Loading (`no-lazy-loading`)
**Severity**: Low  
**Detects**: Loading all data upfront  
**Fix**: Implement lazy loading

```javascript
// ❌ Vulnerable
const allModules = require('./all-modules');

// ✅ Fixed
const getModule = (name) => require(`./modules/${name}`);
```

### Memory Leaks (`memory-leaks`)
**Severity**: High  
**Detects**: Event listeners not cleaned up  
**Fix**: Remove listeners properly

```javascript
// ❌ Vulnerable
function subscribe() {
  emitter.on('data', handleData);
}

// ✅ Fixed
function subscribe() {
  emitter.on('data', handleData);
  return () => emitter.off('data', handleData);
}
```

## Observability Analyzers

### No Logging (`no-logging`)
**Severity**: Medium  
**Detects**: Missing log statements  
**Fix**: Add structured logging

```javascript
// ❌ Vulnerable
app.post('/api/users', async (req, res) => {
  const user = await createUser(req.body);
  res.json(user);
});

// ✅ Fixed
app.post('/api/users', async (req, res) => {
  logger.info('Creating user', { email: req.body.email });
  try {
    const user = await createUser(req.body);
    logger.info('User created', { userId: user.id });
    res.json(user);
  } catch (error) {
    logger.error('User creation failed', { error, email: req.body.email });
    throw error;
  }
});
```

### Poor Log Quality (`poor-log-quality`)
**Severity**: Low  
**Detects**: console.log usage, unstructured logs  
**Fix**: Use proper logging library

```javascript
// ❌ Vulnerable
console.log('Error: ' + error);

// ✅ Fixed
logger.error('Operation failed', { 
  error: error.message,
  stack: error.stack,
  context: { userId, operation }
});
```

### No Metrics (`no-metrics`)
**Severity**: Medium  
**Detects**: Missing performance metrics  
**Fix**: Add metrics collection

```javascript
// ✅ Fixed
const promClient = require('prom-client');
const httpDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    httpDuration.observe(
      { method: req.method, route: req.route?.path, status: res.statusCode },
      duration / 1000
    );
  });
  next();
});
```

### Missing Request IDs (`no-request-ids`)
**Severity**: Medium  
**Detects**: No request tracing  
**Fix**: Add request ID middleware

```javascript
// ✅ Fixed
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuid.v4();
  res.setHeader('x-request-id', req.id);
  logger.info('Request started', { requestId: req.id, method: req.method, path: req.path });
  next();
});
```

### No APM Integration (`no-apm`)
**Severity**: Low  
**Detects**: Missing application monitoring  
**Fix**: Add APM agent

```javascript
// ✅ Fixed
require('newrelic'); // At app startup
// or
const apm = require('elastic-apm-node').start({
  serviceName: 'my-app',
  secretToken: process.env.APM_TOKEN
});
```

## Maintainability Analyzers

### Code Duplication (`code-duplication`)
**Severity**: Medium  
**Detects**: Repeated code blocks  
**Fix**: Extract to functions

```javascript
// ❌ Vulnerable
function processUser(user) {
  if (!user.email || !user.email.includes('@')) throw new Error('Invalid email');
  if (!user.name || user.name.length < 2) throw new Error('Invalid name');
  // ... processing
}

function validateUser(user) {
  if (!user.email || !user.email.includes('@')) throw new Error('Invalid email');
  if (!user.name || user.name.length < 2) throw new Error('Invalid name');
  // ... validation
}

// ✅ Fixed
function validateUserData(user) {
  if (!user.email || !user.email.includes('@')) throw new Error('Invalid email');
  if (!user.name || user.name.length < 2) throw new Error('Invalid name');
}

function processUser(user) {
  validateUserData(user);
  // ... processing
}
```

### Circular Dependencies (`circular-dependencies`)
**Severity**: High  
**Detects**: Modules that import each other  
**Fix**: Refactor to remove cycles

```javascript
// ❌ Vulnerable
// userService.js
const postService = require('./postService');

// postService.js  
const userService = require('./userService');

// ✅ Fixed
// Use dependency injection or events
```

### God Objects (`god-objects`)
**Severity**: Medium  
**Detects**: Classes/modules doing too much  
**Fix**: Split responsibilities

```javascript
// ❌ Vulnerable
class UserService {
  createUser() { }
  updateUser() { }
  deleteUser() { }
  sendEmail() { }
  generateReport() { }
  backupDatabase() { }
  // ... 50 more methods
}

// ✅ Fixed
class UserService { /* user CRUD */ }
class EmailService { /* email operations */ }
class ReportService { /* reporting */ }
```

### Deep Nesting (`deep-nesting`)
**Severity**: Low  
**Detects**: Code nested > 4 levels  
**Fix**: Extract functions, early returns

```javascript
// ❌ Vulnerable
if (user) {
  if (user.isActive) {
    if (user.hasPermission) {
      if (user.email) {
        // do something
      }
    }
  }
}

// ✅ Fixed
if (!user || !user.isActive || !user.hasPermission || !user.email) {
  return;
}
// do something
```

### Magic Numbers (`magic-numbers`)
**Severity**: Low  
**Detects**: Hardcoded numbers without context  
**Fix**: Extract to named constants

```javascript
// ❌ Vulnerable
if (user.age > 17) { }
setTimeout(fn, 86400000);

// ✅ Fixed
const MINIMUM_AGE = 18;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

if (user.age >= MINIMUM_AGE) { }
setTimeout(fn, ONE_DAY_MS);
```

### No Documentation (`no-documentation`)
**Severity**: Low  
**Detects**: Complex functions without docs  
**Fix**: Add JSDoc comments

```javascript
// ✅ Fixed
/**
 * Processes payment for the given order
 * @param {Order} order - The order to process
 * @param {PaymentMethod} method - Payment method to use
 * @returns {Promise<PaymentResult>} Payment result
 * @throws {PaymentError} If payment fails
 */
async function processPayment(order, method) {
  // ...
}
```

## Operational Analyzers

### No Rate Limiting (`no-rate-limiting`)
**Severity**: High  
**Detects**: Unprotected endpoints  
**Fix**: Add rate limiting middleware

```javascript
// ✅ Fixed
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### Missing Input Validation (`no-input-validation`)
**Severity**: High  
**Detects**: Unvalidated user input  
**Fix**: Add validation schemas

```javascript
// ❌ Vulnerable
app.post('/api/users', (req, res) => {
  createUser(req.body);
});

// ✅ Fixed
const { body, validationResult } = require('express-validator');

app.post('/api/users',
  body('email').isEmail(),
  body('age').isInt({ min: 0, max: 150 }),
  body('name').isLength({ min: 2 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    createUser(req.body);
  }
);
```

### No API Versioning (`no-api-versioning`)
**Severity**: Low  
**Detects**: Unversioned APIs  
**Fix**: Add version to routes

```javascript
// ❌ Vulnerable
app.get('/api/users', handler);

// ✅ Fixed
app.get('/api/v1/users', handler);
```

### No Feature Flags (`no-feature-flags`)
**Severity**: Low  
**Detects**: Hard-coded feature switches  
**Fix**: Implement feature flag system

```javascript
// ❌ Vulnerable
if (false) { // New feature, not ready
  doNewThing();
}

// ✅ Fixed
if (featureFlags.isEnabled('new-feature')) {
  doNewThing();
}
```

### Missing Database Migrations (`no-migrations`)
**Severity**: Medium  
**Detects**: Direct schema modifications  
**Fix**: Use migration system

```javascript
// ✅ Fixed
// migrations/001_create_users.js
exports.up = (knex) => {
  return knex.schema.createTable('users', table => {
    table.increments('id');
    table.string('email').notNullable().unique();
    table.timestamps(true, true);
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('users');
};
```

### Poor Configuration Management (`poor-config`)
**Severity**: Medium  
**Detects**: Hardcoded configuration  
**Fix**: Use environment variables

```javascript
// ❌ Vulnerable
const dbHost = 'localhost';
const dbPort = 5432;

// ✅ Fixed
const config = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432
  }
};
```

## Context-Aware Enhancements

### Payment Processing Context
When payment-related code is detected:
- Add PCI compliance wrappers
- Implement idempotency
- Add comprehensive audit logging
- Ensure proper error messages (no card details)

### User Data Context
When personal data handling is detected:
- Add GDPR compliance checks
- Implement data minimization
- Add consent verification
- Enable right-to-delete functionality

### High-Traffic Context
When high-traffic endpoints are detected:
- Add aggressive caching
- Implement request coalescing  
- Add CDN headers
- Enable response compression

### Authentication Context
When auth-related code is detected:
- Add brute force protection
- Implement secure session management
- Add password complexity requirements
- Enable 2FA support hooks

## Implementation Priority

### Phase 1 (MVP) - Top 10
1. SQL Injection
2. No Error Handling
3. Hardcoded Secrets
4. Missing Authentication
5. No Input Validation
6. No Rate Limiting
7. XSS Vulnerabilities
8. No Connection Pooling
9. N+1 Queries
10. No Logging

### Phase 2 - Security & Reliability
All remaining security and reliability analyzers

### Phase 3 - Performance & Operations
Performance and operational analyzers

### Phase 4 - Maintainability
Code quality and maintainability analyzers