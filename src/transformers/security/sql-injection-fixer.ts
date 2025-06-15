import { Issue, TransformFixResult, PreviewResult } from '../../../types';
import { traverse, t, generateCode } from '../../../utils/parser';
import { IFixer } from '../transformation-engine';

export class SQLInjectionFixer implements IFixer {
  canFix(issue: Issue): boolean {
    return issue.type === 'sql-injection';
  }

  async fix(ast: any, issue: Issue): Promise<TransformFixResult> {
    const transformedAst = JSON.parse(JSON.stringify(ast)); // Deep clone
    const parameters: any[] = [];

    traverse(transformedAst, {
      CallExpression: (path) => {
        const node = path.node;
        
        // Check if this is the query call we're looking for (based on line number)
        if (this.isQueryCall(node) && this.isTargetLine(node, issue.line)) {
          const queryArg = node.arguments[0];
          
          if (queryArg) {
            const result = this.transformQuery(queryArg, parameters);
            node.arguments[0] = result.queryNode;
            
            // Add parameters array as second argument
            if (parameters.length > 0) {
              node.arguments[1] = t.arrayExpression(
                parameters.map(param => param.node)
              );
            }
            
            path.stop();
          }
        }
      }
    });

    return {
      transformedAst,
      explanation: 'Converted string concatenation to parameterized query to prevent SQL injection',
      educationalContent: 'Parameterized queries separate SQL code from data, preventing attackers from injecting malicious SQL. Always use placeholders (?) for user input.'
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

  private isQueryCall(node: any): boolean {
    if (!t.isCallExpression(node)) return false;

    const callee = node.callee;
    
    if (t.isMemberExpression(callee)) {
      const property = callee.property;
      if (t.isIdentifier(property)) {
        const methodName = property.name.toLowerCase();
        return ['query', 'execute', 'run', 'get', 'all'].includes(methodName);
      }
    }

    if (t.isIdentifier(callee)) {
      const functionName = callee.name.toLowerCase();
      return ['query', 'execute', 'run'].includes(functionName);
    }

    return false;
  }

  private isTargetLine(node: any, targetLine?: number): boolean {
    if (!targetLine) return true;
    const nodeLine = node.loc?.start?.line;
    return nodeLine === targetLine || (nodeLine >= targetLine - 1 && nodeLine <= targetLine + 1);
  }

  private transformQuery(queryNode: any, parameters: any[]): { queryNode: any } {
    if (t.isBinaryExpression(queryNode) && queryNode.operator === '+') {
      return this.transformBinaryExpression(queryNode, parameters);
    } else if (t.isTemplateLiteral(queryNode)) {
      return this.transformTemplateLiteral(queryNode, parameters);
    }
    
    return { queryNode };
  }

  private transformBinaryExpression(node: any, parameters: any[]): { queryNode: any } {
    const parts: any[] = [];
    
    // Flatten the binary expression tree
    this.flattenBinaryExpression(node, parts);
    
    // Build new query string with placeholders
    const queryParts: string[] = [];
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (t.isStringLiteral(part)) {
        // Keep string literals but replace concatenation points with ?
        let value = part.value;
        
        // If this is not the last part and the next part is a variable, add ?
        if (i < parts.length - 1 && !t.isStringLiteral(parts[i + 1])) {
          value = value.trimEnd() + ' ?';
        }
        
        queryParts.push(value);
      } else {
        // This is a parameter
        parameters.push({ node: part, value: part });
        
        // If the previous part didn't add a ?, add it now
        if (i > 0 && !queryParts[queryParts.length - 1].endsWith('?')) {
          queryParts[queryParts.length - 1] += ' ?';
        }
      }
    }
    
    // Join the query parts and clean up
    let finalQuery = queryParts.join('').replace(/\s+\?/g, ' ?').trim();
    
    // Handle common patterns
    finalQuery = finalQuery.replace(/=\s*\?/g, '= ?');
    finalQuery = finalQuery.replace(/>\s*\?/g, '> ?');
    finalQuery = finalQuery.replace(/<\s*\?/g, '< ?');
    
    return {
      queryNode: t.stringLiteral(finalQuery)
    };
  }

  private transformTemplateLiteral(node: any, parameters: any[]): { queryNode: any } {
    const quasis = node.quasis;
    const expressions = node.expressions;
    
    let queryString = '';
    
    for (let i = 0; i < quasis.length; i++) {
      queryString += quasis[i].value.raw;
      
      if (i < expressions.length) {
        queryString += '?';
        parameters.push({ node: expressions[i], value: expressions[i] });
      }
    }
    
    // Clean up the query
    queryString = queryString.replace(/'\?'/g, '?');
    
    return {
      queryNode: t.stringLiteral(queryString)
    };
  }

  private flattenBinaryExpression(node: any, parts: any[]) {
    if (t.isBinaryExpression(node) && node.operator === '+') {
      this.flattenBinaryExpression(node.left, parts);
      this.flattenBinaryExpression(node.right, parts);
    } else {
      parts.push(node);
    }
  }

  private extractRelevantCode(code: string, line?: number): string {
    if (!line) return code;
    
    const lines = code.split('\n');
    const start = Math.max(0, line - 3);
    const end = Math.min(lines.length, line + 2);
    
    return lines.slice(start, end).join('\n');
  }

  private generateDiff(original: string, fixed: string): string {
    // Simple diff for preview
    return `- ${original}\n+ ${fixed}`;
  }
}