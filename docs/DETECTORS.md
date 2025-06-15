# ProdReady Detectors

This document catalogs all production readiness detectors implemented in ProdReady, organized by category. Each detector includes its severity, auto-fix availability, and implementation details.

## Categories Overview

- **🔒 Security**: 25 detectors
- **🛡️ Reliability**: 20 detectors  
- **⚡ Performance**: 15 detectors
- **📊 Operational**: 15 detectors
- **🏗️ Code Quality**: 15 detectors
- **📋 Compliance**: 10 detectors

**Total: 100+ Production Readiness Checks**

---

## 🔒 Security Detectors

### SQL Injection (sql-injection)
- **Severity**: Critical
- **Auto-fix**: ✅ Yes
- **Pattern**: String concatenation in SQL queries
- **Fix**: Convert to parameterized queries
```javascript
// Vulnerable
db.query("SELECT * FROM users WHERE id = " + userId);
// Fixed
db.query("SELECT * FROM users WHERE id = ?", [userId]);
```

### NoSQL Injection (nosql-injection)
- **Severity**: Critical
- **Auto-fix**: ✅ Yes
- **Pattern**: Unsafe MongoDB query construction
- **Fix**: Sanitize inputs, use proper query builders

### XSS - Cross-Site Scripting (xss-vulnerability)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Unescaped user input in HTML responses
- **Fix**: HTML escape all user inputs

### Command Injection (command-injection)
- **Severity**: Critical
- **Auto-fix**: ✅ Yes
- **Pattern**: User input in exec/spawn calls
- **Fix**: Use array syntax, validate inputs

### Path Traversal (path-traversal)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Unsanitized file paths from user input
- **Fix**: Validate and sanitize paths

### Hardcoded Secrets (hardcoded-secrets)
- **Severity**: Critical
- **Auto-fix**: ✅ Yes
- **Pattern**: API keys, passwords in code
- **Fix**: Move to environment variables

### Weak Cryptography (weak-crypto)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: MD5, SHA1 usage
- **Fix**: Use bcrypt, scrypt, or argon2

### Insecure Random (insecure-random)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: Math.random() for security
- **Fix**: Use crypto.randomBytes()

### CSRF Missing (csrf-missing)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: No CSRF protection on state-changing routes
- **Fix**: Add CSRF middleware

### JWT Hardcoded Secret (jwt-hardcoded-secret)
- **Severity**: Critical
- **Auto-fix**: ✅ Yes
- **Pattern**: JWT secret in code
- **Fix**: Move to environment variable

### No HTTPS Redirect (no-https-redirect)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: No HTTP→HTTPS redirect
- **Fix**: Add redirect middleware

### Unsafe CORS (unsafe-cors)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Wildcard CORS origin
- **Fix**: Whitelist specific origins

### Missing Security Headers (missing-security-headers)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: No helmet.js or security headers
- **Fix**: Add helmet middleware

### Password in Plain Text (plain-password)
- **Severity**: Critical
- **Auto-fix**: ✅ Yes
- **Pattern**: Storing unhashed passwords
- **Fix**: Hash with bcrypt

### Eval Usage (eval-usage)
- **Severity**: High
- **Auto-fix**: ⚠️ Partial
- **Pattern**: eval() or Function() constructor
- **Fix**: Refactor to avoid eval

### XML External Entity (xxe)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: XML parsing without entity protection
- **Fix**: Disable external entities

### Regex DoS (regex-dos)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Exponential regex patterns
- **Fix**: Simplify regex or add timeouts

### Open Redirect (open-redirect)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: Unvalidated redirect URLs
- **Fix**: Whitelist redirect destinations

### SSRF Vulnerability (ssrf)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: User-controlled URLs in requests
- **Fix**: Validate and whitelist URLs

### Session Fixation (session-fixation)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Not regenerating session on login
- **Fix**: Regenerate session ID

### Timing Attack (timing-attack)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: String comparison in auth
- **Fix**: Use constant-time comparison

### Missing Authentication (missing-auth)
- **Severity**: Critical
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Sensitive routes without auth
- **Fix**: Add authentication middleware

### Broken Access Control (broken-access-control)
- **Severity**: Critical
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Missing authorization checks
- **Fix**: Add authorization logic

### Sensitive Data Exposure (sensitive-data-exposure)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Logging sensitive data
- **Fix**: Redact sensitive fields

### Unvalidated Input (unvalidated-input)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: No input validation
- **Fix**: Add validation schemas

---

## 🛡️ Reliability Detectors

### No Error Handling (no-error-handling)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Async functions without try-catch
- **Fix**: Wrap in try-catch blocks

### Unhandled Promise Rejection (unhandled-promise)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Promises without .catch()
- **Fix**: Add error handlers

### No Timeout (no-timeout)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: HTTP requests without timeout
- **Fix**: Add timeout configuration

### No Retry Logic (no-retry)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: External calls without retry
- **Fix**: Add exponential backoff retry

### No Circuit Breaker (no-circuit-breaker)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: External services without protection
- **Fix**: Implement circuit breaker pattern

### Memory Leak - Event Listeners (memory-leak-listeners)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Not removing event listeners
- **Fix**: Add cleanup logic

### Memory Leak - Timers (memory-leak-timers)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: Not clearing intervals/timeouts
- **Fix**: Clear on cleanup

### Resource Leak (resource-leak)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Unclosed file handles, connections
- **Fix**: Add proper cleanup

### Blocking Operation (blocking-operation)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Sync I/O in async context
- **Fix**: Convert to async

### No Graceful Shutdown (no-graceful-shutdown)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: No SIGTERM handling
- **Fix**: Add shutdown handler

### Missing Health Check (missing-health-check)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: No /health endpoint
- **Fix**: Add health check route

### Unbounded Queue (unbounded-queue)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: Arrays growing without limit
- **Fix**: Add size limits

### No Backpressure (no-backpressure)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: Stream processing without control
- **Fix**: Implement backpressure

### Single Point of Failure (single-point-failure)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Critical dependencies without fallback
- **Fix**: Add redundancy

### No Idempotency (no-idempotency)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: Non-idempotent operations
- **Fix**: Add idempotency keys

### Race Condition (race-condition)
- **Severity**: High
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Concurrent access without locks
- **Fix**: Add proper synchronization

### Deadlock Risk (deadlock-risk)
- **Severity**: High
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Circular dependencies in locks
- **Fix**: Refactor locking order

### No Fallback (no-fallback)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: No fallback for external services
- **Fix**: Add fallback logic

### Missing Error Context (missing-error-context)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: Errors without context
- **Fix**: Add contextual information

### Infinite Loop Risk (infinite-loop-risk)
- **Severity**: High
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Loops without proper exit conditions
- **Fix**: Add bounds checking

---

## ⚡ Performance Detectors

### No Caching (no-caching)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: Repeated expensive operations
- **Fix**: Add caching layer

### N+1 Query (n-plus-one-query)
- **Severity**: High
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Queries in loops
- **Fix**: Use joins or batch loading

### No Connection Pooling (no-connection-pooling)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Creating connections per request
- **Fix**: Implement connection pool

### Large Payload (large-payload)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: Unbounded response sizes
- **Fix**: Add pagination

### No Pagination (no-pagination)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: Returning all records
- **Fix**: Implement pagination

### Synchronous I/O (sync-io)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Blocking I/O operations
- **Fix**: Convert to async

### No Compression (no-compression)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: No response compression
- **Fix**: Add compression middleware

### Inefficient Algorithm (inefficient-algorithm)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: O(n²) or worse algorithms
- **Fix**: Optimize algorithm

### No Indexing (no-indexing)
- **Severity**: High
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Queries without indexes
- **Fix**: Add database indexes

### Memory Bloat (memory-bloat)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Loading large datasets in memory
- **Fix**: Use streaming

### No Rate Limiting (no-rate-limiting)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Unprotected endpoints
- **Fix**: Add rate limiting

### Chatty API (chatty-api)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Too many small requests
- **Fix**: Batch operations

### No CDN Usage (no-cdn)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: Serving static assets from app
- **Fix**: Configure CDN

### Unoptimized Images (unoptimized-images)
- **Severity**: Low
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Large image files
- **Fix**: Compress images

### No Query Optimization (no-query-optimization)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Inefficient SQL queries
- **Fix**: Optimize queries

---

## 📊 Operational Detectors

### No Logging (no-logging)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: No structured logging
- **Fix**: Add logging framework

### Console Logging (console-logging)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: console.log in production
- **Fix**: Replace with logger

### No Metrics (no-metrics)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: No application metrics
- **Fix**: Add metrics collection

### No Tracing (no-tracing)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: No distributed tracing
- **Fix**: Add tracing headers

### Missing Correlation ID (missing-correlation-id)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: No request correlation
- **Fix**: Add correlation ID

### No Monitoring (no-monitoring)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: No APM integration
- **Fix**: Add monitoring setup

### No Alerting (no-alerting)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: No error alerting
- **Fix**: Configure alerts

### Poor Error Messages (poor-error-messages)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: Generic error messages
- **Fix**: Add specific messages

### No Documentation (no-documentation)
- **Severity**: Low
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Missing API documentation
- **Fix**: Generate docs

### Missing Environment Config (missing-env-config)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: No environment validation
- **Fix**: Add env schema

### No Versioning (no-versioning)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: API without versioning
- **Fix**: Add version prefix

### Missing Request ID (missing-request-id)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: No request tracking
- **Fix**: Add request ID

### No Audit Trail (no-audit-trail)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: No audit logging
- **Fix**: Add audit events

### Poor Naming (poor-naming)
- **Severity**: Low
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Unclear variable/function names
- **Fix**: Suggest better names

### No Feature Flags (no-feature-flags)
- **Severity**: Low
- **Auto-fix**: ⚠️ Partial
- **Pattern**: No feature toggle system
- **Fix**: Add feature flags

---

## 🏗️ Code Quality Detectors

### Code Duplication (code-duplication)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Repeated code blocks
- **Fix**: Extract to functions

### High Complexity (high-complexity)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Cyclomatic complexity > 10
- **Fix**: Split into smaller functions

### Long Functions (long-functions)
- **Severity**: Low
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Functions > 50 lines
- **Fix**: Extract sub-functions

### Dead Code (dead-code)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: Unreachable code
- **Fix**: Remove dead code

### Unused Variables (unused-variables)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: Declared but unused
- **Fix**: Remove unused

### Dependency Bloat (dependency-bloat)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Unused dependencies
- **Fix**: Remove unused packages

### Outdated Dependencies (outdated-dependencies)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Old package versions
- **Fix**: Update safely

### Mixed Patterns (mixed-patterns)
- **Severity**: Low
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Callbacks + Promises + Async
- **Fix**: Standardize on async/await

### Inconsistent Naming (inconsistent-naming)
- **Severity**: Low
- **Auto-fix**: ⚠️ Partial
- **Pattern**: camelCase vs snake_case
- **Fix**: Apply consistent style

### Magic Numbers (magic-numbers)
- **Severity**: Low
- **Auto-fix**: ✅ Yes
- **Pattern**: Hardcoded numbers
- **Fix**: Extract to constants

### Global Variables (global-variables)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Global scope pollution
- **Fix**: Use modules

### Tight Coupling (tight-coupling)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: High interdependency
- **Fix**: Introduce interfaces

### God Object (god-object)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Classes doing too much
- **Fix**: Split responsibilities

### Callback Hell (callback-hell)
- **Severity**: Medium
- **Auto-fix**: ✅ Yes
- **Pattern**: Deeply nested callbacks
- **Fix**: Convert to async/await

### Poor Types (poor-types)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Missing TypeScript types
- **Fix**: Add type annotations

---

## 📋 Compliance Detectors

### PCI - Payment Data (pci-payment-data)
- **Severity**: Critical
- **Auto-fix**: ✅ Yes
- **Pattern**: Handling card data insecurely
- **Fix**: Add PCI compliance wrapper

### GDPR - Personal Data (gdpr-personal-data)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Personal data without consent
- **Fix**: Add GDPR compliance

### GDPR - Right to Delete (gdpr-right-to-delete)
- **Severity**: High
- **Auto-fix**: ⚠️ Partial
- **Pattern**: No data deletion mechanism
- **Fix**: Add deletion endpoints

### HIPAA - Health Data (hipaa-health-data)
- **Severity**: Critical
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Unencrypted health data
- **Fix**: Add encryption

### SOC2 - Audit Logging (soc2-audit-logging)
- **Severity**: High
- **Auto-fix**: ✅ Yes
- **Pattern**: Missing audit trails
- **Fix**: Add comprehensive logging

### CCPA - Data Privacy (ccpa-data-privacy)
- **Severity**: High
- **Auto-fix**: ⚠️ Partial
- **Pattern**: No privacy controls
- **Fix**: Add privacy features

### Accessibility - WCAG (accessibility-wcag)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: Missing accessibility features
- **Fix**: Add ARIA labels

### License Compliance (license-compliance)
- **Severity**: Medium
- **Auto-fix**: ❌ No
- **Pattern**: Incompatible licenses
- **Fix**: Manual review required

### Export Control (export-control)
- **Severity**: High
- **Auto-fix**: ❌ No
- **Pattern**: Encryption without checks
- **Fix**: Add export compliance

### Data Retention (data-retention)
- **Severity**: Medium
- **Auto-fix**: ⚠️ Partial
- **Pattern**: No retention policy
- **Fix**: Add retention logic

---

## Detector Implementation Guide

### Creating a New Detector

```typescript
import { IDetector, Issue, AST, FileContext } from '@prodready/core';

export class MyDetector implements IDetector {
  id = 'my-detector';
  name = 'My Custom Detector';
  category = 'security';
  severity = 'high';
  languages = ['javascript', 'typescript'];
  
  description = 'Detects XYZ vulnerability pattern';
  rationale = 'This pattern can lead to security breaches...';
  
  examples = {
    vulnerable: `
      // Vulnerable code example
      const data = eval(userInput);
    `,
    secure: `
      // Secure alternative
      const data = JSON.parse(userInput);
    `
  };
  
  references = [
    'https://owasp.org/...',
    'https://cwe.mitre.org/...'
  ];
  
  async detect(ast: AST, context: FileContext): Promise<Issue[]> {
    const issues: Issue[] = [];
    
    ast.traverse({
      CallExpression(node) {
        if (node.callee.name === 'eval') {
          issues.push({
            detectorId: this.id,
            type: 'unsafe-eval',
            severity: this.severity,
            line: node.loc.start.line,
            column: node.loc.start.column,
            message: 'eval() usage detected - security risk',
            suggestion: 'Use JSON.parse() for parsing JSON data',
            autoFixAvailable: true
          });
        }
      }
    });
    
    return issues;
  }
}
```

### Detector Categories

Each detector belongs to one of these categories:
- `security`: Vulnerabilities and security risks
- `reliability`: Stability and error handling
- `performance`: Speed and efficiency
- `operational`: Monitoring and operations
- `quality`: Code maintainability
- `compliance`: Regulatory requirements

### Severity Levels

- `critical`: Must fix immediately (blocks deployment)
- `high`: Should fix soon (security/stability risk)
- `medium`: Should fix (best practice violation)
- `low`: Consider fixing (minor improvement)

### Auto-fix Availability

- ✅ **Yes**: Fully automated fix available
- ⚠️ **Partial**: Semi-automated with manual review
- ❌ **No**: Manual intervention required

## Testing Detectors

Every detector must have comprehensive tests:

```typescript
describe('SQLInjectionDetector', () => {
  const detector = new SQLInjectionDetector();
  
  it('detects string concatenation in query', async () => {
    const code = `db.query("SELECT * FROM users WHERE id = " + userId)`;
    const issues = await detector.detect(parse(code), context);
    
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('sql-injection');
  });
  
  it('does not flag parameterized queries', async () => {
    const code = `db.query("SELECT * FROM users WHERE id = ?", [userId])`;
    const issues = await detector.detect(parse(code), context);
    
    expect(issues).toHaveLength(0);
  });
});
```

## Contributing New Detectors

1. Identify a production readiness issue
2. Create detector implementing `IDetector`
3. Add comprehensive tests
4. Add fixer if possible
5. Document in this file
6. Submit PR with examples

The goal is to catch every common production issue before it reaches production!