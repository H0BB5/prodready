import { SQLInjectionAnalyzer } from '../../../src/analyzers/security/sql-injection';
import { parse } from '../../../src/utils/parser';
import { Context } from '../../../src/types';

describe('SQLInjectionAnalyzer', () => {
  let analyzer: SQLInjectionAnalyzer;
  let mockContext: Context;

  beforeEach(() => {
    analyzer = new SQLInjectionAnalyzer();
    mockContext = {
      projectType: 'node',
      framework: 'express',
      dependencies: ['mysql', 'express'],
      routes: [],
      files: new Map(),
    };
  });

  describe('Detection', () => {
    it('should detect SQL injection in basic string concatenation', async () => {
      const code = `
        app.get('/user/:id', async (req, res) => {
          const user = await db.query("SELECT * FROM users WHERE id = " + req.params.id);
          res.json(user);
        });
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        type: 'sql-injection',
        severity: 'critical',
        category: 'security',
        message: expect.stringContaining('SQL injection vulnerability'),
        line: 3,
      });
    });

    it('should detect SQL injection in template literals', async () => {
      const code = `
        const getUser = async (userId) => {
          const query = \`SELECT * FROM users WHERE id = \${userId}\`;
          return await db.query(query);
        };
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('sql-injection');
    });

    it('should detect multiple SQL injections in one file', async () => {
      const code = `
        async function getUser(id) {
          return db.query("SELECT * FROM users WHERE id = " + id);
        }
        
        async function getUserByName(name) {
          return db.query(\`SELECT * FROM users WHERE name = '\${name}'\`);
        }
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(2);
      expect(issues.every(i => i.type === 'sql-injection')).toBe(true);
    });

    it('should detect complex concatenation patterns', async () => {
      const code = `
        const query = "SELECT * FROM " + tableName + " WHERE id = " + id + " AND status = '" + status + "'";
        db.query(query);
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('sql-injection');
    });

    it('should detect SQL injection in different database libraries', async () => {
      const code = `
        // MySQL
        mysql.query("SELECT * FROM users WHERE id = " + id);
        
        // PostgreSQL
        pg.query(\`SELECT * FROM users WHERE email = '\${email}'\`);
        
        // Generic database
        database.execute("DELETE FROM posts WHERE id = " + postId);
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(3);
    });

    it('should not detect SQL injection in parameterized queries', async () => {
      const code = `
        // Parameterized queries - safe
        db.query("SELECT * FROM users WHERE id = ?", [userId]);
        db.query("SELECT * FROM users WHERE id = ? AND name = ?", [id, name]);
        db.query("INSERT INTO users (name, email) VALUES (?, ?)", [name, email]);
        
        // Named parameters - safe
        db.query("SELECT * FROM users WHERE id = :id", { id: userId });
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(0);
    });

    it('should not detect SQL injection in prepared statements', async () => {
      const code = `
        const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
        stmt.run(userId);
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(0);
    });

    it('should handle edge cases gracefully', async () => {
      const code = `
        // Empty query
        db.query("");
        
        // Query without concatenation
        db.query("SELECT * FROM users");
        
        // Non-SQL method calls
        console.log("SELECT * FROM " + table);
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(0);
    });
  });

  describe('Context Awareness', () => {
    it('should increase severity for authentication endpoints', async () => {
      const code = `
        app.post('/login', async (req, res) => {
          const user = await db.query("SELECT * FROM users WHERE username = '" + req.body.username + "'");
          // ...
        });
      `;

      const authContext = {
        ...mockContext,
        routes: [{ path: '/login', method: 'POST', handler: 'login' }],
      };

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, authContext);

      expect(issues[0].severity).toBe('critical');
      expect(issues[0].message).toContain('authentication');
    });
  });

  describe('Fix Generation', () => {
    it('should provide fix for string concatenation', async () => {
      const code = `db.query("SELECT * FROM users WHERE id = " + userId);`;
      
      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues[0].fix).toBeDefined();
      expect(issues[0].fix?.description).toContain('parameterized');
    });

    it('should provide fix for template literals', async () => {
      const code = `db.query(\`SELECT * FROM users WHERE id = \${userId}\`);`;
      
      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues[0].fix).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should analyze large files efficiently', async () => {
      // Generate a large file with many queries
      const lines = [];
      for (let i = 0; i < 1000; i++) {
        lines.push(`db.query("SELECT * FROM table${i}");`);
      }
      lines.push(`db.query("SELECT * FROM users WHERE id = " + id);`); // One vulnerability
      
      const code = lines.join('\n');
      const ast = await parse(code);

      const start = Date.now();
      const issues = await analyzer.analyze(ast, mockContext);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(issues).toHaveLength(1);
    });
  });
});