# Testing Strategy

This document outlines the comprehensive testing approach for ProdReady to ensure reliability, accuracy, and maintainability.

## Testing Philosophy

1. **Test Real Scenarios** - Use actual AI-generated code as test cases
2. **Fast Feedback** - Most tests should run in milliseconds
3. **Prevent Regressions** - Every bug becomes a test
4. **Test the Fix** - Ensure fixes actually work
5. **User-Centric** - Test the experience, not just the code

## Testing Levels

### 1. Unit Tests

Test individual components in isolation.

#### Analyzer Tests

```typescript
// tests/analyzers/security/sql-injection.test.ts
describe('SQLInjectionAnalyzer', () => {
  let analyzer: SQLInjectionAnalyzer;
  
  beforeEach(() => {
    analyzer = new SQLInjectionAnalyzer();
  });
  
  describe('String Concatenation', () => {
    it('detects basic string concatenation', async () => {
      const code = `
        app.get('/user/:id', async (req, res) => {
          const user = await db.query("SELECT * FROM users WHERE id = " + req.params.id);
          res.json(user);
        });
      `;
      
      const ast = parse(code);
      const issues = await analyzer.analyze(ast, {} as Context);
      
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        type: 'sql-injection',
        severity: 'critical',
        line: 3,
        column: 23
      });
    });
    
    it('detects template literal injection', async () => {
      const code = `
        const query = \`SELECT * FROM users WHERE name = '\${username}'\`;
        db.query(query);
      `;
      
      const issues = await analyzer.analyze(parse(code), {} as Context);
      expect(issues).toHaveLength(1);
    });
    
    it('ignores parameterized queries', async () => {
      const code = `
        const user = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
      `;
      
      const issues = await analyzer.analyze(parse(code), {} as Context);
      expect(issues).toHaveLength(0);
    });
  });
  
  describe('Edge Cases', () => {
    it('handles complex concatenation', async () => {
      const code = `
        const query = "SELECT * FROM " + table + " WHERE id = " + id;
      `;
      
      const issues = await analyzer.analyze(parse(code), {} as Context);
      expect(issues).toHaveLength(1);
    });
    
    it('detects SQL in template functions', async () => {
      const code = `
        const result = await sql\`SELECT * FROM users WHERE id = \${id}\`;
      `;
      
      // Should detect unless it's a known safe template tag
      const issues = await analyzer.analyze(parse(code), {} as Context);
      expect(issues).toHaveLength(1);
    });
  });
});
```

#### Transformer Tests

```typescript
// tests/transformers/security/sql-injection-fixer.test.ts
describe('SQLInjectionFixer', () => {
  let fixer: SQLInjectionFixer;
  
  beforeEach(() => {
    fixer = new SQLInjectionFixer();
  });
  
  it('converts string concatenation to parameterized query', async () => {
    const input = `
      const user = await db.query("SELECT * FROM users WHERE id = " + userId);
    `;
    
    const expected = `
      const user = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
    `;
    
    const result = await fixer.fix(input);
    expect(normalize(result)).toBe(normalize(expected));
  });
  
  it('handles multiple parameters', async () => {
    const input = `
      db.query("SELECT * FROM users WHERE age > " + minAge + " AND age < " + maxAge);
    `;
    
    const expected = `
      db.query("SELECT * FROM users WHERE age > ? AND age < ?", [minAge, maxAge]);
    `;
    
    const result = await fixer.fix(input);
    expect(normalize(result)).toBe(normalize(expected));
  });
  
  it('preserves query structure', async () => {
    const input = `
      const complex = await db.query(
        "SELECT u.*, p.* " +
        "FROM users u " +
        "JOIN posts p ON u.id = p.user_id " +
        "WHERE u.id = " + id
      );
    `;
    
    const result = await fixer.fix(input);
    expect(result).toContain('?');
    expect(result).toContain('[id]');
    expect(result).toContain('JOIN posts');
  });
});
```

### 2. Integration Tests

Test complete workflows and component interactions.

```typescript
// tests/integration/express-api.test.ts
describe('Express API Analysis', () => {
  it('analyzes a complete Express app', async () => {
    const projectPath = 'tests/fixtures/express-blog-api';
    
    const engine = new ProdReadyEngine();
    const result = await engine.analyze(projectPath);
    
    // Should find common issues
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'sql-injection' })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'no-error-handling' })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'no-rate-limiting' })
    );
    
    // Score should reflect issues
    expect(result.score).toBeLessThan(50);
  });
  
  it('fixes issues and improves score', async () => {
    const projectPath = 'tests/fixtures/express-blog-api';
    
    const engine = new ProdReadyEngine();
    const analysis = await engine.analyze(projectPath);
    const beforeScore = analysis.score;
    
    // Apply fixes
    const fixResult = await engine.fix(analysis);
    
    // Re-analyze
    const afterAnalysis = await engine.analyze(projectPath);
    
    expect(afterAnalysis.score).toBeGreaterThan(beforeScore);
    expect(afterAnalysis.issues.length).toBeLessThan(analysis.issues.length);
    
    // Verify specific fixes
    const sqlInjectionFixed = !afterAnalysis.issues.find(
      i => i.type === 'sql-injection'
    );
    expect(sqlInjectionFixed).toBe(true);
  });
});
```

### 3. Snapshot Tests

Ensure transformations remain consistent.

```typescript
// tests/snapshots/transformations.test.ts
describe('Transformation Snapshots', () => {
  const scenarios = [
    'sql-injection-basic',
    'no-error-handling-async',
    'hardcoded-secrets-api-key',
    'xss-template-literal',
    'no-input-validation-express'
  ];
  
  scenarios.forEach(scenario => {
    it(`transforms ${scenario} correctly`, async () => {
      const input = await readFixture(`${scenario}/input.js`);
      const engine = new ProdReadyEngine();
      
      const result = await engine.transformFile(input);
      
      expect(result.code).toMatchSnapshot();
      expect(result.fixes).toMatchSnapshot();
    });
  });
});
```

### 4. Performance Tests

Ensure ProdReady performs well on real codebases.

```typescript
// tests/performance/large-codebase.test.ts
describe('Performance', () => {
  it('analyzes 1000 files in under 10 seconds', async () => {
    const projectPath = 'tests/fixtures/large-project';
    
    const start = Date.now();
    const engine = new ProdReadyEngine();
    await engine.analyze(projectPath);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(10000);
  });
  
  it('uses less than 500MB memory', async () => {
    const projectPath = 'tests/fixtures/large-project';
    const initialMemory = process.memoryUsage().heapUsed;
    
    const engine = new ProdReadyEngine();
    await engine.analyze(projectPath);
    
    const memoryUsed = process.memoryUsage().heapUsed - initialMemory;
    expect(memoryUsed).toBeLessThan(500 * 1024 * 1024);
  });
  
  it('handles concurrent file analysis', async () => {
    const files = Array.from({ length: 100 }, (_, i) => 
      `tests/fixtures/concurrent/file${i}.js`
    );
    
    const engine = new ProdReadyEngine();
    const start = Date.now();
    
    await Promise.all(files.map(f => engine.analyzeFile(f)));
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000); // Should parallelize well
  });
});
```

### 5. End-to-End Tests

Test the complete CLI experience.

```typescript
// tests/e2e/cli.test.ts
describe('CLI E2E', () => {
  it('scans and fixes a project', async () => {
    const projectDir = await createTempProject('express-api');
    
    // Run scan
    const scanResult = await execa('prodready', ['scan', projectDir]);
    expect(scanResult.stdout).toContain('Production Readiness Score');
    expect(scanResult.stdout).toMatch(/\d+\/100/);
    
    // Run fix
    const fixResult = await execa('prodready', ['fix', projectDir]);
    expect(fixResult.stdout).toContain('Applied');
    expect(fixResult.stdout).toContain('fixes');
    
    // Verify files changed
    const gitStatus = await execa('git', ['status', '--porcelain'], {
      cwd: projectDir
    });
    expect(gitStatus.stdout).not.toBe('');
  });
  
  it('respects configuration file', async () => {
    const projectDir = await createTempProject('configured-project');
    await writeFile(
      path.join(projectDir, '.prodready.yml'),
      `
        analyzers:
          security:
            sql-injection:
              enabled: false
      `
    );
    
    const result = await execa('prodready', ['scan', projectDir]);
    expect(result.stdout).not.toContain('SQL Injection');
  });
});
```

### 6. Visual Regression Tests

Ensure CLI output remains beautiful.

```typescript
// tests/visual/cli-output.test.ts
describe('CLI Visual Output', () => {
  it('displays scan results correctly', async () => {
    const mockData = {
      score: 35,
      issues: [
        { type: 'sql-injection', severity: 'critical', count: 2 },
        { type: 'no-error-handling', severity: 'high', count: 5 }
      ]
    };
    
    const output = renderScanResults(mockData);
    expect(output).toMatchSnapshot();
    
    // Test specific visual elements
    expect(output).toContain('🔴'); // Critical marker
    expect(output).toContain('35/100'); // Score
  });
});
```

## Test Fixtures

### AI-Generated Code Samples

Collect real examples from various AI tools:

```
tests/fixtures/
├── chatgpt/
│   ├── express-api/
│   ├── react-app/
│   └── cli-tool/
├── github-copilot/
│   ├── rest-api/
│   └── websocket-server/
├── claude/
│   ├── graphql-server/
│   └── microservice/
└── common-patterns/
    ├── crud-api/
    ├── auth-system/
    └── payment-integration/
```

### Known Vulnerabilities

Test against real vulnerability patterns:

```javascript
// tests/fixtures/vulnerabilities/sqli-variations.js
module.exports = [
  {
    name: 'Basic concatenation',
    code: 'db.query("SELECT * FROM users WHERE id = " + id)',
    fixed: 'db.query("SELECT * FROM users WHERE id = ?", [id])'
  },
  {
    name: 'Template literal',
    code: 'db.query(`SELECT * FROM users WHERE id = ${id}`)',
    fixed: 'db.query("SELECT * FROM users WHERE id = ?", [id])'
  },
  {
    name: 'Complex query building',
    code: `
      let query = "SELECT * FROM users WHERE 1=1";
      if (name) query += " AND name = '" + name + "'";
      if (age) query += " AND age = " + age;
      db.query(query);
    `,
    fixed: `
      let query = "SELECT * FROM users WHERE 1=1";
      const params = [];
      if (name) {
        query += " AND name = ?";
        params.push(name);
      }
      if (age) {
        query += " AND age = ?";
        params.push(age);
      }
      db.query(query, params);
    `
  }
];
```

## Testing Utilities

### Code Normalization

```typescript
// tests/utils/normalize.ts
export function normalize(code: string): string {
  // Remove extra whitespace, normalize line endings
  return code
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*{\s*/g, ' { ')
    .replace(/\s*}\s*/g, ' } ')
    .replace(/\s*;\s*/g, '; ');
}
```

### AST Helpers

```typescript
// tests/utils/ast.ts
export function findNode(ast: AST, type: string): Node | null {
  let found: Node | null = null;
  
  traverse(ast, {
    [type]: (path) => {
      found = path.node;
      path.stop();
    }
  });
  
  return found;
}

export function countNodes(ast: AST, type: string): number {
  let count = 0;
  
  traverse(ast, {
    [type]: () => count++
  });
  
  return count;
}
```

### Mock Context Builder

```typescript
// tests/utils/context.ts
export function createMockContext(overrides = {}): Context {
  return {
    projectType: 'node',
    framework: 'express',
    dependencies: ['express', 'mysql'],
    authentication: 'jwt',
    routes: [
      { method: 'GET', path: '/api/users/:id', handler: 'getUser' },
      { method: 'POST', path: '/api/users', handler: 'createUser' }
    ],
    ...overrides
  };
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
    
    - name: Setup Node.js
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
    
    - name: Check coverage
      run: npm run test:coverage
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      
  performance:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - run: npm ci
    - run: npm run test:performance
    - name: Store benchmark result
      uses: benchmark-action/github-action-benchmark@v1
```

### Pre-commit Hooks

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:affected && npm run lint"
    }
  }
}
```

## Test Coverage Goals

- **Overall**: > 90%
- **Analyzers**: > 95% (critical path)
- **Transformers**: > 95% (critical path)
- **Core Engine**: > 90%
- **CLI**: > 80%
- **Utilities**: > 85%

## Testing Best Practices

1. **Test Behavior, Not Implementation**
   ```typescript
   // ❌ Bad: Testing implementation details
   expect(analyzer._patterns.sql.test(code)).toBe(true);
   
   // ✅ Good: Testing behavior
   expect(analyzer.analyze(code)).toContainIssue('sql-injection');
   ```

2. **Use Descriptive Test Names**
   ```typescript
   // ❌ Bad
   it('works', () => {});
   
   // ✅ Good
   it('detects SQL injection in template literals with user input', () => {});
   ```

3. **Arrange-Act-Assert Pattern**
   ```typescript
   it('fixes hardcoded API key', async () => {
     // Arrange
     const code = 'const key = "sk_live_abc123";';
     const fixer = new SecretsFixer();
     
     // Act
     const result = await fixer.fix(code);
     
     // Assert
     expect(result).toContain('process.env.');
     expect(result).not.toContain('sk_live');
   });
   ```

4. **Test Edge Cases**
   - Empty files
   - Syntax errors
   - Unicode in strings
   - Very large files
   - Deeply nested code
   - Malformed AST

5. **Mock External Dependencies**
   ```typescript
   jest.mock('fs/promises', () => ({
     readFile: jest.fn().mockResolvedValue('mock file content')
   }));
   ```

## Debugging Tests

### Verbose Logging

```typescript
// Enable debug logging in tests
beforeAll(() => {
  process.env.LOG_LEVEL = 'debug';
});

// Use debug helper
function debugAST(ast: AST) {
  console.log(JSON.stringify(ast, null, 2));
}
```

### Test Isolation

```typescript
// Ensure tests don't affect each other
beforeEach(() => {
  jest.clearAllMocks();
  // Reset any global state
});

afterEach(() => {
  // Clean up temp files
});
```

## Future Testing Enhancements

1. **Property-Based Testing**
   - Generate random code samples
   - Ensure fixes don't break valid code

2. **Mutation Testing**
   - Verify test quality
   - Find gaps in coverage

3. **Fuzz Testing**
   - Test with malformed input
   - Ensure graceful handling

4. **Visual Regression Testing**
   - Screenshot CLI output
   - Ensure consistent formatting

5. **Benchmark Suite**
   - Track performance over time
   - Prevent performance regressions