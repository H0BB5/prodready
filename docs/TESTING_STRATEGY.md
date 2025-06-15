# Testing Strategy for ProdReady

## Overview

ProdReady's testing strategy ensures reliability, accuracy, and maintainability through comprehensive automated testing at multiple levels. Our goal is 90%+ code coverage with a focus on real-world scenarios.

## Testing Philosophy

1. **Real-World First**: Test with actual AI-generated code patterns
2. **Fast Feedback**: Unit tests run in <10 seconds, integration in <1 minute
3. **Prevent Regressions**: Every bug becomes a test case
4. **Test the Fix**: Verify fixes work and don't break existing code
5. **Educational Value**: Tests document expected behavior

## Testing Pyramid

```
         ╱─────────────╲
        ╱   E2E Tests   ╲       5%
       ╱─────────────────╲
      ╱ Integration Tests ╲     20%
     ╱───────────────────────╲
    ╱     Unit Tests         ╲  75%
   ╱─────────────────────────────╲
```

## Test Categories

### 1. Unit Tests (75% of tests)

Fast, isolated tests for individual components.

#### Detector Unit Tests

```typescript
// test/detectors/security/sql-injection.test.ts
import { SQLInjectionDetector } from '@/detectors/security/sql-injection';
import { parse } from '@/parsers/javascript';
import { createMockContext } from '@/test-utils';

describe('SQLInjectionDetector', () => {
  let detector: SQLInjectionDetector;
  let context: FileContext;
  
  beforeEach(() => {
    detector = new SQLInjectionDetector();
    context = createMockContext();
  });
  
  describe('vulnerability detection', () => {
    it('detects string concatenation in query', async () => {
      const code = `
        const userId = req.params.id;
        db.query("SELECT * FROM users WHERE id = " + userId);
      `;
      
      const ast = parse(code);
      const issues = await detector.detect(ast, context);
      
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        type: 'sql-injection',
        severity: 'critical',
        line: 3,
        message: expect.stringContaining('SQL injection')
      });
    });
    
    it('detects template literal injection', async () => {
      const code = `
        db.query(\`SELECT * FROM users WHERE name = '\${userName}'\`);
      `;
      
      const issues = await detector.detect(parse(code), context);
      expect(issues).toHaveLength(1);
    });
    
    it('detects SQL in loop (N+1 risk)', async () => {
      const code = `
        users.forEach(user => {
          db.query("SELECT * FROM orders WHERE user_id = " + user.id);
        });
      `;
      
      const issues = await detector.detect(parse(code), context);
      expect(issues).toHaveLength(2); // SQL injection + N+1
    });
  });
  
  describe('safe patterns', () => {
    it('allows parameterized queries', async () => {
      const code = `
        db.query("SELECT * FROM users WHERE id = ?", [userId]);
      `;
      
      const issues = await detector.detect(parse(code), context);
      expect(issues).toHaveLength(0);
    });
    
    it('allows query builders', async () => {
      const code = `
        db.select('*').from('users').where('id', userId);
      `;
      
      const issues = await detector.detect(parse(code), context);
      expect(issues).toHaveLength(0);
    });
  });
  
  describe('edge cases', () => {
    it('handles nested function calls', async () => {
      const code = `
        db.query(buildQuery("SELECT * FROM users WHERE id = " + getId()));
      `;
      
      const issues = await detector.detect(parse(code), context);
      expect(issues).toHaveLength(1);
    });
  });
});
```

#### Fixer Unit Tests

```typescript
// test/fixers/security/sql-injection-fixer.test.ts
describe('SQLInjectionFixer', () => {
  let fixer: SQLInjectionFixer;
  
  beforeEach(() => {
    fixer = new SQLInjectionFixer();
  });
  
  it('converts string concatenation to parameters', async () => {
    const input = `db.query("SELECT * FROM users WHERE id = " + userId);`;
    const expected = `db.query("SELECT * FROM users WHERE id = ?", [userId]);`;
    
    const result = await fixer.fix(input, issues[0]);
    
    expect(result.code).toBe(expected);
    expect(result.explanation).toContain('parameterized query');
  });
  
  it('handles multiple injections', async () => {
    const input = `
      db.query("SELECT * FROM users WHERE id = " + id + " AND name = '" + name + "'");
    `;
    const expected = `
      db.query("SELECT * FROM users WHERE id = ? AND name = ?", [id, name]);
    `;
    
    const result = await fixer.fix(input, issues[0]);
    expect(result.code).toBe(expected);
  });
  
  it('preserves query formatting', async () => {
    const input = `
      db.query(
        "SELECT * FROM users " +
        "WHERE id = " + userId
      );
    `;
    
    const result = await fixer.fix(input, issues[0]);
    expect(result.code).toMatchSnapshot();
  });
});
```

#### Parser Unit Tests

```typescript
// test/parsers/javascript.test.ts
describe('JavaScriptParser', () => {
  it('parses ES6+ syntax', () => {
    const code = `
      const fn = async (x) => await x?.foo?.();
    `;
    
    const ast = parser.parse(code);
    expect(ast.type).toBe('Program');
    expect(ast.errors).toHaveLength(0);
  });
  
  it('handles JSX', () => {
    const code = `<Button onClick={() => {}}>{children}</Button>`;
    const ast = parser.parse(code);
    expect(ast.errors).toHaveLength(0);
  });
});
```

### 2. Integration Tests (20% of tests)

Test how components work together.

#### File Analysis Integration

```typescript
// test/integration/file-analysis.test.ts
describe('File Analysis Integration', () => {
  it('analyzes a complete Express API file', async () => {
    const filePath = 'test/fixtures/express-api.js';
    const analyzer = new FileAnalyzer();
    
    const result = await analyzer.analyze(filePath);
    
    expect(result.score).toBeLessThan(50);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        type: 'sql-injection'
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        type: 'no-error-handling'
      })
    );
  });
  
  it('applies all fixes correctly', async () => {
    const transformer = new Transformer();
    const result = await transformer.transform(analysis);
    
    // Re-analyze fixed code
    const fixedAnalysis = await analyzer.analyze(result.code);
    expect(fixedAnalysis.score).toBeGreaterThan(90);
  });
});
```

#### Context-Aware Detection

```typescript
// test/integration/context-detection.test.ts
describe('Context-Aware Detection', () => {
  it('applies PCI compliance to payment code', async () => {
    const code = `
      async function processPayment(cardNumber, amount) {
        const charge = await stripe.charges.create({
          amount: amount * 100,
          source: cardNumber
        });
        console.log(charge);
        return charge;
      }
    `;
    
    const analysis = await analyzer.analyze(code);
    
    expect(analysis.context).toContain('payment');
    expect(analysis.issues).toContainEqual(
      expect.objectContaining({
        type: 'pci-compliance',
        message: expect.stringContaining('PCI')
      })
    );
  });
});
```

### 3. End-to-End Tests (5% of tests)

Test complete workflows.

```typescript
// test/e2e/cli.test.ts
describe('CLI E2E Tests', () => {
  it('scans and fixes a project', async () => {
    const projectPath = 'test/fixtures/ai-generated-api';
    
    // Run scan
    const scanResult = await runCLI(['scan', projectPath]);
    expect(scanResult.stdout).toContain('Found 23 issues');
    expect(scanResult.stdout).toContain('Score: 34/100');
    
    // Run fix
    const fixResult = await runCLI(['fix', projectPath, '--yes']);
    expect(fixResult.stdout).toContain('Fixed 20 issues');
    
    // Verify improvement
    const rescanResult = await runCLI(['scan', projectPath]);
    expect(rescanResult.stdout).toContain('Score: 92/100');
  });
  
  it('generates report', async () => {
    const result = await runCLI(['report', projectPath, '--format=html']);
    
    const report = fs.readFileSync('prodready-report.html', 'utf-8');
    expect(report).toContain('Production Readiness Report');
    expect(report).toContain('Security: 95/100');
  });
});
```

## Test Fixtures

### AI-Generated Code Samples

Store real AI-generated code as test fixtures:

```
test/fixtures/
├── chatgpt/
│   ├── express-api-basic.js
│   ├── user-auth-system.js
│   └── payment-processor.js
├── claude/
│   ├── rest-api.js
│   ├── websocket-server.js
│   └── data-pipeline.js
└── copilot/
    ├── crud-operations.js
    ├── file-upload.js
    └── email-service.js
```

### Vulnerability Patterns

```typescript
// test/fixtures/vulnerabilities/sql-injection.js
export const SQL_INJECTION_PATTERNS = [
  {
    name: 'Basic concatenation',
    vulnerable: `db.query("SELECT * FROM users WHERE id = " + id)`,
    fixed: `db.query("SELECT * FROM users WHERE id = ?", [id])`
  },
  {
    name: 'Template literal',
    vulnerable: `db.query(\`SELECT * FROM users WHERE id = \${id}\`)`,
    fixed: `db.query("SELECT * FROM users WHERE id = ?", [id])`
  },
  {
    name: 'Multiple parameters',
    vulnerable: `db.query("SELECT * FROM users WHERE id = " + id + " AND status = '" + status + "'")`,
    fixed: `db.query("SELECT * FROM users WHERE id = ? AND status = ?", [id, status])`
  }
];
```

## Performance Testing

```typescript
// test/performance/analyzer.perf.ts
describe('Analyzer Performance', () => {
  it('analyzes 1000 lines in <1 second', async () => {
    const largeFile = generateLargeFile(1000);
    
    const start = performance.now();
    await analyzer.analyze(largeFile);
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(1000);
  });
  
  it('analyzes project with 100 files in <30 seconds', async () => {
    const start = performance.now();
    await analyzer.analyzeProject('test/fixtures/large-project');
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(30000);
  });
});
```

## Mutation Testing

Use Stryker for mutation testing:

```javascript
// stryker.conf.js
module.exports = {
  mutate: ['src/**/*.ts', '!src/**/*.test.ts'],
  testRunner: 'jest',
  coverageAnalysis: 'perTest',
  thresholds: { high: 90, low: 80, break: 75 }
};
```

## Snapshot Testing

For complex transformations:

```typescript
// test/snapshots/transform.test.ts
describe('Transform Snapshots', () => {
  const files = fs.readdirSync('test/fixtures/vulnerable');
  
  files.forEach(file => {
    it(`transforms ${file}`, async () => {
      const input = fs.readFileSync(`test/fixtures/vulnerable/${file}`);
      const result = await transformer.transformFile(input);
      
      expect(result.code).toMatchSnapshot();
      expect(result.diff).toMatchSnapshot();
    });
  });
});
```

## Test Utilities

### Mock Builders

```typescript
// test/utils/mocks.ts
export function createMockContext(overrides?: Partial<FileContext>): FileContext {
  return {
    filePath: '/test/file.js',
    language: 'javascript',
    framework: 'express',
    dependencies: [],
    ast: createMockAST(),
    ...overrides
  };
}

export function createMockIssue(overrides?: Partial<Issue>): Issue {
  return {
    type: 'test-issue',
    severity: 'medium',
    line: 1,
    column: 1,
    message: 'Test issue',
    ...overrides
  };
}
```

### Test Helpers

```typescript
// test/utils/helpers.ts
export async function analyzeCode(code: string): Promise<FileAnalysis> {
  const analyzer = new FileAnalyzer();
  return analyzer.analyzeContent(code, 'test.js');
}

export async function expectNoIssues(code: string) {
  const analysis = await analyzeCode(code);
  expect(analysis.issues).toHaveLength(0);
}

export async function expectIssue(code: string, type: string) {
  const analysis = await analyzeCode(code);
  expect(analysis.issues).toContainEqual(
    expect.objectContaining({ type })
  );
}
```

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests
      run: npm run test:unit
    
    - name: Run integration tests
      run: npm run test:integration
    
    - name: Run E2E tests
      run: npm run test:e2e
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

## Test Coverage Requirements

- Overall: 90%+
- Detectors: 95%+ (critical for accuracy)
- Fixers: 95%+ (must not break code)
- Core Engine: 90%+
- CLI: 80%+
- Utilities: 70%+

## Testing Best Practices

### 1. Test Naming

```typescript
// Good
it('detects SQL injection when user input is concatenated in query string', ...)

// Bad
it('works correctly', ...)
```

### 2. Test Independence

Each test should be independent:

```typescript
beforeEach(() => {
  // Fresh setup for each test
  detector = new SQLInjectionDetector();
  context = createMockContext();
});

afterEach(() => {
  // Clean up if needed
  jest.clearAllMocks();
});
```

### 3. Test Data Builders

```typescript
class CodeBuilder {
  private code = '';
  
  withFunction(name: string, body: string): this {
    this.code += `function ${name}() { ${body} }\n`;
    return this;
  }
  
  withSQLQuery(query: string): this {
    this.code += `db.query(${query});\n`;
    return this;
  }
  
  build(): string {
    return this.code;
  }
}

// Usage
const code = new CodeBuilder()
  .withFunction('getUser', 'return db.query("SELECT * FROM users WHERE id = " + id)')
  .build();
```

### 4. Error Case Testing

Always test error conditions:

```typescript
it('handles malformed AST gracefully', async () => {
  const malformedAST = { type: 'Unknown' };
  
  expect(async () => {
    await detector.detect(malformedAST, context);
  }).not.toThrow();
});
```

## Regression Testing

Every bug becomes a test:

```typescript
// test/regressions/issue-123.test.ts
describe('Regression: Issue #123 - False positive on template literals', () => {
  it('does not flag safe template literals', async () => {
    const code = `
      // This was incorrectly flagged as SQL injection
      const message = \`User \${userName} logged in\`;
      console.log(message);
    `;
    
    const issues = await analyzeCode(code);
    const sqlInjectionIssues = issues.filter(i => i.type === 'sql-injection');
    
    expect(sqlInjectionIssues).toHaveLength(0);
  });
});
```

## Load Testing

For performance validation:

```typescript
// test/load/analyzer.load.ts
describe('Analyzer Load Tests', () => {
  it('handles 10 concurrent file analyses', async () => {
    const files = Array(10).fill('test/fixtures/large-file.js');
    
    const start = Date.now();
    const results = await Promise.all(
      files.map(f => analyzer.analyze(f))
    );
    const duration = Date.now() - start;
    
    expect(results).toHaveLength(10);
    expect(duration).toBeLessThan(5000);
  });
});
```

## Test Reports

Generate comprehensive test reports:

```bash
# Coverage report
npm run test:coverage

# HTML report
npm run test:report

# Performance report
npm run test:perf -- --reporter=html
```

## Debugging Tests

### VS Code Launch Configuration

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Jest Test",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": [
    "--runInBand",
    "--no-coverage",
    "${relativeFile}"
  ],
  "console": "integratedTerminal"
}
```

### Test Debugging Tips

1. Use `test.only()` to run single test
2. Add `debugger` statements
3. Use verbose logging in tests
4. Inspect AST structure with `console.dir(ast, { depth: null })`

## Conclusion

A comprehensive testing strategy ensures ProdReady reliably transforms AI-generated code into production-ready applications. By testing with real AI-generated patterns and maintaining high coverage, we build confidence in our transformations and catch regressions early.