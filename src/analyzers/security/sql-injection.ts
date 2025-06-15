import { IAnalyzer, Issue, Context, Severity } from '../../types';
import { traverse, t, getLineNumber, getColumnNumber } from '../../utils/parser';

export class SQLInjectionAnalyzer implements IAnalyzer {
  id = 'sql-injection';
  name = 'SQL Injection Detector';
  category = 'security' as const;

  async analyze(ast: any, context: Context): Promise<Issue[]> {
    const issues: Issue[] = [];

    traverse(ast, {
      CallExpression: (path) => {
        const node = path.node;
        
        // Check if this is a database query call
        if (this.isQueryCall(node)) {
          // Check the first argument (the query string)
          const queryArg = node.arguments[0];
          
          if (queryArg) {
            if (this.hasStringConcatenation(queryArg)) {
              const isAuthEndpoint = this.isAuthenticationEndpoint(path, context);
              
              issues.push({
                id: `sql-injection-${issues.length + 1}`,
                type: 'sql-injection',
                severity: isAuthEndpoint ? 'critical' : 'critical',
                category: 'security',
                message: isAuthEndpoint 
                  ? 'SQL injection vulnerability detected in authentication endpoint - this is extremely dangerous'
                  : 'SQL injection vulnerability detected - user input is concatenated directly into SQL query',
                line: getLineNumber(node),
                column: getColumnNumber(node),
                file: context.files.get('current')?.path || 'unknown',
                fix: {
                  description: 'Use parameterized queries to prevent SQL injection',
                  apply: async () => ({
                    transformedCode: '', // Will be implemented by transformer
                    explanation: 'Converted to parameterized query to prevent SQL injection'
                  })
                },
                impact: 'Attackers could read, modify, or delete your entire database',
                educationalContent: 'SQL injection occurs when user input is directly concatenated into SQL queries. Always use parameterized queries or prepared statements.'
              });
            }
          }
        }
      }
    });

    return issues;
  }

  shouldRun(filePath: string, context: Context): boolean {
    // Run on all JavaScript/TypeScript files
    return /\.(js|jsx|ts|tsx)$/.test(filePath);
  }

  private isQueryCall(node: any): boolean {
    if (!t.isCallExpression(node)) return false;

    // Check for common database query patterns
    const callee = node.callee;
    
    // Direct method calls: db.query(), mysql.query(), etc.
    if (t.isMemberExpression(callee)) {
      const property = callee.property;
      if (t.isIdentifier(property)) {
        const methodName = property.name.toLowerCase();
        return ['query', 'execute', 'run', 'get', 'all'].includes(methodName);
      }
    }

    // Function calls: query(), execute(), etc.
    if (t.isIdentifier(callee)) {
      const functionName = callee.name.toLowerCase();
      return ['query', 'execute', 'run'].includes(functionName);
    }

    return false;
  }

  private hasStringConcatenation(node: any): boolean {
    // Check for string concatenation with +
    if (t.isBinaryExpression(node) && node.operator === '+') {
      return true;
    }

    // Check for template literals with expressions
    if (t.isTemplateLiteral(node) && node.expressions.length > 0) {
      return true;
    }

    // Check for nested concatenation
    if (t.isBinaryExpression(node)) {
      return this.hasStringConcatenation(node.left) || this.hasStringConcatenation(node.right);
    }

    return false;
  }

  private isAuthenticationEndpoint(path: any, context: Context): boolean {
    // Check if we're in a login/auth route
    const routes = context.routes || [];
    for (const route of routes) {
      if (route.path.includes('login') || route.path.includes('auth')) {
        return true;
      }
    }

    // Check if the file path suggests authentication
    const filePath = context.files.get('current')?.path || '';
    return filePath.includes('auth') || filePath.includes('login');
  }
}