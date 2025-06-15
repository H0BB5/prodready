import { Issue, TransformFixResult, PreviewResult } from '../../../types';
import { traverse, t, generateCode } from '../../../utils/parser';
import { IFixer } from '../transformation-engine';

export class HardcodedSecretsFixer implements IFixer {
  canFix(issue: Issue): boolean {
    return issue.type === 'hardcoded-secret';
  }

  async fix(ast: any, issue: Issue): Promise<TransformFixResult> {
    const transformedAst = JSON.parse(JSON.stringify(ast)); // Deep clone

    traverse(transformedAst, {
      // Fix variable declarations
      VariableDeclarator: (path) => {
        const node = path.node;
        
        if (t.isIdentifier(node.id) && t.isStringLiteral(node.init) && 
            this.isTargetLine(node, issue.line)) {
          const varName = node.id.name;
          const envVarName = this.generateEnvVarName(varName);
          
          // Replace with process.env access
          node.init = t.memberExpression(
            t.memberExpression(
              t.identifier('process'),
              t.identifier('env')
            ),
            t.identifier(envVarName)
          );
          
          // Add comment
          this.addComment(path, `// ${envVarName} should be set in your environment variables`);
          path.stop();
        }
      },

      // Fix object properties
      ObjectProperty: (path) => {
        const node = path.node;
        
        if ((t.isIdentifier(node.key) || t.isStringLiteral(node.key)) && 
            t.isStringLiteral(node.value) &&
            this.isTargetLine(node, issue.line)) {
          const keyName = t.isIdentifier(node.key) ? node.key.name : node.key.value;
          const envVarName = this.generateEnvVarName(keyName);
          
          // Replace with process.env access
          node.value = t.memberExpression(
            t.memberExpression(
              t.identifier('process'),
              t.identifier('env')
            ),
            t.identifier(envVarName)
          );
          
          path.stop();
        }
      },

      // Fix function call arguments
      CallExpression: (path) => {
        const node = path.node;
        
        if (this.isTargetLine(node, issue.line)) {
          node.arguments = node.arguments.map((arg: any, index: number) => {
            if (t.isStringLiteral(arg) && this.looksLikeSecret(arg.value)) {
              // Determine env var name based on context
              const envVarName = this.getEnvVarNameFromContext(path, index);
              
              return t.memberExpression(
                t.memberExpression(
                  t.identifier('process'),
                  t.identifier('env')
                ),
                t.identifier(envVarName)
              );
            }
            return arg;
          });
          
          path.stop();
        }
      }
    });

    const secretCount = this.countSecrets(ast);
    const suggestion = secretCount > 5 
      ? 'Consider using a secret management service for better security.'
      : 'Set these values in your .env file and ensure it\'s in .gitignore.';

    return {
      transformedAst,
      explanation: 'Moved hardcoded secret to environment variable for security',
      educationalContent: `Never commit secrets to source control. Use environment variables or secret management services. ${suggestion}`
    };
  }

  async preview(ast: any, issue: Issue): Promise<PreviewResult> {
    const original = generateCode(ast);
    const result = await this.fix(ast, issue);
    const fixed = generateCode(result.transformedAst);

    return {
      issueId: issue.id,
      original: this.extractRelevantCode(original, issue.line),
      fixed: this.extractRelevantCode(fixed, issue.line),
      diff: this.generateDiff(original, fixed),
      explanation: result.explanation
    };
  }

  private isTargetLine(node: any, targetLine?: number): boolean {
    if (!targetLine) return true;
    const nodeLine = node.loc?.start?.line;
    return nodeLine === targetLine || (nodeLine >= targetLine - 1 && nodeLine <= targetLine + 1);
  }

  private generateEnvVarName(originalName: string): string {
    // Convert camelCase to UPPER_SNAKE_CASE
    let envName = originalName
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase();
    
    // Clean up common patterns
    envName = envName
      .replace(/API_KEY/, 'API_KEY')
      .replace(/DB_PASSWORD/, 'DB_PASSWORD')
      .replace(/SECRET_KEY/, 'SECRET_KEY')
      .replace(/CLIENT_SECRET/, 'CLIENT_SECRET')
      .replace(/ACCESS_KEY/, 'ACCESS_KEY')
      .replace(/PRIVATE_KEY/, 'PRIVATE_KEY');
    
    // Ensure it's a valid env var name
    envName = envName.replace(/[^A-Z0-9_]/g, '_');
    
    // Add prefix if needed
    if (!/^[A-Z]/.test(envName)) {
      envName = 'SECRET_' + envName;
    }
    
    return envName;
  }

  private getEnvVarNameFromContext(path: any, argIndex: number): string {
    const callee = path.node.callee;
    
    // Check for common patterns
    if (t.isMemberExpression(callee) || t.isIdentifier(callee)) {
      const name = t.isIdentifier(callee) 
        ? callee.name 
        : (t.isIdentifier(callee.property) ? callee.property.name : '');
      
      if (name.toLowerCase().includes('stripe')) {
        return 'STRIPE_SECRET_KEY';
      }
      if (name.toLowerCase().includes('aws')) {
        return argIndex === 0 ? 'AWS_ACCESS_KEY_ID' : 'AWS_SECRET_ACCESS_KEY';
      }
      if (name.toLowerCase().includes('database') || name.toLowerCase().includes('db')) {
        return 'DATABASE_PASSWORD';
      }
    }
    
    // Check parent context
    const parentPath = path.parentPath;
    if (parentPath && t.isCallExpression(parentPath.node)) {
      const parentCallee = parentPath.node.callee;
      if (t.isIdentifier(parentCallee) && parentCallee.name === 'require') {
        // This is likely require('module')(secret)
        const moduleName = parentPath.node.arguments[0];
        if (t.isStringLiteral(moduleName)) {
          if (moduleName.value === 'stripe') {
            return 'STRIPE_SECRET_KEY';
          }
        }
      }
    }
    
    return 'API_SECRET';
  }

  private looksLikeSecret(value: string): boolean {
    return value.length > 10 && (
      value.includes('secret') ||
      value.includes('key') ||
      value.includes('password') ||
      value.includes('token') ||
      /^[a-zA-Z0-9_-]{20,}$/.test(value)
    );
  }

  private addComment(path: any, comment: string) {
    const node = path.node;
    if (!node.leadingComments) {
      node.leadingComments = [];
    }
    node.leadingComments.push({
      type: 'CommentLine',
      value: comment
    });
  }

  private countSecrets(ast: any): number {
    let count = 0;
    
    traverse(ast, {
      StringLiteral: (path) => {
        if (this.looksLikeSecret(path.node.value)) {
          count++;
        }
      }
    });
    
    return count;
  }

  private extractRelevantCode(code: string, line?: number): string {
    if (!line) return code;
    
    const lines = code.split('\n');
    const start = Math.max(0, line - 2);
    const end = Math.min(lines.length, line + 2);
    
    return lines.slice(start, end).join('\n');
  }

  private generateDiff(original: string, fixed: string): string {
    return `- ${original}\n+ ${fixed}`;
  }
}