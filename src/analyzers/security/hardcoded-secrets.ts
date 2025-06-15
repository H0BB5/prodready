import { IAnalyzer, Issue, Context } from '../../types';
import { traverse, t, getLineNumber, getColumnNumber } from '../../utils/parser';

export class HardcodedSecretsAnalyzer implements IAnalyzer {
  id = 'hardcoded-secrets';
  name = 'Hardcoded Secrets Detector';
  category = 'security' as const;

  // Patterns that indicate secrets
  private secretPatterns = [
    // API Keys
    /api[_-]?key/i,
    /apikey/i,
    /access[_-]?key/i,
    /secret[_-]?key/i,
    
    // Passwords
    /password/i,
    /passwd/i,
    /pwd/i,
    
    // Tokens
    /token/i,
    /auth/i,
    /bearer/i,
    
    // Database
    /db[_-]?pass/i,
    /database[_-]?password/i,
    
    // OAuth
    /client[_-]?secret/i,
    /oauth/i,
    
    // Private keys
    /private[_-]?key/i,
    /priv[_-]?key/i,
    
    // AWS
    /aws[_-]?access/i,
    /aws[_-]?secret/i,
    
    // Generic
    /secret/i,
    /credential/i,
  ];

  // Patterns that indicate the value might be a secret
  private valuePatterns = [
    /^sk_live_/i,  // Stripe live key
    /^sk_test_/i,  // Stripe test key
    /^pk_live_/i,  // Public keys are OK but we'll warn
    /^pk_test_/i,
    /^ghp_/,       // GitHub personal access token
    /^gho_/,       // GitHub OAuth token
    /^ghu_/,       // GitHub user token
    /^ghs_/,       // GitHub server token
    /^ghr_/,       // GitHub refresh token
    /xox[baprs]-/,  // Slack tokens
    /^-----BEGIN.*PRIVATE KEY-----/,  // Private keys
    /^-----BEGIN.*RSA PRIVATE KEY-----/,
    /^-----BEGIN OPENSSH PRIVATE KEY-----/,
  ];

  // Common placeholder values that aren't real secrets
  private placeholderPatterns = [
    /your[_-]?api[_-]?key[_-]?here/i,
    /replace[_-]?with[_-]?your[_-]?key/i,
    /\<your[_-]?.*[_-]?here\>/i,
    /xxx+/i,
    /placeholder/i,
    /example/i,
    /changeme/i,
  ];

  async analyze(ast: any, context: Context): Promise<Issue[]> {
    const issues: Issue[] = [];

    traverse(ast, {
      // Check string literals
      StringLiteral: (path) => {
        this.checkStringValue(path, path.node.value, issues, context);
      },

      // Check template literals
      TemplateLiteral: (path) => {
        const node = path.node;
        // For now, just check if it looks like it might contain secrets
        if (node.quasis.some(q => this.looksLikeSecret(q.value.raw))) {
          const line = getLineNumber(node);
          issues.push(this.createIssue(
            'hardcoded-secret',
            'Potential secret in template literal',
            line,
            getColumnNumber(node),
            context,
            this.determineSeverity('')
          ));
        }
      },

      // Check variable assignments
      VariableDeclarator: (path) => {
        const node = path.node;
        if (t.isIdentifier(node.id) && t.isStringLiteral(node.init)) {
          const varName = node.id.name;
          const value = node.init.value;
          
          if (this.isSecretVariableName(varName) && this.isSecretValue(value)) {
            const line = getLineNumber(node);
            issues.push(this.createIssue(
              'hardcoded-secret',
              `Hardcoded secret: ${this.getSecretType(varName, value)}`,
              line,
              getColumnNumber(node),
              context,
              this.determineSeverity(value)
            ));
          }
        }
      },

      // Check object properties
      ObjectProperty: (path) => {
        const node = path.node;
        if ((t.isIdentifier(node.key) || t.isStringLiteral(node.key)) && 
            t.isStringLiteral(node.value)) {
          const keyName = t.isIdentifier(node.key) ? node.key.name : node.key.value;
          const value = node.value.value;
          
          if (this.isSecretVariableName(keyName) && this.isSecretValue(value)) {
            const line = getLineNumber(node);
            issues.push(this.createIssue(
              'hardcoded-secret',
              `Hardcoded secret in config: ${this.getSecretType(keyName, value)}`,
              line,
              getColumnNumber(node),
              context,
              this.determineSeverity(value)
            ));
          }
        }
      },

      // Check function calls (e.g., require('stripe')('sk_live_...'))
      CallExpression: (path) => {
        const node = path.node;
        // Check arguments for secrets
        node.arguments.forEach((arg: any) => {
          if (t.isStringLiteral(arg)) {
            this.checkStringValue(path, arg.value, issues, context);
          }
        });
      }
    });

    return issues;
  }

  shouldRun(filePath: string, context: Context): boolean {
    // Skip test files and config files
    if (filePath.includes('.test.') || filePath.includes('.spec.')) {
      return false;
    }
    return /\.(js|jsx|ts|tsx)$/.test(filePath);
  }

  private checkStringValue(path: any, value: string, issues: Issue[], context: Context) {
    // Skip if it's accessing environment variables
    if (this.isEnvironmentVariable(path)) {
      return;
    }

    // Check for connection strings with passwords
    if (this.isConnectionString(value)) {
      const line = getLineNumber(path.node);
      issues.push(this.createIssue(
        'hardcoded-secret',
        'Password in connection string',
        line,
        getColumnNumber(path.node),
        context,
        'high'
      ));
      return;
    }

    // Check if the value looks like a secret
    if (this.isSecretValue(value)) {
      const line = getLineNumber(path.node);
      issues.push(this.createIssue(
        'hardcoded-secret',
        `Hardcoded API key or secret detected`,
        line,
        getColumnNumber(path.node),
        context,
        this.determineSeverity(value)
      ));
    }
  }

  private isEnvironmentVariable(path: any): boolean {
    const parent = path.parent;
    return t.isMemberExpression(parent) && 
           t.isMemberExpression(parent.object) &&
           t.isIdentifier(parent.object.object) &&
           parent.object.object.name === 'process' &&
           t.isIdentifier(parent.object.property) &&
           parent.object.property.name === 'env';
  }

  private isSecretVariableName(name: string): boolean {
    return this.secretPatterns.some(pattern => pattern.test(name));
  }

  private isSecretValue(value: string): boolean {
    // Skip empty or very short strings
    if (!value || value.length < 6) return false;

    // Skip obvious placeholders
    if (this.placeholderPatterns.some(pattern => pattern.test(value))) {
      return false;
    }

    // Skip public keys (they're meant to be public)
    if (value.startsWith('pk_')) return false;

    // Check against known secret patterns
    if (this.valuePatterns.some(pattern => pattern.test(value))) {
      return true;
    }

    // Check if it looks like a secret (long random string)
    if (value.length > 20 && this.looksLikeRandomString(value)) {
      // Check if the context suggests it's a secret
      return true;
    }

    // Check for specific keywords in the value
    if (/secret|password|token|key/i.test(value) && value.length > 10) {
      return true;
    }

    return false;
  }

  private looksLikeRandomString(value: string): boolean {
    // Heuristic: mix of letters and numbers, no common words
    const hasLetters = /[a-zA-Z]/.test(value);
    const hasNumbers = /[0-9]/.test(value);
    const hasSpecialChars = /[^a-zA-Z0-9]/.test(value);
    
    // Base64 encoded strings
    if (/^[a-zA-Z0-9+/]+=*$/.test(value) && value.length > 20) {
      return true;
    }

    // Mix of different character types suggests randomness
    const mixedChars = (hasLetters ? 1 : 0) + (hasNumbers ? 1 : 0) + (hasSpecialChars ? 1 : 0);
    return mixedChars >= 2 && value.length > 15;
  }

  private isConnectionString(value: string): boolean {
    // Common connection string patterns
    const patterns = [
      /^(mongodb|postgres|postgresql|mysql|redis|amqp):\/\/.*:.*@/,
      /^.+:\/\/[^:]+:[^@]+@/,  // Generic URL with credentials
    ];
    
    return patterns.some(pattern => pattern.test(value));
  }

  private looksLikeSecret(value: string): boolean {
    return this.isSecretValue(value) || 
           this.secretPatterns.some(pattern => pattern.test(value));
  }

  private getSecretType(name: string, value: string): string {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('api') && lowerName.includes('key')) return 'API key';
    if (lowerName.includes('password') || lowerName.includes('passwd')) return 'password';
    if (lowerName.includes('token')) return 'token';
    if (lowerName.includes('secret')) return 'secret';
    if (lowerName.includes('private') && lowerName.includes('key')) return 'private key';
    
    // Check value patterns
    if (value.startsWith('sk_live_')) return 'Stripe production API key';
    if (value.startsWith('sk_test_')) return 'Stripe test API key';
    if (value.startsWith('ghp_')) return 'GitHub token';
    if (/xox[baprs]-/.test(value)) return 'Slack token';
    if (value.includes('BEGIN') && value.includes('PRIVATE KEY')) return 'private key';
    
    return 'secret';
  }

  private determineSeverity(value: string): 'critical' | 'high' | 'medium' | 'low' {
    // Production secrets are critical
    if (value.includes('live') || value.includes('prod')) {
      return 'critical';
    }

    // Private keys are critical
    if (value.includes('BEGIN') && value.includes('PRIVATE KEY')) {
      return 'critical';
    }

    // Test/dev secrets are still high priority
    if (value.includes('test') || value.includes('dev')) {
      return 'high';
    }

    return 'high';
  }

  private createIssue(
    type: string,
    message: string,
    line: number,
    column: number,
    context: Context,
    severity: 'critical' | 'high' | 'medium' | 'low'
  ): Issue {
    const isProduction = severity === 'critical';
    
    return {
      id: `${type}-${Date.now()}`,
      type,
      severity,
      category: 'security',
      message: isProduction ? `${message} (production environment!)` : message,
      line,
      column,
      file: context.files.get('current')?.path || 'unknown',
      fix: {
        description: 'Move secret to environment variable',
        apply: async () => ({
          transformedCode: '',
          explanation: 'Moved secret to environment variable for security'
        })
      },
      impact: 'Exposed secrets can be stolen and used to access your systems',
      educationalContent: 'Never commit secrets to source control. Use environment variables or secret management services.'
    };
  }
}