import { Issue, TransformFixResult, PreviewResult } from '../../../types';
import { traverse, t, generateCode } from '../../../utils/parser';
import { IFixer } from '../transformation-engine';

export class ErrorHandlingFixer implements IFixer {
  canFix(issue: Issue): boolean {
    return issue.type === 'no-error-handling' || issue.type === 'unhandled-promise';
  }

  async fix(ast: any, issue: Issue): Promise<TransformFixResult> {
    const transformedAst = JSON.parse(JSON.stringify(ast)); // Deep clone

    if (issue.type === 'no-error-handling') {
      this.addTryCatchToAsyncFunction(transformedAst, issue);
    } else if (issue.type === 'unhandled-promise') {
      this.addCatchToPromise(transformedAst, issue);
    }

    return {
      transformedAst,
      explanation: 'Added error handling to prevent crashes and improve reliability',
      educationalContent: 'Proper error handling prevents your application from crashing and provides better user experience. Always handle errors in async operations.'
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

  private addTryCatchToAsyncFunction(ast: any, issue: Issue) {
    traverse(ast, {
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression': (path) => {
        const node = path.node;
        
        if (node.async && this.isTargetLine(node, issue.line)) {
          // Get the function body
          let body = node.body;
          
          // For arrow functions with expression body, convert to block
          if (t.isExpression(body)) {
            body = t.blockStatement([t.returnStatement(body)]);
            node.body = body;
          }

          if (t.isBlockStatement(body) && !this.hasTryCatch(body)) {
            const isPayment = issue.context?.isPaymentCode || 
                            this.isPaymentFunction(node);
            
            // Wrap the entire body in try-catch
            const tryBlock = t.tryStatement(
              t.blockStatement(body.body),
              t.catchClause(
                t.identifier('error'),
                t.blockStatement([
                  // Log the error
                  this.createErrorLog(node, isPayment),
                  // Throw or handle based on context
                  this.createErrorHandler(isPayment)
                ])
              )
            );

            body.body = [tryBlock];
            path.stop();
          }
        }
      }
    });
  }

  private addCatchToPromise(ast: any, issue: Issue) {
    traverse(ast, {
      CallExpression: (path) => {
        const node = path.node;
        
        if (this.isPromiseChain(node) && this.isTargetLine(node, issue.line)) {
          // Check if there's already a .catch()
          if (!this.hasCatchInChain(path)) {
            // Add .catch() to the chain
            const catchCall = t.callExpression(
              t.memberExpression(node, t.identifier('catch')),
              [
                t.arrowFunctionExpression(
                  [t.identifier('error')],
                  t.blockStatement([
                    t.expressionStatement(
                      t.callExpression(
                        t.memberExpression(
                          t.identifier('console'),
                          t.identifier('error')
                        ),
                        [
                          t.stringLiteral('Promise rejected:'),
                          t.identifier('error')
                        ]
                      )
                    )
                  ])
                )
              ]
            );

            // Replace the current node with the new chain
            path.replaceWith(catchCall);
            path.stop();
          }
        }
      }
    });
  }

  private hasTryCatch(blockStatement: any): boolean {
    return blockStatement.body.some((statement: any) => 
      t.isTryStatement(statement)
    );
  }

  private isPromiseChain(node: any): boolean {
    return t.isCallExpression(node) &&
           t.isMemberExpression(node.callee) &&
           t.isIdentifier(node.callee.property) &&
           node.callee.property.name === 'then';
  }

  private hasCatchInChain(path: any): boolean {
    let current = path;
    
    while (current.parent) {
      if (t.isCallExpression(current.parent) &&
          t.isMemberExpression(current.parent.callee) &&
          t.isIdentifier(current.parent.callee.property) &&
          current.parent.callee.property.name === 'catch') {
        return true;
      }
      current = current.parentPath;
    }
    
    return false;
  }

  private isTargetLine(node: any, targetLine?: number): boolean {
    if (!targetLine) return true;
    const nodeLine = node.loc?.start?.line;
    return nodeLine === targetLine || (nodeLine >= targetLine - 1 && nodeLine <= targetLine + 1);
  }

  private isPaymentFunction(node: any): boolean {
    const name = node.id?.name || '';
    return name.toLowerCase().includes('payment') || 
           name.toLowerCase().includes('charge') ||
           name.toLowerCase().includes('stripe');
  }

  private createErrorLog(functionNode: any, isPayment: boolean): any {
    const functionName = functionNode.id?.name || 'Anonymous function';
    const message = isPayment 
      ? `Payment processing failed in ${functionName}:`
      : `${functionName} failed:`;

    // Use logger if available, otherwise console.error
    return t.expressionStatement(
      t.callExpression(
        t.memberExpression(
          t.conditionalExpression(
            t.binaryExpression(
              '!==',
              t.unaryExpression('typeof', t.identifier('logger')),
              t.stringLiteral('undefined')
            ),
            t.identifier('logger'),
            t.identifier('console')
          ),
          t.identifier('error')
        ),
        [
          t.stringLiteral(message),
          t.identifier('error')
        ]
      )
    );
  }

  private createErrorHandler(isPayment: boolean): any {
    if (isPayment) {
      // For payment code, throw a specific error
      return t.throwStatement(
        t.newExpression(
          t.identifier('Error'),
          [t.stringLiteral('Payment processing failed')]
        )
      );
    } else {
      // For other code, just re-throw
      return t.throwStatement(t.identifier('error'));
    }
  }

  private extractRelevantCode(code: string, line?: number): string {
    if (!line) return code;
    
    const lines = code.split('\n');
    const start = Math.max(0, line - 3);
    const end = Math.min(lines.length, line + 5);
    
    return lines.slice(start, end).join('\n');
  }

  private generateDiff(original: string, fixed: string): string {
    return `- ${original}\n+ ${fixed}`;
  }
}