import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

export async function parse(code: string): Promise<any> {
  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'dynamicImport',
        'classProperties',
        'asyncGenerators',
        'objectRestSpread',
        'optionalCatchBinding',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
      errorRecovery: true,
    });
    
    return ast;
  } catch (error: any) {
    // If parsing fails completely, return a minimal AST with error info
    return {
      type: 'File',
      errors: [error.message],
      program: {
        type: 'Program',
        body: [],
      },
    };
  }
}

export { traverse, generate, t };

// Re-export commonly used functions for convenience
export function generateCode(ast: any): string {
  const result = generate(ast, {
    comments: true,
    compact: false,
  });
  
  return result.code;
}

// Helper to find nodes of a specific type
export function findNodes(ast: any, nodeType: string): any[] {
  const nodes: any[] = [];
  
  traverse(ast, {
    [nodeType]: (path) => {
      nodes.push(path.node);
    },
  });
  
  return nodes;
}

// Helper to get line number from a node
export function getLineNumber(node: any): number {
  return node.loc?.start?.line || 0;
}

// Helper to get column number from a node
export function getColumnNumber(node: any): number {
  return node.loc?.start?.column || 0;
}