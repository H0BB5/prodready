import { Issue, TransformFixResult, PreviewResult } from '../../types';
import { parse, generateCode } from '../../utils/parser';
import * as diff from 'diff';

export interface IFixer {
  canFix(issue: Issue): boolean;
  fix(ast: any, issue: Issue): Promise<TransformFixResult>;
  preview(ast: any, issue: Issue): Promise<PreviewResult>;
}

export interface TransformResult {
  transformedCode: string;
  appliedFixes: AppliedFix[];
}

export interface AppliedFix {
  issueId: string;
  success: boolean;
  error?: string;
  diff?: string;
}

export class TransformationEngine {
  private fixers: Map<string, IFixer> = new Map();

  registerFixer(issueType: string, fixer: IFixer) {
    this.fixers.set(issueType, fixer);
  }

  hasFixer(issueType: string): boolean {
    return this.fixers.has(issueType);
  }

  async transform(code: string, issues: Issue[]): Promise<TransformResult> {
    const appliedFixes: AppliedFix[] = [];
    let transformedCode = code;

    try {
      // Parse the code once
      let ast = await parse(code);

      // Sort issues by line number (bottom to top) to avoid position conflicts
      const sortedIssues = [...issues].sort((a, b) => (b.line || 0) - (a.line || 0));

      // Apply fixes one by one
      for (const issue of sortedIssues) {
        const fixer = this.fixers.get(issue.type);
        
        if (!fixer || !fixer.canFix(issue)) {
          appliedFixes.push({
            issueId: issue.id,
            success: false,
            error: 'No fixer available for this issue type'
          });
          continue;
        }

        try {
          // Re-parse the current code state
          ast = await parse(transformedCode);
          
          // Apply the fix
          const result = await fixer.fix(ast, issue);
          
          // Generate new code from the transformed AST
          const newCode = generateCode(result.transformedAst);
          
          // Calculate diff
          const fixDiff = diff.createPatch(
            'file',
            transformedCode,
            newCode,
            'before',
            'after'
          );

          transformedCode = newCode;
          
          appliedFixes.push({
            issueId: issue.id,
            success: true,
            diff: fixDiff
          });
        } catch (error: any) {
          appliedFixes.push({
            issueId: issue.id,
            success: false,
            error: error.message
          });
        }
      }

      return {
        transformedCode,
        appliedFixes
      };
    } catch (error: any) {
      // If parsing fails, return original code with all fixes marked as failed
      return {
        transformedCode: code,
        appliedFixes: issues.map(issue => ({
          issueId: issue.id,
          success: false,
          error: 'Failed to parse code: ' + error.message
        }))
      };
    }
  }

  async preview(code: string, issues: Issue[]): Promise<PreviewResult[]> {
    const previews: PreviewResult[] = [];

    for (const issue of issues) {
      const fixer = this.fixers.get(issue.type);
      
      if (!fixer) {
        continue;
      }

      try {
        const ast = await parse(code);
        const preview = await fixer.preview(ast, issue);
        previews.push(preview);
      } catch (error: any) {
        previews.push({
          issueId: issue.id,
          original: '',
          fixed: '',
          diff: '',
          explanation: 'Failed to generate preview: ' + error.message
        });
      }
    }

    return previews;
  }
}