# ProdReady Architecture

## Overview

ProdReady uses a modular, plugin-based architecture designed for extensibility, maintainability, and performance. This document outlines the core architecture decisions and patterns.

## Design Principles

1. **Modularity**: Each analyzer and transformer is self-contained
2. **Extensibility**: Easy to add new languages, checks, and fixes
3. **Safety**: Never break working code
4. **Performance**: Handle large codebases efficiently
5. **Education**: Every interaction teaches best practices

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Interface                          │
│  (Beautiful terminal UI, progress tracking, interactive)    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                     Core Engine                             │
│  (Orchestration, scoring, conflict resolution)              │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┬─────────────────┐
        │                 │                 │                 │
┌───────┴───────┐ ┌───────┴───────┐ ┌─────┴───────┐ ┌────────┴────────┐
│   Language    │ │   Analyzer    │ │ Transformer │ │    Reporter     │
│   Adapters    │ │   Registry    │ │   Engine    │ │    System       │
└───────────────┘ └───────────────┘ └─────────────┘ └─────────────────┘
        │                 │                 │                 │
┌───────┴───────┐ ┌───────┴───────┐ ┌─────┴───────┐ ┌────────┴────────┐
│  JavaScript   │ │   Security    │ │    Fixes    │ │      HTML       │
│   Python      │ │  Reliability  │ │  Templates  │ │      JSON       │
│     Go        │ │ Performance   │ │  Strategies │ │      PDF        │
└───────────────┘ └───────────────┘ └─────────────┘ └─────────────────┘
```

## Core Components

### 1. CLI Interface (`/src/cli`)

The CLI provides a beautiful, interactive experience:

```typescript
interface CLIOptions {
  interactive: boolean;  // Interactive fix selection
  preview: boolean;      // Show diff before applying
  format: OutputFormat;  // json, pretty, quiet
  fix: boolean;         // Auto-fix issues
  categories: string[]; // Filter by category
}
```

Key features:
- Real-time progress with spinners
- Beautiful diff visualization
- Interactive fix selection
- Undo capability
- Score animation

### 2. Core Engine (`/src/core`)

The engine orchestrates the analysis and transformation pipeline:

```typescript
class ProdReadyEngine {
  async analyze(projectPath: string): Promise<AnalysisResult> {
    // 1. Discover files
    const files = await this.discoverFiles(projectPath);
    
    // 2. Parse files into AST
    const asts = await this.parseFiles(files);
    
    // 3. Build project context
    const context = await this.buildContext(asts, projectPath);
    
    // 4. Run analyzers
    const issues = await this.runAnalyzers(asts, context);
    
    // 5. Calculate score
    const score = this.calculateScore(issues);
    
    return { files, issues, score, context };
  }
  
  async fix(analysisResult: AnalysisResult): Promise<FixResult> {
    // 1. Order fixes by priority and compatibility
    const orderedFixes = this.orderFixes(analysisResult.issues);
    
    // 2. Apply fixes with conflict resolution
    const results = await this.applyFixes(orderedFixes);
    
    // 3. Validate fixed code
    await this.validateFixes(results);
    
    return results;
  }
}
```

### 3. Language Adapters (`/src/languages`)

Each language has an adapter that provides parsing and code generation:

```typescript
interface ILanguageAdapter {
  name: string;
  extensions: string[];
  
  // Parse code into AST
  parse(code: string, options?: ParseOptions): Promise<AST>;
  
  // Generate code from AST
  generate(ast: AST, options?: GenerateOptions): string;
  
  // Traverse AST with visitors
  traverse(ast: AST, visitors: Visitors): void;
  
  // Language-specific analyzers
  getAnalyzers(): IAnalyzer[];
  
  // Language-specific transformers
  getTransformers(): ITransformer[];
}
```

### 4. Analyzer System (`/src/analyzers`)

Analyzers detect issues in code:

```typescript
interface IAnalyzer {
  id: string;
  name: string;
  category: AnalyzerCategory;
  severity: Severity;
  
  // Detect issues in AST
  analyze(ast: AST, context: Context): Promise<Issue[]>;
  
  // Check if analyzer applies to file
  shouldRun(filePath: string, context: Context): boolean;
  
  // Get education content
  getEducation(): Education;
}

interface Issue {
  analyzerId: string;
  severity: Severity;
  category: Category;
  location: Location;
  message: string;
  impact: string;
  fix?: IFix;
  education?: Education;
}
```

### 5. Transformer System (`/src/transformers`)

Transformers apply fixes to code:

```typescript
interface ITransformer {
  id: string;
  analyzerId: string;
  
  // Check if fix can be applied
  canFix(issue: Issue, ast: AST): boolean;
  
  // Apply fix to AST
  fix(issue: Issue, ast: AST, context: Context): Promise<FixResult>;
  
  // Preview fix without applying
  preview(issue: Issue, ast: AST): Promise<DiffPreview>;
  
  // Get fix metadata
  getMetadata(): FixMetadata;
}
```

### 6. Context System (`/src/context`)

Context provides semantic understanding:

```typescript
class ContextBuilder {
  async build(asts: Map<string, AST>, projectPath: string): Promise<Context> {
    return {
      // Project-level context
      projectType: await this.detectProjectType(projectPath),
      dependencies: await this.analyzeDependencies(projectPath),
      framework: await this.detectFramework(asts),
      
      // File-level context
      files: await this.analyzeFiles(asts),
      
      // Semantic context
      routes: this.extractRoutes(asts),
      models: this.extractModels(asts),
      services: this.extractServices(asts),
      
      // Security context  
      authentication: this.detectAuthPatterns(asts),
      dataFlows: this.analyzeDataFlows(asts),
      
      // Performance context
      hotPaths: this.identifyHotPaths(asts),
      queryPatterns: this.analyzeQueries(asts)
    };
  }
}
```

## Plugin Architecture

### Plugin Interface

```typescript
interface IProdReadyPlugin {
  name: string;
  version: string;
  
  // Register components
  register(registry: PluginRegistry): void;
  
  // Lifecycle hooks
  onBeforeAnalysis?(context: Context): Promise<void>;
  onAfterAnalysis?(result: AnalysisResult): Promise<void>;
  onBeforeFix?(issues: Issue[]): Promise<void>;
  onAfterFix?(results: FixResult[]): Promise<void>;
}
```

### Creating a Plugin

```typescript
export class CustomSecurityPlugin implements IProdReadyPlugin {
  name = 'custom-security';
  version = '1.0.0';
  
  register(registry: PluginRegistry) {
    // Add custom analyzer
    registry.addAnalyzer(new CustomSQLAnalyzer());
    
    // Add custom transformer
    registry.addTransformer(new CustomSQLFixer());
    
    // Add custom reporter
    registry.addReporter(new SecurityReporter());
  }
}
```

## Performance Optimizations

### 1. Parallel Processing

```typescript
class ParallelAnalyzer {
  async analyzeFiles(files: string[]): Promise<Map<string, Issue[]>> {
    // Process files in parallel with concurrency limit
    const limit = pLimit(os.cpus().length);
    
    const results = await Promise.all(
      files.map(file => limit(() => this.analyzeFile(file)))
    );
    
    return new Map(results);
  }
}
```

### 2. Incremental Analysis

```typescript
class IncrementalAnalyzer {
  private cache: AnalysisCache;
  
  async analyze(projectPath: string): Promise<AnalysisResult> {
    // Get changed files since last run
    const changedFiles = await this.getChangedFiles(projectPath);
    
    // Analyze only changed files
    const newResults = await this.analyzeFiles(changedFiles);
    
    // Merge with cached results
    return this.mergeResults(this.cache.get(projectPath), newResults);
  }
}
```

### 3. AST Caching

```typescript
class ASTCache {
  private cache = new LRU<string, CachedAST>({ 
    max: 500,
    maxAge: 1000 * 60 * 5 // 5 minutes
  });
  
  async getAST(filePath: string): Promise<AST> {
    const hash = await this.hashFile(filePath);
    const cached = this.cache.get(hash);
    
    if (cached && cached.hash === hash) {
      return cached.ast;
    }
    
    const ast = await this.parseFile(filePath);
    this.cache.set(hash, { ast, hash });
    
    return ast;
  }
}
```

## Error Handling

### Graceful Degradation

```typescript
class ResilientAnalyzer {
  async analyze(ast: AST): Promise<Issue[]> {
    const issues: Issue[] = [];
    
    for (const analyzer of this.analyzers) {
      try {
        const analyzerIssues = await analyzer.analyze(ast);
        issues.push(...analyzerIssues);
      } catch (error) {
        // Log but don't fail entire analysis
        this.logger.error(`Analyzer ${analyzer.id} failed:`, error);
        
        // Add error as low-priority issue
        issues.push({
          analyzerId: 'system',
          severity: 'info',
          message: `Analyzer ${analyzer.id} encountered an error`,
          category: 'system'
        });
      }
    }
    
    return issues;
  }
}
```

### Recovery Mechanisms

```typescript
class SafeTransformer {
  async applyFix(code: string, fix: IFix): Promise<string> {
    // Create backup
    const backup = code;
    
    try {
      // Apply fix
      const fixed = await fix.apply(code);
      
      // Validate syntax
      await this.validateSyntax(fixed);
      
      return fixed;
    } catch (error) {
      // Rollback on error
      this.logger.error('Fix failed, rolling back:', error);
      return backup;
    }
  }
}
```

## Configuration

### Project Configuration

```yaml
# .prodready.yml
version: 1
language: javascript
framework: express

# Customize analyzers
analyzers:
  security:
    sql-injection:
      enabled: true
      severity: critical
  performance:
    n-plus-one:
      enabled: true
      threshold: 5

# Custom rules
rules:
  - id: company-auth
    pattern: 'route\((.*)\)'
    require: 'authenticate()'
    message: 'All routes must use company auth middleware'

# Ignore patterns
ignore:
  - '**/*.test.js'
  - 'build/**'
  - 'node_modules/**'

# Fix preferences
fixes:
  prefer-async: true
  error-handler: winston
  validation-library: joi
```

### Global Configuration

```typescript
// ~/.prodready/config.json
{
  "telemetry": false,
  "autoUpdate": true,
  "defaultFormat": "pretty",
  "education": true,
  "githubToken": "***",
  "plugins": [
    "@company/prodready-plugin"
  ]
}
```

## Security Considerations

### Code Execution Safety

- Never execute analyzed code
- Use static AST analysis only
- Sandbox file system access
- Validate all inputs

### Privacy

- Local analysis by default
- No code transmission without consent
- Configurable telemetry
- Audit logs for compliance

## Testing Infrastructure

### Analyzer Testing

```typescript
describe('SQLInjectionAnalyzer', () => {
  const analyzer = new SQLInjectionAnalyzer();
  
  it('detects string concatenation', async () => {
    const code = `db.query("SELECT * FROM users WHERE id = " + id)`;
    const ast = parse(code);
    const issues = await analyzer.analyze(ast);
    
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('critical');
  });
  
  it('ignores parameterized queries', async () => {
    const code = `db.query("SELECT * FROM users WHERE id = ?", [id])`;
    const ast = parse(code);
    const issues = await analyzer.analyze(ast);
    
    expect(issues).toHaveLength(0);
  });
});
```

### Transform Testing

```typescript
describe('ErrorHandlingTransformer', () => {
  const transformer = new ErrorHandlingTransformer();
  
  it('wraps async function in try-catch', async () => {
    const input = `async function getUser() { return await api.get(); }`;
    const expected = `async function getUser() { 
      try { 
        return await api.get(); 
      } catch (error) {
        logger.error('getUser failed:', error);
        throw error;
      }
    }`;
    
    const result = await transformer.fix(input);
    expect(normalize(result)).toBe(normalize(expected));
  });
});
```

## Future Considerations

### AI Integration

- ML models for pattern detection
- Natural language fix explanations
- Predictive issue detection
- Code quality forecasting

### Cloud Features

- Distributed analysis for large codebases
- Team dashboards
- Historical tracking
- CI/CD deep integration

### Ecosystem

- Package manager for plugins
- Community analyzer marketplace
- Integration with IDEs
- Educational platform