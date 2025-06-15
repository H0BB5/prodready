import { NoErrorHandlingAnalyzer } from '../../../src/analyzers/reliability/no-error-handling';
import { parse } from '../../../src/utils/parser';
import { Context } from '../../../src/types';

describe('NoErrorHandlingAnalyzer', () => {
  let analyzer: NoErrorHandlingAnalyzer;
  let mockContext: Context;

  beforeEach(() => {
    analyzer = new NoErrorHandlingAnalyzer();
    mockContext = {
      projectType: 'node',
      framework: 'express',
      dependencies: ['express'],
      routes: [],
      files: new Map(),
    };
  });

  describe('Detection', () => {
    it('should detect missing try-catch in async functions', async () => {
      const code = `
        async function fetchUser(id) {
          const response = await fetch(\`/api/users/\${id}\`);
          const user = await response.json();
          return user;
        }
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        type: 'no-error-handling',
        severity: 'high',
        category: 'reliability',
        message: expect.stringContaining('error handling'),
        line: 2,
      });
    });

    it('should detect missing error handling in Express route handlers', async () => {
      const code = `
        app.get('/users/:id', async (req, res) => {
          const user = await db.findUser(req.params.id);
          res.json(user);
        });
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('high');
    });

    it('should detect multiple async operations without error handling', async () => {
      const code = `
        async function processData() {
          const data = await fetchData();
          const processed = await transform(data);
          const result = await save(processed);
          return result;
        }
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('multiple async operations');
    });

    it('should detect unhandled promise rejections', async () => {
      const code = `
        function startProcess() {
          fetchData().then(data => {
            console.log(data);
          });
          // No .catch()
        }
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('unhandled-promise');
    });

    it('should detect async functions without error boundaries', async () => {
      const code = `
        class UserService {
          async getUser(id) {
            const user = await this.db.query('SELECT * FROM users WHERE id = ?', [id]);
            return user;
          }
          
          async updateUser(id, data) {
            const result = await this.db.query('UPDATE users SET ? WHERE id = ?', [data, id]);
            return result;
          }
        }
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(2);
    });

    it('should not flag functions with proper error handling', async () => {
      const code = `
        async function fetchUser(id) {
          try {
            const response = await fetch(\`/api/users/\${id}\`);
            const user = await response.json();
            return user;
          } catch (error) {
            console.error('Failed to fetch user:', error);
            throw new Error('User fetch failed');
          }
        }
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(0);
    });

    it('should not flag promises with catch handlers', async () => {
      const code = `
        fetchData()
          .then(data => process(data))
          .then(result => save(result))
          .catch(error => {
            console.error('Process failed:', error);
          });
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(0);
    });

    it('should not flag async functions with wrapping error handlers', async () => {
      const code = `
        const asyncHandler = (fn) => (req, res, next) => {
          Promise.resolve(fn(req, res, next)).catch(next);
        };
        
        app.get('/users/:id', asyncHandler(async (req, res) => {
          const user = await db.findUser(req.params.id);
          res.json(user);
        }));
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(0);
    });
  });

  describe('Context Awareness', () => {
    it('should increase severity for payment processing code', async () => {
      const code = `
        async function processPayment(amount, cardToken) {
          const charge = await stripe.charges.create({
            amount: amount * 100,
            currency: 'usd',
            source: cardToken
          });
          return charge;
        }
      `;

      const paymentContext = {
        ...mockContext,
        isPaymentCode: true,
      };

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, paymentContext);

      expect(issues[0].severity).toBe('critical');
      expect(issues[0].message).toContain('payment');
    });

    it('should detect missing error handling in database operations', async () => {
      const code = `
        async function createUser(userData) {
          const result = await db.insert('users', userData);
          return result.insertId;
        }
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues[0].message).toContain('database');
    });
  });

  describe('Fix Generation', () => {
    it('should provide try-catch fix for async functions', async () => {
      const code = `
        async function getData() {
          const result = await fetch('/api/data');
          return result;
        }
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues[0].fix).toBeDefined();
      expect(issues[0].fix?.description).toContain('try-catch');
    });

    it('should provide catch handler fix for promises', async () => {
      const code = `
        getData().then(data => console.log(data));
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues[0].fix).toBeDefined();
      expect(issues[0].fix?.description).toContain('.catch');
    });

    it('should suggest error boundary for React components', async () => {
      const code = `
        function UserProfile({ userId }) {
          const [user, setUser] = useState(null);
          
          useEffect(() => {
            fetchUser(userId).then(setUser);
          }, [userId]);
          
          return <div>{user?.name}</div>;
        }
      `;

      const reactContext = {
        ...mockContext,
        framework: 'react',
      };

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, reactContext);

      expect(issues[0].fix?.description).toContain('error boundary');
    });
  });

  describe('Edge Cases', () => {
    it('should handle nested async functions', async () => {
      const code = `
        async function outer() {
          async function inner() {
            const data = await fetch('/api');
            return data;
          }
          
          const result = await inner();
          return result;
        }
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(2); // Both functions need error handling
    });

    it('should handle arrow functions', async () => {
      const code = `
        const fetchData = async () => {
          const response = await fetch('/api');
          return response.json();
        };
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(1);
    });

    it('should handle IIFE async functions', async () => {
      const code = `
        (async () => {
          const data = await loadData();
          console.log(data);
        })();
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(1);
    });
  });

  describe('Performance', () => {
    it('should handle large files efficiently', async () => {
      const functions = [];
      for (let i = 0; i < 100; i++) {
        functions.push(`
          async function func${i}() {
            const data = await fetch('/api/${i}');
            return data;
          }
        `);
      }

      const code = functions.join('\n');
      const ast = await parse(code);

      const start = Date.now();
      const issues = await analyzer.analyze(ast, mockContext);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
      expect(issues).toHaveLength(100);
    });
  });
});