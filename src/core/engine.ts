import { IAnalyzer, Issue, Context, AnalysisResult, FixResult, CLIOptions, ReportOptions } from '../types';
import { TransformationEngine } from '../transformers/transformation-engine';
import { IFixer } from '../transformers/transformation-engine';
import { parse } from '../utils/parser';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ProdReadyEngine {
  private analyzers: IAnalyzer[] = [];
  private transformationEngine: TransformationEngine;

  constructor() {
    this.transformationEngine = new TransformationEngine();
  }

  registerAnalyzer(analyzer: IAnalyzer) {
    this.analyzers.push(analyzer);
  }

  registerFixer(issueType: string, fixer: IFixer) {
    this.transformationEngine.registerFixer(issueType, fixer);
  }

  async scan(projectPath: string, options: Partial<CLIOptions> = {}): Promise<AnalysisResult> {
    const files = await this.discoverFiles(projectPath);
    const issues: Issue[] = [];
    const context = await this.buildContext(projectPath, files);

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const ast = await parse(content);
        
        // Set current file in context
        context.files.set('current', {
          path: file,
          size: content.length,
          lastModified: new Date()
        });

        // Run analyzers
        for (const analyzer of this.analyzers) {
          if (analyzer.shouldRun(file, context)) {
            if (!options.category || analyzer.category === options.category) {
              const fileIssues = await analyzer.analyze(ast, context);
              
              // Add file path to issues
              fileIssues.forEach(issue => {
                issue.file = path.relative(projectPath, file);
              });
              
              issues.push(...fileIssues);
            }
          }
        }
      } catch (error: any) {
        // Add parse error as an issue
        issues.push({
          id: `parse-error-${Date.now()}`,
          type: 'parse-error',
          severity: 'high',
          category: 'reliability',
          message: `Failed to parse file: ${error.message}`,
          line: 0,
          file: path.relative(projectPath, file)
        });
      }
    }

    const score = this.calculateScore(issues);

    return {
      score,
      issues,
      totalIssues: issues.length,
      byCategory: this.groupByCategory(issues),
      bySeverity: this.groupBySeverity(issues),
      files: files.map(f => path.relative(projectPath, f)),
      context
    };
  }

  async analyze(projectPath: string): Promise<AnalysisResult> {
    return this.scan(projectPath);
  }

  async fix(analysisResult: AnalysisResult): Promise<FixResult> {
    const transformedFiles = new Map<string, string>();
    const appliedFixes: any[] = [];
    let totalSuccessful = 0;
    let totalFailed = 0;

    // Group issues by file
    const issuesByFile = new Map<string, Issue[]>();
    analysisResult.issues.forEach(issue => {
      const file = issue.file || 'unknown';
      if (!issuesByFile.has(file)) {
        issuesByFile.set(file, []);
      }
      issuesByFile.get(file)!.push(issue);
    });

    // Process each file
    for (const [relativePath, fileIssues] of issuesByFile) {
      try {
        const fullPath = path.join(
          analysisResult.context.files.get('project')?.path || '.',
          relativePath
        );
        
        const content = await fs.readFile(fullPath, 'utf-8');
        const result = await this.transformationEngine.transform(content, fileIssues);
        
        // Write the transformed file
        await fs.writeFile(fullPath, result.transformedCode, 'utf-8');
        transformedFiles.set(relativePath, result.transformedCode);
        
        // Update counts
        result.appliedFixes.forEach(fix => {
          if (fix.success) {
            totalSuccessful++;
          } else {
            totalFailed++;
          }
          appliedFixes.push(fix);
        });
      } catch (error: any) {
        totalFailed += fileIssues.length;
        fileIssues.forEach(issue => {
          appliedFixes.push({
            issueId: issue.id,
            success: false,
            error: error.message
          });
        });
      }
    }

    return {
      appliedFixes,
      transformedFiles,
      summary: {
        total: totalSuccessful + totalFailed,
        successful: totalSuccessful,
        failed: totalFailed
      }
    };
  }

  async generateReport(analysisResult: AnalysisResult, options: ReportOptions): Promise<any> {
    const report = {
      summary: {
        score: analysisResult.score,
        totalIssues: analysisResult.totalIssues,
        byCategory: analysisResult.byCategory,
        bySeverity: analysisResult.bySeverity
      },
      issues: analysisResult.issues.map(issue => ({
        type: issue.type,
        severity: issue.severity,
        category: issue.category,
        message: issue.message,
        file: issue.file,
        line: issue.line,
        impact: issue.impact
      })),
      recommendations: this.generateRecommendations(analysisResult),
      education: options.includeEducation ? this.generateEducation(analysisResult) : undefined
    };

    if (options.format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    // For HTML format, create a simple HTML report
    return this.generateHTMLReport(report);
  }

  private async discoverFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const stats = await fs.stat(projectPath);
      
      if (stats.isFile()) {
        if (this.isJavaScriptFile(projectPath)) {
          files.push(projectPath);
        }
      } else if (stats.isDirectory()) {
        await this.walkDirectory(projectPath, files);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    
    return files;
  }

  private async walkDirectory(dir: string, files: string[]) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip common directories to ignore
      if (entry.isDirectory()) {
        if (this.shouldIgnoreDirectory(entry.name)) {
          continue;
        }
        
        // Check for .prodreadyignore
        const hasIgnoreFile = await this.hasIgnoreFile(dir);
        if (hasIgnoreFile && await this.isIgnored(fullPath, dir)) {
          continue;
        }
        
        await this.walkDirectory(fullPath, files);
      } else if (entry.isFile() && this.isJavaScriptFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  private isJavaScriptFile(filePath: string): boolean {
    return /\.(js|jsx|ts|tsx)$/.test(filePath) && 
           !filePath.includes('.test.') &&
           !filePath.includes('.spec.');
  }

  private shouldIgnoreDirectory(name: string): boolean {
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt'];
    return ignoreDirs.includes(name);
  }

  private async hasIgnoreFile(dir: string): Promise<boolean> {
    try {
      await fs.access(path.join(dir, '.prodreadyignore'));
      return true;
    } catch {
      return false;
    }
  }

  private async isIgnored(filePath: string, projectDir: string): Promise<boolean> {
    // Simple implementation - in real world, use a proper gitignore parser
    try {
      const ignoreContent = await fs.readFile(path.join(projectDir, '.prodreadyignore'), 'utf-8');
      const patterns = ignoreContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      const relativePath = path.relative(projectDir, filePath);
      
      for (const pattern of patterns) {
        if (relativePath.includes(pattern.trim())) {
          return true;
        }
      }
    } catch {
      // Ignore file doesn't exist or can't be read
    }
    
    return false;
  }

  private async buildContext(projectPath: string, files: string[]): Promise<Context> {
    const projectType = await this.detectProjectType(projectPath);
    const dependencies = await this.getDependencies(projectPath);
    
    return {
      projectType,
      framework: this.detectFramework(dependencies),
      dependencies,
      routes: [],
      files: new Map([
        ['project', { path: projectPath, size: 0, lastModified: new Date() }]
      ])
    };
  }

  private async detectProjectType(projectPath: string): Promise<'node' | 'unknown'> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      await fs.access(packageJsonPath);
      return 'node';
    } catch {
      return 'unknown';
    }
  }

  private async getDependencies(projectPath: string): Promise<string[]> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      
      return [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {})
      ];
    } catch {
      return [];
    }
  }

  private detectFramework(dependencies: string[]): string | undefined {
    if (dependencies.includes('express')) return 'express';
    if (dependencies.includes('koa')) return 'koa';
    if (dependencies.includes('fastify')) return 'fastify';
    if (dependencies.includes('react')) return 'react';
    if (dependencies.includes('vue')) return 'vue';
    if (dependencies.includes('angular')) return 'angular';
    return undefined;
  }

  private calculateScore(issues: Issue[]): number {
    let score = 100;
    
    issues.forEach(issue => {
      switch (issue.severity) {
        case 'critical':
          score -= 20;
          break;
        case 'high':
          score -= 10;
          break;
        case 'medium':
          score -= 5;
          break;
        case 'low':
          score -= 2;
          break;
      }
    });
    
    return Math.max(0, score);
  }

  private groupByCategory(issues: Issue[]): Record<string, number> {
    const result: Record<string, number> = {};
    
    issues.forEach(issue => {
      const category = issue.category || 'unknown';
      result[category] = (result[category] || 0) + 1;
    });
    
    return result;
  }

  private groupBySeverity(issues: Issue[]): Record<string, number> {
    const result: Record<string, number> = {};
    
    issues.forEach(issue => {
      const severity = issue.severity || 'unknown';
      result[severity] = (result[severity] || 0) + 1;
    });
    
    return result;
  }

  private generateRecommendations(analysisResult: AnalysisResult): string[] {
    const recommendations: string[] = [];
    
    if (analysisResult.bySeverity.critical > 0) {
      recommendations.push('Fix critical security issues immediately');
    }
    
    if (analysisResult.byCategory.security > 5) {
      recommendations.push('Consider a security audit');
    }
    
    if (analysisResult.byCategory.reliability > 10) {
      recommendations.push('Improve error handling across the application');
    }
    
    if (analysisResult.score < 50) {
      recommendations.push('Consider refactoring to improve code quality');
    }
    
    return recommendations;
  }

  private generateEducation(analysisResult: AnalysisResult): Record<string, string> {
    const education: Record<string, string> = {};
    
    if (analysisResult.issues.some(i => i.type === 'sql-injection')) {
      education['sql-injection'] = 'SQL injection is a critical vulnerability. Always use parameterized queries.';
    }
    
    if (analysisResult.issues.some(i => i.type === 'hardcoded-secret')) {
      education['hardcoded-secret'] = 'Never commit secrets to source control. Use environment variables.';
    }
    
    return education;
  }

  private generateHTMLReport(report: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>ProdReady Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    .score { font-size: 48px; font-weight: bold; }
    .critical { color: #dc3545; }
    .high { color: #fd7e14; }
    .medium { color: #ffc107; }
    .low { color: #0dcaf0; }
  </style>
</head>
<body>
  <h1>ProdReady Production Readiness Report</h1>
  
  <h2>Score</h2>
  <div class="score">${report.summary.score}/100</div>
  
  <h2>Summary</h2>
  <p>Total Issues: ${report.summary.totalIssues}</p>
  
  <h2>Issues by Severity</h2>
  <ul>
    ${Object.entries(report.summary.bySeverity)
      .map(([severity, count]) => `<li class="${severity}">${severity}: ${count}</li>`)
      .join('')}
  </ul>
  
  <h2>Recommendations</h2>
  <ul>
    ${report.recommendations.map((r: string) => `<li>${r}</li>`).join('')}
  </ul>
</body>
</html>
    `;
  }
}