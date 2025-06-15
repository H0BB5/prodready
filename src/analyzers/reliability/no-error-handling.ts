import { IAnalyzer, Issue, Context } from '../../types';
import { traverse, t, getLineNumber, getColumnNumber } from '../../utils/parser';

export class NoErrorHandlingAnalyzer implements IAnalyzer {
  id = 'no-error-handling';
  name = 'Error Handling Detector';
  category = 'reliability' as const;

  async analyze(ast: any, context: Context): Promise<Issue[]> {
    const issues: Issue[] = [];

    traverse(ast, {
      // Check async functions without try-catch
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression': (path) => {
        const node = path.node;
        
        if (node.async) {
          if (!this.hasTryCatch(path) && this.hasAwaitCalls(path)) {
            const severity = this.determineSeverity(path, context);
            const message = this.buildMessage(path, context);
            
            issues.push({
              id: `no-error-handling-${issues.length + 1}`,
              type: 'no-error-handling',
              severity,
              category: 'reliability',
              message,
              line: getLineNumber(node),
              column: getColumnNumber(node),
              file: context.files.get('current')?.path || 'unknown',
              fix: {
                description: 'Add try-catch block to handle errors properly',
                apply: async () => ({
                  transformedCode: '', // Will be implemented by transformer
                  explanation: 'Added error handling to prevent crashes'
                })
              },
              impact: 'Unhandled errors can crash your application',
              educationalContent: 'Always handle errors in async functions to prevent crashes and provide better user experience.'
            });
          }
        }
      },

      // Check for unhandled promises (no .catch())
      CallExpression: (path) => {
        const node = path.node;
        
        if (this.isPromiseWithoutCatch(path)) {
          issues.push({
            id: `unhandled-promise-${issues.length + 1}`,
            type: 'unhandled-promise',
            severity: 'high',
            category: 'reliability',
            message: 'Promise without .catch() handler - unhandled rejections can cause issues',
            line: getLineNumber(node),
            column: getColumnNumber(node),
            file: context.files.get('current')?.path || 'unknown',
            fix: {
              description: 'Add .catch() handler to handle promise rejections',
              apply: async () => ({
                transformedCode: '',
                explanation: 'Added .catch() to handle promise rejections'
              })
            }
          });
        }
      }
    });

    return issues;
  }

  shouldRun(filePath: string, context: Context): boolean {
    return /\.(js|jsx|ts|tsx)$/.test(filePath);
  }

  private hasTryCatch(path: any): boolean {
    let hasTry = false;
    
    // Check if the function body contains a try-catch
    path.traverse({
      TryStatement: (tryPath: any) => {
        // Make sure the try-catch is at the top level of the function
        const functionPath = tryPath.getFunctionParent();
        if (functionPath === path) {
          hasTry = true;
          tryPath.stop();
        }
      }
    });

    // Also check if the function is wrapped in an error handler
    const parent = path.parent;
    if (t.isCallExpression(parent)) {
      const callee = parent.callee;
      if (t.isIdentifier(callee) && callee.name === 'asyncHandler') {
        return true;
      }
    }

    return hasTry;
  }

  private hasAwaitCalls(path: any): boolean {
    let hasAwait = false;
    
    path.traverse({
      AwaitExpression: () => {
        hasAwait = true;
      }
    });

    return hasAwait;
  }

  private isPromiseWithoutCatch(path: any): boolean {
    const node = path.node;
    
    // Check if this is a .then() call
    if (t.isMemberExpression(node.callee) && 
        t.isIdentifier(node.callee.property) && 
        node.callee.property.name === 'then') {
      
      // Check if there's a .catch() in the chain
      let current = path;
      let hasCatch = false;
      
      while (current.parent && t.isMemberExpression(current.parent.callee)) {
        const parent = current.parent;
        if (t.isCallExpression(parent) && 
            t.isIdentifier(parent.callee.property) && 
            parent.callee.property.name === 'catch') {
          hasCatch = true;
          break;
        }
        current = current.parentPath;
      }

      // Also check if the next sibling is a .catch()
      const nextSibling = path.getNextSibling();
      if (nextSibling && t.isCallExpression(nextSibling.node)) {
        const callee = nextSibling.node.callee;
        if (t.isMemberExpression(callee) && 
            t.isIdentifier(callee.property) && 
            callee.property.name === 'catch') {
          hasCatch = true;
        }
      }

      return !hasCatch;
    }

    return false;
  }

  private determineSeverity(path: any, context: Context): 'critical' | 'high' | 'medium' | 'low' {
    // Payment processing code gets critical severity
    if (context.isPaymentCode || this.isPaymentFunction(path)) {
      return 'critical';
    }

    // Database operations get high severity
    if (this.hasDatabaseOperations(path)) {
      return 'high';
    }

    return 'high';
  }

  private buildMessage(path: any, context: Context): string {
    if (context.isPaymentCode || this.isPaymentFunction(path)) {
      return 'Missing error handling in payment processing code - this could cause failed transactions or duplicate charges';
    }

    if (this.hasDatabaseOperations(path)) {
      return 'Missing error handling in database operation - this could cause data inconsistencies';
    }

    if (this.hasMultipleAwaits(path)) {
      return 'Missing error handling in async function with multiple async operations';
    }

    return 'Missing error handling in async function - errors will crash the application';
  }

  private isPaymentFunction(path: any): boolean {
    const node = path.node;
    const functionName = node.id?.name || '';
    
    // Check function name
    if (functionName.toLowerCase().includes('payment') || 
        functionName.toLowerCase().includes('charge') ||
        functionName.toLowerCase().includes('stripe')) {
      return true;
    }

    // Check for payment-related code in the function
    let hasPaymentCode = false;
    path.traverse({
      Identifier: (idPath: any) => {
        const name = idPath.node.name.toLowerCase();
        if (name.includes('stripe') || name.includes('payment') || name.includes('charge')) {
          hasPaymentCode = true;
          idPath.stop();
        }
      }
    });

    return hasPaymentCode;
  }

  private hasDatabaseOperations(path: any): boolean {
    let hasDb = false;
    
    path.traverse({
      MemberExpression: (memberPath: any) => {
        const object = memberPath.node.object;
        if (t.isIdentifier(object) && 
            (object.name === 'db' || object.name === 'database' || 
             object.name.toLowerCase().includes('model'))) {
          hasDb = true;
          memberPath.stop();
        }
      }
    });

    return hasDb;
  }

  private hasMultipleAwaits(path: any): boolean {
    let awaitCount = 0;
    
    path.traverse({
      AwaitExpression: () => {
        awaitCount++;
      }
    });

    return awaitCount > 1;
  }
}