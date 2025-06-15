import { ProdReadyEngine } from '../../src/core/engine';
import { SQLInjectionAnalyzer } from '../../src/analyzers/security/sql-injection';
import { NoErrorHandlingAnalyzer } from '../../src/analyzers/reliability/no-error-handling';
import { HardcodedSecretsAnalyzer } from '../../src/analyzers/security/hardcoded-secrets';
import { SQLInjectionFixer } from '../../src/transformers/security/sql-injection-fixer';
import { ErrorHandlingFixer } from '../../src/transformers/reliability/error-handling-fixer';
import { HardcodedSecretsFixer } from '../../src/transformers/security/hardcoded-secrets-fixer';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ProdReady Integration Tests', () => {
  let engine: ProdReadyEngine;
  let testDir: string;

  beforeAll(async () => {
    // Create a temporary directory for test files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prodready-test-'));
  });

  afterAll(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    engine = new ProdReadyEngine();
    
    // Register analyzers
    engine.registerAnalyzer(new SQLInjectionAnalyzer());
    engine.registerAnalyzer(new NoErrorHandlingAnalyzer());
    engine.registerAnalyzer(new HardcodedSecretsAnalyzer());
    
    // Register fixers
    engine.registerFixer('sql-injection', new SQLInjectionFixer());
    engine.registerFixer('no-error-handling', new ErrorHandlingFixer());
    engine.registerFixer('hardcoded-secret', new HardcodedSecretsFixer());
  });

  describe('Full Workflow', () => {
    it('should analyze and fix a vulnerable Express API', async () => {
      // Create a test file with multiple vulnerabilities
      const vulnerableCode = `
const express = require('express');
const mysql = require('mysql');
const app = express();

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'secretpassword123',
  database: 'myapp'
});

app.get('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  const query = "SELECT * FROM users WHERE id = " + userId;
  
  const result = await db.query(query);
  res.json(result);
});

app.post('/api/payment', async (req, res) => {
  const stripe = require('stripe')('sk_live_verysecretkey');
  const charge = await stripe.charges.create({
    amount: req.body.amount * 100,
    currency: 'usd',
    source: req.body.token
  });
  
  res.json({ success: true, chargeId: charge.id });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`;

      const testFile = path.join(testDir, 'app.js');
      await fs.writeFile(testFile, vulnerableCode);

      // Step 1: Analyze the code
      const analysisResult = await engine.analyze(testDir);

      // Verify issues were found
      expect(analysisResult.score).toBeLessThan(50);
      expect(analysisResult.issues.length).toBeGreaterThan(3);
      
      // Check for specific issues
      const issueTypes = analysisResult.issues.map(i => i.type);
      expect(issueTypes).toContain('sql-injection');
      expect(issueTypes).toContain('no-error-handling');
      expect(issueTypes).toContain('hardcoded-secret');

      // Step 2: Apply fixes
      const fixResult = await engine.fix(analysisResult);

      // Verify fixes were applied
      expect(fixResult.summary.successful).toBeGreaterThan(3);
      expect(fixResult.summary.failed).toBe(0);

      // Step 3: Re-analyze to verify improvements
      const reAnalysisResult = await engine.analyze(testDir);

      // Score should improve significantly
      expect(reAnalysisResult.score).toBeGreaterThan(analysisResult.score + 30);
      expect(reAnalysisResult.issues.length).toBeLessThan(analysisResult.issues.length);

      // Step 4: Verify the fixed code
      const fixedCode = await fs.readFile(testFile, 'utf-8');

      // SQL injection should be fixed
      expect(fixedCode).toContain('?');
      expect(fixedCode).not.toContain('WHERE id = " +');

      // Error handling should be added
      expect(fixedCode).toContain('try {');
      expect(fixedCode).toContain('catch (error)');

      // Secrets should be moved to env vars
      expect(fixedCode).toContain('process.env');
      expect(fixedCode).not.toContain('secretpassword123');
      expect(fixedCode).not.toContain('sk_live_verysecretkey');
    });

    it('should handle multiple files in a project', async () => {
      // Create multiple files
      const files = {
        'index.js': `
const express = require('express');
const userRoutes = require('./routes/users');
const app = express();

app.use('/api/users', userRoutes);

app.listen(3000);
`,
        'routes/users.js': `
const router = require('express').Router();
const db = require('../db');

router.get('/:id', async (req, res) => {
  const user = await db.query("SELECT * FROM users WHERE id = " + req.params.id);
  res.json(user);
});

module.exports = router;
`,
        'db.js': `
const mysql = require('mysql');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'admin',
  password: 'adminpass123',
  database: 'myapp'
});

module.exports = connection;
`
      };

      // Write all files
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(testDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      // Analyze the project
      const analysisResult = await engine.analyze(testDir);

      // Should find issues across multiple files
      expect(analysisResult.files.length).toBe(3);
      expect(analysisResult.issues.length).toBeGreaterThan(2);

      // Issues should reference correct files
      const filesWithIssues = new Set(analysisResult.issues.map(i => i.file));
      expect(filesWithIssues.size).toBeGreaterThan(1);

      // Apply fixes
      const fixResult = await engine.fix(analysisResult);

      // Verify fixes were applied to multiple files
      expect(fixResult.transformedFiles.size).toBeGreaterThan(1);
    });

    it('should generate a comprehensive report', async () => {
      // Create a test file
      const code = `
async function processOrder(orderId) {
  const order = await db.query("SELECT * FROM orders WHERE id = " + orderId);
  const apiKey = "sk_live_secretkey";
  const result = await processPayment(order.amount, apiKey);
  return result;
}
`;
      
      const testFile = path.join(testDir, 'orders.js');
      await fs.writeFile(testFile, code);

      // Analyze
      const analysisResult = await engine.analyze(testDir);

      // Generate report
      const report = await engine.generateReport(analysisResult, {
        format: 'json',
        includeEducation: true,
        includeCodeSamples: true,
      });

      // Verify report structure
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('issues');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('education');

      // Report should include educational content
      expect(report.education).toHaveProperty('sql-injection');
      expect(report.education).toHaveProperty('hardcoded-secret');
    });
  });

  describe('Edge Cases', () => {
    it('should handle syntax errors gracefully', async () => {
      const invalidCode = `
function broken() {
  const query = "SELECT * FROM users WHERE
  // Missing closing quote and parenthesis
}
`;

      const testFile = path.join(testDir, 'broken.js');
      await fs.writeFile(testFile, invalidCode);

      // Should not throw
      const analysisResult = await engine.analyze(testDir);

      // Should report the file as having errors
      expect(analysisResult.issues).toContainEqual(
        expect.objectContaining({
          type: 'parse-error',
          severity: 'high',
          file: expect.stringContaining('broken.js')
        })
      );
    });

    it('should handle empty directories', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.mkdir(emptyDir);

      const analysisResult = await engine.analyze(emptyDir);

      expect(analysisResult.score).toBe(100);
      expect(analysisResult.issues).toHaveLength(0);
      expect(analysisResult.files).toHaveLength(0);
    });

    it('should skip non-JavaScript files', async () => {
      // Create various file types
      await fs.writeFile(path.join(testDir, 'README.md'), '# Test Project');
      await fs.writeFile(path.join(testDir, 'data.json'), '{"test": true}');
      await fs.writeFile(path.join(testDir, 'image.png'), Buffer.from('fake-image'));
      
      // Create one JS file with an issue
      await fs.writeFile(path.join(testDir, 'test.js'), `
        const password = "secret123";
      `);

      const analysisResult = await engine.analyze(testDir);

      // Should only analyze the JS file
      expect(analysisResult.files).toHaveLength(1);
      expect(analysisResult.files[0]).toContain('test.js');
      expect(analysisResult.issues).toHaveLength(1);
    });

    it('should respect .prodreadyignore file', async () => {
      // Create ignore file
      await fs.writeFile(path.join(testDir, '.prodreadyignore'), `
node_modules/
build/
*.test.js
`);

      // Create files that should be ignored
      await fs.mkdir(path.join(testDir, 'node_modules'));
      await fs.writeFile(
        path.join(testDir, 'node_modules', 'vulnerable.js'),
        'const key = "secret";'
      );
      
      await fs.writeFile(
        path.join(testDir, 'app.test.js'),
        'const password = "testpass";'
      );

      // Create file that should be analyzed
      await fs.writeFile(
        path.join(testDir, 'app.js'),
        'const apiKey = "production-key";'
      );

      const analysisResult = await engine.analyze(testDir);

      // Should only analyze app.js
      expect(analysisResult.files).toHaveLength(1);
      expect(analysisResult.files[0]).toContain('app.js');
    });
  });

  describe('Performance', () => {
    it('should handle large projects efficiently', async () => {
      // Create 100 files with issues
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const content = `
          async function process${i}(id) {
            const result = await db.query("SELECT * FROM table WHERE id = " + id);
            return result;
          }
        `;
        promises.push(
          fs.writeFile(path.join(testDir, `file${i}.js`), content)
        );
      }
      await Promise.all(promises);

      const start = Date.now();
      const analysisResult = await engine.analyze(testDir);
      const analysisDuration = Date.now() - start;

      // Should complete in reasonable time
      expect(analysisDuration).toBeLessThan(10000); // 10 seconds

      // Should find issues in all files
      expect(analysisResult.files).toHaveLength(100);
      expect(analysisResult.issues.length).toBeGreaterThan(100);

      // Apply fixes
      const fixStart = Date.now();
      const fixResult = await engine.fix(analysisResult);
      const fixDuration = Date.now() - fixStart;

      // Fixes should also complete quickly
      expect(fixDuration).toBeLessThan(15000); // 15 seconds
      expect(fixResult.summary.successful).toBeGreaterThan(100);
    });
  });
});