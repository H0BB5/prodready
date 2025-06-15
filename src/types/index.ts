// Type definitions for ProdReady

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Category = 'security' | 'reliability' | 'performance' | 'observability' | 'maintainability' | 'operational';

export interface Issue {
  id: string;
  type: string;
  severity: Severity;
  category: Category;
  message: string;
  line: number;
  column?: number;
  file: string;
  fix?: Fix;
  impact?: string;
  educationalContent?: string;
  context?: Record<string, any>;
}

export interface Fix {
  description: string;
  apply: () => Promise<TransformResult>;
}

export interface TransformResult {
  transformedCode: string;
  explanation: string;
  educationalContent?: string;
}

export interface Context {
  projectType: 'node' | 'python' | 'go' | 'unknown';
  framework?: string;
  dependencies: string[];
  routes: Route[];
  files: Map<string, FileInfo>;
  isPaymentCode?: boolean;
  hasUserData?: boolean;
  isAuthenticationCode?: boolean;
}

export interface Route {
  method: string;
  path: string;
  handler: string;
}

export interface FileInfo {
  path: string;
  size: number;
  lastModified: Date;
}

export interface AnalysisResult {
  score: number;
  issues: Issue[];
  totalIssues: number;
  byCategory: Record<Category, number>;
  bySeverity: Record<Severity, number>;
  files: string[];
  context: Context;
}

export interface FixResult {
  appliedFixes: AppliedFix[];
  transformedFiles: Map<string, string>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface AppliedFix {
  issueId: string;
  success: boolean;
  error?: string;
  diff?: string;
}

export interface IAnalyzer {
  id: string;
  name: string;
  category: Category;
  
  analyze(ast: any, context: Context): Promise<Issue[]>;
  shouldRun(filePath: string, context: Context): boolean;
}

export interface ITransformer {
  id: string;
  analyzerId: string;
  
  canFix(issue: Issue): boolean;
  fix(ast: any, issue: Issue): Promise<TransformFixResult>;
  preview(ast: any, issue: Issue): Promise<PreviewResult>;
}

export interface TransformFixResult {
  transformedAst: any;
  explanation: string;
  educationalContent: string;
}

export interface PreviewResult {
  issueId: string;
  original: string;
  fixed: string;
  diff: string;
  explanation: string;
}

export interface CLIOptions {
  format?: 'pretty' | 'json';
  quiet?: boolean;
  verbose?: boolean;
  category?: Category;
  severity?: Severity;
  fix?: boolean;
  preview?: boolean;
  interactive?: boolean;
  output?: string;
}

export interface ReportOptions {
  format: 'html' | 'json' | 'pdf';
  includeEducation: boolean;
  includeCodeSamples: boolean;
}

// Custom Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toContainIssue(issueType: string): R;
    }
  }
}