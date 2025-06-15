import { HardcodedSecretsAnalyzer } from '../../../src/analyzers/security/hardcoded-secrets';
import { parse } from '../../../src/utils/parser';
import { Context } from '../../../src/types';

describe('HardcodedSecretsAnalyzer', () => {
  let analyzer: HardcodedSecretsAnalyzer;
  let mockContext: Context;

  beforeEach(() => {
    analyzer = new HardcodedSecretsAnalyzer();
    mockContext = {
      projectType: 'node',
      framework: 'express',
      dependencies: ['stripe', 'aws-sdk'],
      routes: [],
      files: new Map(),
    };
  });

  describe('Detection', () => {
    it('should detect hardcoded API keys', async () => {
      const code = `
        const stripe = require('stripe')('sk_' + 'live_' + 'fakekey123');
        const apiKey = "FAKE" + "AWS" + "KEY123";
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(2);
      expect(issues[0]).toMatchObject({
        type: 'hardcoded-secret',
        severity: 'high',
        category: 'security',
        message: expect.stringContaining('API key'),
      });
    });

    it('should detect various secret patterns', async () => {
      const code = `
        const config = {
          // Patterns that look like secrets
          apiKey: "my-secret-api-key-value",
          password: "secretPassword123",
          token: "authentication-token-value",
          secret: "jwt-secret-key",
          privateKey: "private-key-content",
          accessToken: "access-token-value",
          clientSecret: "oauth-client-secret"
        };
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues.length).toBeGreaterThan(5);
      expect(issues.every(i => i.type === 'hardcoded-secret')).toBe(true);
    });

    it('should detect passwords in connection strings', async () => {
      const code = `
        const dbUrl = "postgres://admin:secretpass@localhost:5432/mydb";
        const redisUrl = "redis://:redispass@localhost:6379";
        const mongoUrl = "mongodb://user:mongopass@localhost:27017/db";
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(3);
      expect(issues[0].message).toContain('connection string');
    });

    it('should detect base64 encoded secrets', async () => {
      const code = `
        const encodedKey = "c2VjcmV0LWtleS0xMjM0NTY="; // base64 encoded
        const token = Buffer.from("my-secret-token").toString('base64');
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should detect private key patterns', async () => {
      const code = `
        const privateKey = "-----BEGIN PRIVATE KEY-----\\nfakekeyconent\\n-----END PRIVATE KEY-----";
        const sshKey = "-----BEGIN OPENSSH PRIVATE KEY-----\\nfakesshkey\\n-----END OPENSSH PRIVATE KEY-----";
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(2);
      expect(issues[0].severity).toBe('critical');
    });

    it('should not flag environment variables', async () => {
      const code = `
        const apiKey = process.env.API_KEY;
        const dbPassword = process.env.DB_PASSWORD;
        const secret = process.env.JWT_SECRET || 'default-dev-secret';
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      // Should only flag the default value
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('default-dev-secret');
    });

    it('should not flag obvious non-secrets', async () => {
      const code = `
        const publicKey = "pk_test_123"; // Public keys are okay
        const appId = "app-123456";
        const version = "v1.2.3";
        const emptyString = "";
        const shortString = "abc";
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(0);
    });

    it('should detect secrets in different contexts', async () => {
      const code = `
        // In headers
        headers: {
          'Authorization': 'Bearer secrettoken123',
          'X-API-Key': 'api-secret-key'
        }
        
        // In fetch calls
        fetch('https://api.example.com', {
          headers: {
            'Authorization': 'Token mysecrettoken'
          }
        });
        
        // In configuration objects
        new AWS.S3({
          accessKeyId: 'fake-access-key-id',
          secretAccessKey: 'fake-secret-access-key'
        });
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues.length).toBeGreaterThan(3);
    });
  });

  describe('Context Awareness', () => {
    it('should increase severity for production secrets', async () => {
      const code = `
        const stripe = require('stripe')('prod_secret_key_value');
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues[0].severity).toBe('critical');
      expect(issues[0].message).toContain('production');
    });

    it('should have lower severity for test/dev secrets', async () => {
      const code = `
        const testKey = "test_secret_key_value";
        const devPassword = "dev-password-123";
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues[0].severity).toBe('high'); // Still high, but not critical
    });
  });

  describe('Fix Generation', () => {
    it('should suggest environment variable fix', async () => {
      const code = `
        const apiKey = "my-secret-api-key";
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues[0].fix).toBeDefined();
      expect(issues[0].fix?.description).toContain('environment variable');
    });

    it('should suggest config file fix for multiple secrets', async () => {
      const code = `
        const config = {
          apiKey: "secret-key-1",
          dbPassword: "secret-password-2",
          jwtSecret: "secret-jwt-3"
        };
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues.some(i => i.fix?.description.includes('config file'))).toBe(true);
    });

    it('should suggest secret management service for many secrets', async () => {
      const code = `
        const secrets = {
          key1: "secret1", key2: "secret2", key3: "secret3",
          key4: "secret4", key5: "secret5", key6: "secret6"
        };
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues.some(i => i.fix?.description.includes('secret management'))).toBe(true);
    });
  });

  describe('Special Cases', () => {
    it('should handle secrets in template literals', async () => {
      const code = `
        const url = \`https://api.example.com?key=\${'secretkey'}\`;
        const conn = \`mongodb://admin:\${'secretpass'}@localhost\`;
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(2);
    });

    it('should detect secrets in array literals', async () => {
      const code = `
        const keys = [
          "secret-key-1",
          "api-key-value",
          "private-token"
        ];
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should handle obfuscation attempts', async () => {
      const code = `
        const key = "secret" + "-" + "key" + "-" + "value";
        const pwd = ["p", "a", "s", "s"].join("");
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      // Should still detect these patterns
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should handle files with many strings efficiently', async () => {
      const strings = [];
      for (let i = 0; i < 1000; i++) {
        strings.push(`const str${i} = "random-string-${i}";`);
      }
      // Add one actual secret
      strings.push(`const apiKey = "secret-api-key-value";`);

      const code = strings.join('\n');
      const ast = await parse(code);

      const start = Date.now();
      const issues = await analyzer.analyze(ast, mockContext);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
      expect(issues).toHaveLength(1);
    });
  });

  describe('False Positive Prevention', () => {
    it('should not flag example or placeholder values', async () => {
      const code = `
        // Documentation examples
        const example = "your-api-key-here";
        const placeholder = "REPLACE_WITH_YOUR_KEY";
        const template = "<YOUR_SECRET_HERE>";
        
        // Common non-secret patterns
        const id = "user-123456";
        const hash = "a1b2c3d4e5f6";
        const uuid = "550e8400-e29b-41d4-a716-446655440000";
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(0);
    });

    it('should not flag import paths or URLs without credentials', async () => {
      const code = `
        import stripe from 'stripe';
        const apiUrl = "https://api.example.com/v1";
        const cdnUrl = "https://cdn.example.com/assets";
      `;

      const ast = await parse(code);
      const issues = await analyzer.analyze(ast, mockContext);

      expect(issues).toHaveLength(0);
    });
  });
});