import { TransformationEngine } from '../../../src/transformers/transformation-engine';
import { SQLInjectionFixer } from '../../../src/transformers/security/sql-injection-fixer';
import { ErrorHandlingFixer } from '../../../src/transformers/reliability/error-handling-fixer';
import { HardcodedSecretsFixer } from '../../../src/transformers/security/hardcoded-secrets-fixer';
import { parse, generate } from '../../../src/utils/ast';
import { Issue, Fix } from '../../../src/types';

describe('TransformationEngine', () => {
  let engine: TransformationEngine;

  beforeEach(() => {
    engine = new TransformationEngine();
  });

  describe('Registration', () => {
    it('should register fixers', () => {
      const fixer = new SQLInjectionFixer();
      engine.registerFixer('sql-injection', fixer);

      expect(engine.hasFixer('sql-injection')).toBe(true);
    });

    it('should register multiple fixers', () => {
      engine.registerFixer('sql-injection', new SQLInjectionFixer());
      engine.registerFixer('no-error-handling', new ErrorHandlingFixer());
      engine.registerFixer('hardcoded-secret', new HardcodedSecretsFixer());

      expect(engine.hasFixer('sql-injection')).toBe(true);
      expect(engine.hasFixer('no-error-handling')).toBe(true);
      expect(engine.hasFixer('hardcoded-secret')).toBe(true);
    });
  });

  describe('Transformation', () => {
    beforeEach(() => {
      engine.registerFixer('sql-injection', new SQLInjectionFixer());
      engine.registerFixer('no-error-handling', new ErrorHandlingFixer());
      engine.registerFixer('hardcoded-secret', new HardcodedSecretsFixer());
    });

    it('should transform code with single issue', async () => {
      const code = `
        const user = await db.query("SELECT * FROM users WHERE id = " + userId);
      `;

      const issue: Issue = {
        id: '1',
        type: 'sql-injection',
        severity: 'critical',
        category: 'security',
        message: 'SQL injection vulnerability',
        line: 2,
        column: 23,
        file: 'test.js',
      };

      const result = await engine.transform(code, [issue]);

      expect(result.transformedCode).toContain('?');
      expect(result.transformedCode).toContain('[userId]');
      expect(result.appliedFixes).toHaveLength(1);
      expect(result.appliedFixes[0].issueId).toBe('1');
      expect(result.appliedFixes[0].success).toBe(true);
    });

    it('should transform code with multiple issues', async () => {
      const code = `
        async function getUser(id) {
          const user = await db.query("SELECT * FROM users WHERE id = " + id);
          return user;
        }
        
        const apiKey = "sk_live_secretkey123";
      `;

      const issues: Issue[] = [
        {
          id: '1',
          type: 'sql-injection',
          severity: 'critical',
          category: 'security',
          message: 'SQL injection vulnerability',
          line: 3,
          file: 'test.js',
        },
        {
          id: '2',
          type: 'no-error-handling',
          severity: 'high',
          category: 'reliability',
          message: 'Missing error handling',
          line: 2,
          file: 'test.js',
        },
        {
          id: '3',
          type: 'hardcoded-secret',
          severity: 'high',
          category: 'security',
          message: 'Hardcoded API key',
          line: 7,
          file: 'test.js',
        },
      ];

      const result = await engine.transform(code, issues);

      // Should have all fixes applied
      expect(result.appliedFixes).toHaveLength(3);
      expect(result.appliedFixes.every(f => f.success)).toBe(true);

      // Check transformations
      expect(result.transformedCode).toContain('try {');
      expect(result.transformedCode).toContain('catch');
      expect(result.transformedCode).toContain('?');
      expect(result.transformedCode).toContain('process.env');
    });

    it('should handle transformation failures gracefully', async () => {
      const code = `invalid javascript {{{ code`;

      const issue: Issue = {
        id: '1',
        type: 'sql-injection',
        severity: 'critical',
        category: 'security',
        message: 'SQL injection',
        line: 1,
        file: 'test.js',
      };

      const result = await engine.transform(code, [issue]);

      expect(result.appliedFixes).toHaveLength(1);
      expect(result.appliedFixes[0].success).toBe(false);
      expect(result.appliedFixes[0].error).toBeDefined();
      expect(result.transformedCode).toBe(code); // Should return original on failure
    });

    it('should apply fixes in correct order', async () => {
      const code = `
        async function processPayment(amount, token) {
          const stripe = require('stripe')('sk_live_secret');
          const charge = await stripe.charges.create({
            amount: amount * 100,
            currency: 'usd',
            source: token
          });
          return charge;
        }
      `;

      const issues: Issue[] = [
        {
          id: '1',
          type: 'hardcoded-secret',
          severity: 'critical',
          category: 'security',
          message: 'Hardcoded Stripe key',
          line: 3,
          file: 'test.js',
        },
        {
          id: '2',
          type: 'no-error-handling',
          severity: 'high',
          category: 'reliability',
          message: 'Missing error handling in payment processing',
          line: 2,
          file: 'test.js',
        },
      ];

      const result = await engine.transform(code, issues);

      // Both fixes should be applied
      expect(result.transformedCode).toContain('process.env.STRIPE_SECRET_KEY');
      expect(result.transformedCode).toContain('try {');
      expect(result.transformedCode).toContain('catch (error)');
    });

    it('should not apply conflicting fixes', async () => {
      // Mock a scenario where two fixes would conflict
      const code = `const value = computeValue();`;

      const issues: Issue[] = [
        {
          id: '1',
          type: 'mock-issue-1',
          severity: 'high',
          category: 'test',
          message: 'Issue 1',
          line: 1,
          file: 'test.js',
        },
        {
          id: '2',
          type: 'mock-issue-2',
          severity: 'high',
          category: 'test',
          message: 'Issue 2',
          line: 1,
          file: 'test.js',
        },
      ];

      // Register mock fixers that would conflict
      const mockFixer1 = {
        canFix: jest.fn().mockReturnValue(true),
        fix: jest.fn().mockResolvedValue({
          transformedCode: 'const value = await computeValue();',
          explanation: 'Made async',
        }),
      };

      const mockFixer2 = {
        canFix: jest.fn().mockReturnValue(true),
        fix: jest.fn().mockResolvedValue({
          transformedCode: 'const value = computeValue() || defaultValue;',
          explanation: 'Added default',
        }),
      };

      engine.registerFixer('mock-issue-1', mockFixer1);
      engine.registerFixer('mock-issue-2', mockFixer2);

      const result = await engine.transform(code, issues);

      // Should apply only one fix to avoid conflicts
      expect(result.appliedFixes.filter(f => f.success)).toHaveLength(1);
    });
  });

  describe('Fix Preview', () => {
    beforeEach(() => {
      engine.registerFixer('sql-injection', new SQLInjectionFixer());
    });

    it('should generate preview without applying changes', async () => {
      const code = `
        const user = await db.query("SELECT * FROM users WHERE id = " + userId);
      `;

      const issue: Issue = {
        id: '1',
        type: 'sql-injection',
        severity: 'critical',
        category: 'security',
        message: 'SQL injection vulnerability',
        line: 2,
        file: 'test.js',
      };

      const preview = await engine.preview(code, [issue]);

      expect(preview).toHaveLength(1);
      expect(preview[0].issueId).toBe('1');
      expect(preview[0].original).toContain('+');
      expect(preview[0].fixed).toContain('?');
      expect(preview[0].diff).toBeDefined();
    });
  });

  describe('Specific Fixers', () => {
    describe('SQLInjectionFixer', () => {
      let fixer: SQLInjectionFixer;

      beforeEach(() => {
        fixer = new SQLInjectionFixer();
      });

      it('should fix string concatenation', async () => {
        const code = `db.query("SELECT * FROM users WHERE id = " + id);`;
        const ast = await parse(code);

        const result = await fixer.fix(ast, {
          id: '1',
          type: 'sql-injection',
          severity: 'critical',
          category: 'security',
          message: 'SQL injection',
          line: 1,
          file: 'test.js',
        });

        const fixed = generate(result.transformedAst);
        expect(fixed).toContain('?');
        expect(fixed).toContain('[id]');
      });

      it('should fix template literals', async () => {
        const code = `db.query(\`SELECT * FROM users WHERE name = '\${name}'\`);`;
        const ast = await parse(code);

        const result = await fixer.fix(ast, {
          id: '1',
          type: 'sql-injection',
          severity: 'critical',
          category: 'security',
          message: 'SQL injection',
          line: 1,
          file: 'test.js',
        });

        const fixed = generate(result.transformedAst);
        expect(fixed).toContain('?');
        expect(fixed).toContain('[name]');
      });

      it('should handle multiple parameters', async () => {
        const code = `db.query("SELECT * FROM users WHERE age > " + minAge + " AND age < " + maxAge);`;
        const ast = await parse(code);

        const result = await fixer.fix(ast, {
          id: '1',
          type: 'sql-injection',
          severity: 'critical',
          category: 'security',
          message: 'SQL injection',
          line: 1,
          file: 'test.js',
        });

        const fixed = generate(result.transformedAst);
        expect(fixed).toContain('WHERE age > ? AND age < ?');
        expect(fixed).toContain('[minAge, maxAge]');
      });
    });

    describe('ErrorHandlingFixer', () => {
      let fixer: ErrorHandlingFixer;

      beforeEach(() => {
        fixer = new ErrorHandlingFixer();
      });

      it('should wrap async function in try-catch', async () => {
        const code = `
          async function fetchData() {
            const response = await fetch('/api/data');
            const data = await response.json();
            return data;
          }
        `;
        const ast = await parse(code);

        const result = await fixer.fix(ast, {
          id: '1',
          type: 'no-error-handling',
          severity: 'high',
          category: 'reliability',
          message: 'Missing error handling',
          line: 2,
          file: 'test.js',
        });

        const fixed = generate(result.transformedAst);
        expect(fixed).toContain('try {');
        expect(fixed).toContain('} catch (error) {');
        expect(fixed).toContain('console.error');
      });

      it('should add .catch to promise chains', async () => {
        const code = `fetchData().then(data => console.log(data));`;
        const ast = await parse(code);

        const result = await fixer.fix(ast, {
          id: '1',
          type: 'unhandled-promise',
          severity: 'high',
          category: 'reliability',
          message: 'Unhandled promise',
          line: 1,
          file: 'test.js',
        });

        const fixed = generate(result.transformedAst);
        expect(fixed).toContain('.catch(');
      });

      it('should add context-aware error handling', async () => {
        const code = `
          async function processPayment(amount) {
            const result = await stripe.charge(amount);
            return result;
          }
        `;
        const ast = await parse(code);

        const result = await fixer.fix(ast, {
          id: '1',
          type: 'no-error-handling',
          severity: 'critical',
          category: 'reliability',
          message: 'Missing error handling in payment processing',
          line: 2,
          file: 'test.js',
          context: { isPaymentCode: true },
        });

        const fixed = generate(result.transformedAst);
        expect(fixed).toContain('Payment processing failed');
        expect(fixed).toContain('logger.error');
      });
    });

    describe('HardcodedSecretsFixer', () => {
      let fixer: HardcodedSecretsFixer;

      beforeEach(() => {
        fixer = new HardcodedSecretsFixer();
      });

      it('should replace hardcoded secret with env variable', async () => {
        const code = `const apiKey = "sk_live_secretkey123";`;
        const ast = await parse(code);

        const result = await fixer.fix(ast, {
          id: '1',
          type: 'hardcoded-secret',
          severity: 'high',
          category: 'security',
          message: 'Hardcoded API key',
          line: 1,
          file: 'test.js',
        });

        const fixed = generate(result.transformedAst);
        expect(fixed).toContain('process.env.');
        expect(fixed).not.toContain('sk_live_secretkey123');
      });

      it('should handle secrets in object properties', async () => {
        const code = `
          const config = {
            apiKey: "secret-key-123",
            dbPassword: "password123"
          };
        `;
        const ast = await parse(code);

        const result = await fixer.fix(ast, {
          id: '1',
          type: 'hardcoded-secret',
          severity: 'high',
          category: 'security',
          message: 'Hardcoded secrets in config',
          line: 3,
          file: 'test.js',
        });

        const fixed = generate(result.transformedAst);
        expect(fixed).toContain('process.env.API_KEY');
        expect(fixed).toContain('process.env.DB_PASSWORD');
      });

      it('should add comment explaining the change', async () => {
        const code = `const secret = "my-secret-value";`;
        const ast = await parse(code);

        const result = await fixer.fix(ast, {
          id: '1',
          type: 'hardcoded-secret',
          severity: 'high',
          category: 'security',
          message: 'Hardcoded secret',
          line: 1,
          file: 'test.js',
        });

        expect(result.explanation).toContain('environment variable');
        expect(result.educationalContent).toBeDefined();
      });
    });
  });

  describe('Performance', () => {
    beforeEach(() => {
      engine.registerFixer('sql-injection', new SQLInjectionFixer());
      engine.registerFixer('no-error-handling', new ErrorHandlingFixer());
    });

    it('should handle large files efficiently', async () => {
      const lines = [];
      for (let i = 0; i < 100; i++) {
        lines.push(`
          async function func${i}() {
            const result = await db.query("SELECT * FROM table WHERE id = " + id${i});
            return result;
          }
        `);
      }

      const code = lines.join('\n');
      const issues: Issue[] = [];

      // Create issues for each function
      for (let i = 0; i < 100; i++) {
        issues.push({
          id: `sql-${i}`,
          type: 'sql-injection',
          severity: 'critical',
          category: 'security',
          message: 'SQL injection',
          line: i * 5 + 3,
          file: 'test.js',
        });
        issues.push({
          id: `error-${i}`,
          type: 'no-error-handling',
          severity: 'high',
          category: 'reliability',
          message: 'No error handling',
          line: i * 5 + 2,
          file: 'test.js',
        });
      }

      const start = Date.now();
      const result = await engine.transform(code, issues);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
      expect(result.appliedFixes.filter(f => f.success)).toHaveLength(200);
    });
  });
});