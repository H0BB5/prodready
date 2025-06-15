#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as inquirer from 'inquirer';
import { ProdReadyEngine } from '../core/engine';
import { ReportGenerator } from '../reports/report-generator';
import { version } from '../../package.json';

export class CLI {
  program: Command;
  engine: ProdReadyEngine;
  reportGenerator: ReportGenerator;

  constructor() {
    this.program = new Command();
    this.engine = new ProdReadyEngine();
    this.reportGenerator = new ReportGenerator();
    
    this.setupCommands();
  }

  private setupCommands() {
    this.program
      .name('prodready')
      .description('Transform AI-generated code into production-ready applications')
      .version(version);

    // Scan command
    this.program
      .command('scan [path]')
      .description('Scan your code for production readiness issues')
      .option('-f, --format <format>', 'output format (pretty, json)', 'pretty')
      .option('-c, --category <category>', 'filter by category')
      .option('-q, --quiet', 'minimal output')
      .action(async (path = '.', options) => {
        if (!path) {
          console.error(chalk.red('Please provide a path to scan'));
          process.exit(1);
        }

        await this.handleScan(path, options);
      });

    // Fix command
    this.program
      .command('fix [path]')
      .description('Fix production readiness issues')
      .option('-p, --preview', 'preview changes without applying')
      .option('-i, --interactive', 'select fixes interactively')
      .action(async (path = '.', options) => {
        await this.handleFix(path, options);
      });

    // Report command
    this.program
      .command('report [path]')
      .description('Generate a production readiness report')
      .option('-f, --format <format>', 'report format (html, json)', 'html')
      .option('-o, --output <path>', 'output file path')
      .action(async (path = '.', options) => {
        await this.handleReport(path, options);
      });
  }

  async run(args: string[]) {
    try {
      await this.program.parseAsync(args);
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  private async handleScan(path: string, options: any) {
    const spinner = ora('Analyzing your code...').start();

    try {
      const result = await this.engine.scan(path, {
        category: options.category
      });
      
      spinner.succeed('Analysis complete');

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        this.displayScanResults(result, options.quiet);
      }
    } catch (error: any) {
      spinner.fail('Scan failed');
      
      if (error.code === 'ENOENT') {
        console.error(chalk.red('File or directory not found:'), error.path);
      } else if (error.code === 'EACCES') {
        console.error(chalk.red('Permission denied:'), error.path);
      } else {
        console.error(chalk.red('Scan failed:'), error.message);
      }
      
      throw error;
    }
  }

  private async handleFix(path: string, options: any) {
    console.log(chalk.blue('🔧 Ready to transform your code!'));

    // First scan to find issues
    const scanResult = await this.engine.scan(path);

    if (scanResult.issues.length === 0) {
      console.log(chalk.green('✨ No issues found! Your code is already production-ready.'));
      return;
    }

    if (options.preview) {
      console.log(chalk.yellow('Preview mode - no changes will be applied'));
      // Show preview of fixes
      return;
    }

    let issuesToFix = scanResult.issues;

    if (options.interactive) {
      const choices = scanResult.issues.map(issue => ({
        name: `${chalk.red(issue.severity.toUpperCase())} - ${issue.message}`,
        value: issue.id,
        checked: issue.severity === 'critical'
      }));

      const { selectedFixes } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selectedFixes',
        message: 'Select fixes to apply:',
        choices
      }]);

      issuesToFix = scanResult.issues.filter(i => selectedFixes.includes(i.id));
    }

    console.log(chalk.blue('✨ Transforming your code...'));
    
    const fixResult = await this.engine.fix({ ...scanResult, issues: issuesToFix });

    // Display results
    console.log(chalk.green(`\n✅ Applied ${fixResult.summary.successful} fixes`));
    
    if (fixResult.summary.failed > 0) {
      console.log(chalk.yellow(`⚠️  ${fixResult.summary.failed} fix failed`));
    }

    // Show score improvement
    const newScanResult = await this.engine.scan(path);
    console.log(`\nScore: ${chalk.red(scanResult.score + '/100')} → ${chalk.green(newScanResult.score + '/100')}`);
  }

  private async handleReport(path: string, options: any) {
    const scanResult = await this.engine.scan(path);
    
    const report = await this.reportGenerator.generate(scanResult, options.format);
    
    const outputPath = options.output || `prodready-report.${options.format}`;
    const fs = await import('fs/promises');
    await fs.writeFile(outputPath, report, 'utf-8');
    
    console.log(chalk.green(`✅ Report generated: ${outputPath}`));
  }

  private displayScanResults(result: any, quiet: boolean) {
    if (quiet) {
      console.log(result.score);
      return;
    }

    console.log();
    this.displayScore(result.score);
    console.log();

    if (result.issues.length === 0) {
      console.log(chalk.green('🎉 No issues found! Your code is production-ready.'));
      return;
    }

    console.log(chalk.yellow(`Found ${result.totalIssues || result.issues.length} issues:\n`));

    // Group issues by severity
    const bySeverity: any = {};
    result.issues.forEach((issue: any) => {
      const severity = issue.severity || 'unknown';
      if (!bySeverity[severity]) {
        bySeverity[severity] = [];
      }
      bySeverity[severity].push(issue);
    });

    // Display by severity
    if (bySeverity.critical) {
      console.log(chalk.red('🔴 Critical (' + bySeverity.critical.length + ')'));
      bySeverity.critical.forEach((issue: any) => {
        console.log(chalk.red(`   └─ ${issue.type}: ${issue.message || issue.type}`));
      });
    }

    if (bySeverity.high) {
      console.log(chalk.yellow('\n🟡 High (' + bySeverity.high.length + ')'));
      bySeverity.high.forEach((issue: any) => {
        console.log(chalk.yellow(`   └─ ${issue.type}: ${issue.message || issue.type}`));
      });
    }

    if (bySeverity.medium) {
      console.log(chalk.blue('\n🔵 Medium (' + bySeverity.medium.length + ')'));
      bySeverity.medium.forEach((issue: any) => {
        console.log(chalk.blue(`   └─ ${issue.type}: ${issue.message || issue.type}`));
      });
    }

    console.log(chalk.gray('\nRun `prodready fix` to automatically fix these issues'));
  }

  private displayScore(score: number) {
    const color = score >= 80 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
    console.log(chalk.bold('Production Readiness Score: ') + color(`${score}/100`));
    
    // Visual score bar
    const filled = Math.round(score / 5);
    const empty = 20 - filled;
    const bar = color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    console.log(bar);
  }

  async showBanner() {
    console.log(chalk.blue(`
╔═══════════════════════════════════════════╗
║                                           ║
║            🚀 ProdReady v${version}              ║
║                                           ║
║   Making AI-generated code production-ready  ║
║                                           ║
╚═══════════════════════════════════════════╝
    `));
  }

  async animateScore(from: number, to: number) {
    const duration = 2000;
    const steps = 20;
    const stepDuration = duration / steps;
    const stepSize = (to - from) / steps;

    for (let i = 0; i <= steps; i++) {
      const current = Math.round(from + stepSize * i);
      process.stdout.write(`\r${chalk.bold('Score: ')}${current}/100`);
      await new Promise(resolve => setTimeout(resolve, stepDuration));
    }
    console.log();
  }
}

// Export for testing
export default CLI;

// Run CLI if called directly
if (require.main === module) {
  const cli = new CLI();
  cli.run(process.argv);
}