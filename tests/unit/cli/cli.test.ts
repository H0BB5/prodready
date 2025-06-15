import { CLI } from '../../../src/cli';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock the external dependencies
jest.mock('chalk', () => ({
  red: jest.fn(text => text),
  green: jest.fn(text => text),
  yellow: jest.fn(text => text),
  blue: jest.fn(text => text),
  bold: jest.fn(text => text),
  gray: jest.fn(text => text),
}));

jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    text: '',
  }));
});

describe('CLI', () => {
  let cli: CLI;
  let mockConsoleLog: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    cli = new CLI();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockExit.mockRestore();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create CLI with correct program info', () => {
      expect(cli).toBeDefined();
      expect(cli.program).toBeInstanceOf(Command);
      expect(cli.program.name()).toBe('prodready');
    });

    it('should register all required commands', () => {
      const commands = cli.program.commands.map(cmd => cmd.name());
      expect(commands).toContain('scan');
      expect(commands).toContain('fix');
      expect(commands).toContain('report');
    });
  });

  describe('Scan Command', () => {
    it('should display help when no path provided', async () => {
      await cli.run(['scan']);
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Please provide a path to scan')
      );
    });

    it('should show beautiful output for scan results', async () => {
      const mockScanResult = {
        score: 23,
        issues: [
          { type: 'sql-injection', severity: 'critical', count: 2 },
          { type: 'no-error-handling', severity: 'high', count: 5 },
          { type: 'hardcoded-secret', severity: 'critical', count: 1 },
        ],
        totalIssues: 8,
      };

      // Mock the engine's scan method
      jest.spyOn(cli.engine, 'scan').mockResolvedValue(mockScanResult);

      await cli.run(['scan', './test-project']);

      // Verify spinner was used
      expect(ora).toHaveBeenCalled();

      // Verify score display
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Production Readiness Score: 23/100')
      );

      // Verify issues display
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Found 8 issues')
      );

      // Verify critical issues are highlighted
      expect(chalk.red).toHaveBeenCalledWith(
        expect.stringContaining('Critical')
      );
    });

    it('should handle scan errors gracefully', async () => {
      jest.spyOn(cli.engine, 'scan').mockRejectedValue(
        new Error('Failed to parse file')
      );

      await expect(cli.run(['scan', './broken-project'])).rejects.toThrow();

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Scan failed')
      );
    });

    it('should support JSON output format', async () => {
      const mockScanResult = {
        score: 45,
        issues: [],
        totalIssues: 0,
      };

      jest.spyOn(cli.engine, 'scan').mockResolvedValue(mockScanResult);

      await cli.run(['scan', './test-project', '--format', 'json']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify(mockScanResult, null, 2)
      );
    });

    it('should filter by category when specified', async () => {
      await cli.run(['scan', './test-project', '--category', 'security']);

      expect(cli.engine.scan).toHaveBeenCalledWith(
        './test-project',
        expect.objectContaining({ category: 'security' })
      );
    });
  });

  describe('Fix Command', () => {
    const mockScanResult = {
      score: 23,
      issues: [
        {
          id: '1',
          type: 'sql-injection',
          severity: 'critical',
          fix: { apply: jest.fn() },
        },
        {
          id: '2',
          type: 'no-error-handling',
          severity: 'high',
          fix: { apply: jest.fn() },
        },
      ],
    };

    beforeEach(() => {
      jest.spyOn(cli.engine, 'scan').mockResolvedValue(mockScanResult);
      jest.spyOn(cli.engine, 'fix').mockResolvedValue({
        applied: 2,
        failed: 0,
        results: [],
      });
    });

    it('should show preview when --preview flag is used', async () => {
      await cli.run(['fix', './test-project', '--preview']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Preview mode')
      );
      
      // Should not actually apply fixes
      expect(cli.engine.fix).not.toHaveBeenCalled();
    });

    it('should apply fixes and show progress', async () => {
      await cli.run(['fix', './test-project']);

      expect(cli.engine.scan).toHaveBeenCalled();
      expect(cli.engine.fix).toHaveBeenCalled();

      // Should show transformation animation
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Transforming your code')
      );

      // Should show before/after score
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('23/100')
      );
    });

    it('should support interactive mode', async () => {
      // Mock inquirer prompt
      const mockPrompt = jest.fn().mockResolvedValue({
        selectedFixes: ['1'], // Only select first fix
      });
      jest.doMock('inquirer', () => ({ prompt: mockPrompt }));

      await cli.run(['fix', './test-project', '--interactive']);

      expect(mockPrompt).toHaveBeenCalled();
      expect(cli.engine.fix).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ id: '1' })
          ])
        })
      );
    });

    it('should handle fix failures gracefully', async () => {
      jest.spyOn(cli.engine, 'fix').mockResolvedValue({
        applied: 1,
        failed: 1,
        results: [
          { issueId: '1', success: true },
          { issueId: '2', success: false, error: 'Parse error' },
        ],
      });

      await cli.run(['fix', './test-project']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('1 fix failed')
      );
    });
  });

  describe('Report Command', () => {
    it('should generate HTML report by default', async () => {
      const mockReport = '<html>Report content</html>';
      jest.spyOn(cli.reportGenerator, 'generate').mockResolvedValue(mockReport);
      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      await cli.run(['report', './test-project']);

      expect(cli.reportGenerator.generate).toHaveBeenCalledWith(
        expect.anything(),
        'html'
      );

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('prodready-report.html'),
        mockReport,
        'utf-8'
      );
    });

    it('should support different output formats', async () => {
      jest.spyOn(cli.reportGenerator, 'generate').mockResolvedValue('{}');
      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      await cli.run(['report', './test-project', '--format', 'json']);

      expect(cli.reportGenerator.generate).toHaveBeenCalledWith(
        expect.anything(),
        'json'
      );
    });

    it('should support custom output path', async () => {
      jest.spyOn(cli.reportGenerator, 'generate').mockResolvedValue('Report');
      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      await cli.run(['report', './test-project', '--output', './custom-report.html']);

      expect(fs.writeFile).toHaveBeenCalledWith(
        './custom-report.html',
        expect.any(String),
        'utf-8'
      );
    });
  });

  describe('Global Options', () => {
    it('should respect --quiet flag', async () => {
      await cli.run(['scan', './test-project', '--quiet']);

      // Should only show essential output
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    });

    it('should show version', async () => {
      await cli.run(['--version']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringMatching(/\d+\.\d+\.\d+/)
      );
    });

    it('should show help', async () => {
      await cli.run(['--help']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Usage: prodready')
      );
    });
  });

  describe('Beautiful Output', () => {
    it('should use colors appropriately', async () => {
      const mockScanResult = {
        score: 75,
        issues: [
          { type: 'sql-injection', severity: 'critical', count: 1 },
          { type: 'no-logging', severity: 'medium', count: 3 },
        ],
      };

      jest.spyOn(cli.engine, 'scan').mockResolvedValue(mockScanResult);
      await cli.run(['scan', './test-project']);

      // Critical issues in red
      expect(chalk.red).toHaveBeenCalled();
      
      // Medium issues in yellow
      expect(chalk.yellow).toHaveBeenCalled();
      
      // Good score in green
      expect(chalk.green).toHaveBeenCalledWith(
        expect.stringContaining('75')
      );
    });

    it('should show ASCII art banner', async () => {
      await cli.showBanner();

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('ProdReady')
      );
    });

    it('should animate score changes', async () => {
      jest.useFakeTimers();

      await cli.animateScore(23, 91);

      // Fast-forward through animation
      jest.runAllTimers();

      // Should show incremental updates
      const calls = mockConsoleLog.mock.calls;
      expect(calls.some(call => call[0].includes('23'))).toBe(true);
      expect(calls.some(call => call[0].includes('91'))).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('should show user-friendly error for file not found', async () => {
      jest.spyOn(cli.engine, 'scan').mockRejectedValue({
        code: 'ENOENT',
        path: '/nonexistent',
      });

      await expect(cli.run(['scan', '/nonexistent'])).rejects.toThrow();

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('File or directory not found')
      );
    });

    it('should show helpful message for permission errors', async () => {
      jest.spyOn(cli.engine, 'scan').mockRejectedValue({
        code: 'EACCES',
        path: '/root/protected',
      });

      await expect(cli.run(['scan', '/root/protected'])).rejects.toThrow();

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      );
    });
  });
});