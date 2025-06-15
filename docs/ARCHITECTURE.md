# ProdReady Architecture

## Overview

ProdReady uses a modular, plugin-based architecture designed for extensibility, performance, and developer experience. The system is built around a core engine with language-specific adapters and pluggable detectors/fixers.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Interface                         │
│  (Commander.js, Inquirer.js, Chalk, Ora, Blessed)          │
├─────────────────────────────────────────────────────────────┤
│                         Core Engine                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Analyzer   │  │ Transformer  │  │    Reporter     │   │
│  │   Engine    │  │    Engine    │  │     Engine      │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                      Plugin System                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Detectors  │  │    Fixers    │  │   Formatters    │   │
│  │  (100+)     │  │   (100+)     │  │  (Term/HTML)    │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Language Adapters                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Node.js │  │  Python  │  │    Go    │  │   Ruby   │  │
│  │  (TS/JS) │  │          │  │          │  │          │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
├─────────────────────────────────────────────────────────────┤
│                     AST Processors                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Babel   │  │   AST    │  │  go/ast  │  │  Parser  │  │
│  │          │  │          │  │          │  │          │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. CLI Interface Layer

Provides a beautiful, interactive command-line experience:

```typescript
interface CLICommand {
  name: string;
  description: string;
  options: CommandOption[];
  action: (options: any) => Promise<void>;
}

class CLI {
  commands: Map<string, CLICommand>;
  ui: UIRenderer;
  
  async run(args: string[]): Promise<void> {
    const command = this.parseCommand(args);
    await this.executeCommand(command);
  }
}
```

### 2. Core Engine

#### Analyzer Engine

Orchestrates the analysis process:

```typescript
class AnalyzerEngine {
  private languageAdapters: Map<string, ILanguageAdapter>;
  private detectorRegistry: DetectorRegistry;
  private contextAnalyzer: ContextAnalyzer;
  private cache: AnalysisCache;
  
  async analyzeProject(path: string, options: AnalyzeOptions): Promise<ProjectAnalysis> {
    const files = await this.findFiles(path, options);
    const analyses = await this.parallelAnalyze(files);
    const projectContext = await this.buildProjectContext(analyses);
    
    return {
      files: analyses,
      score: this.calculateScore(analyses),
      summary: this.generateSummary(analyses),
      context: projectContext
    };
  }
  
  private async parallelAnalyze(files: string[]): Promise<FileAnalysis[]> {
    const workers = this.createWorkerPool();
    return await Promise.all(
      files.map(file => workers.analyze(file))
    );
  }
}
```

#### Transformer Engine

Applies fixes to code:

```typescript
class TransformerEngine {
  private fixerRegistry: FixerRegistry;
  private validator: TransformValidator;
  
  async transform(
    analysis: FileAnalysis,
    options: TransformOptions
  ): Promise<TransformResult> {
    const applicableFixes = this.selectFixes(analysis.issues, options);
    const orderedFixes = this.orderFixes(applicableFixes);
    
    let code = analysis.content;
    const applied: AppliedFix[] = [];
    
    for (const fix of orderedFixes) {
      const result = await this.applyFix(code, fix);
      if (await this.validator.validate(result)) {
        code = result.code;
        applied.push(result.metadata);
      }
    }
    
    return { code, applied, diff: this.generateDiff(analysis.content, code) };
  }
}
```

#### Reporter Engine

Generates various output formats:

```typescript
class ReporterEngine {
  private formatters: Map<string, IFormatter>;
  
  async generate(
    analysis: ProjectAnalysis,
    format: ReportFormat,
    options: ReportOptions
  ): Promise<Report> {
    const formatter = this.formatters.get(format);
    return await formatter.format(analysis, options);
  }
}
```

### 3. Plugin System

#### Detector Interface

```typescript
interface IDetector {
  id: string;
  name: string;
  category: DetectorCategory;
  severity: Severity;
  languages: string[];
  
  detect(ast: AST, context: FileContext): Promise<Issue[]>;
  
  // Metadata for education
  description: string;
  rationale: string;
  examples: {
    vulnerable: string;
    secure: string;
  };
  references: string[];
}
```

#### Fixer Interface

```typescript
interface IFixer {
  id: string;
  name: string;
  detectorsHandled: string[];
  
  canFix(issue: Issue): boolean;
  
  generateFix(
    issue: Issue,
    ast: AST,
    context: FileContext
  ): Promise<Fix>;
  
  // Educational content
  explanation: string;
  caveats?: string[];
}
```

### 4. Language Adapters

```typescript
interface ILanguageAdapter {
  language: string;
  extensions: string[];
  frameworks: string[];
  
  // Parsing
  canParse(file: string): boolean;
  parse(content: string): Promise<AST>;
  
  // AST operations
  traverse(ast: AST, visitors: Visitors): void;
  findNodes(ast: AST, predicate: NodePredicate): Node[];
  
  // Code generation
  generate(ast: AST): string;
  
  // Language-specific
  getDetectors(): IDetector[];
  getFixers(): IFixer[];
  getFrameworkPatterns(): FrameworkPattern[];
}
```

## Data Flow

```
1. User runs: prodready scan ./project

2. File Discovery
   └─> Find all source files
   └─> Filter by .prodreadyignore
   └─> Group by language

3. Parallel Analysis (per file)
   └─> Parse to AST
   └─> Run detectors
   └─> Analyze context
   └─> Calculate file score

4. Project Analysis
   └─> Aggregate issues
   └─> Detect patterns
   └─> Build dependency graph
   └─> Calculate project score

5. Transformation (if requested)
   └─> Order fixes by dependency
   └─> Apply fixes sequentially
   └─> Validate each transformation
   └─> Generate diffs

6. Reporting
   └─> Format results
   └─> Generate visualizations
   └─> Create audit trail
   └─> Output to chosen format
```

## Performance Architecture

### Parallel Processing

```typescript
class WorkerPool {
  private workers: Worker[];
  private queue: TaskQueue;
  
  constructor(size: number = os.cpus().length) {
    this.workers = Array(size).fill(null).map(() => 
      new Worker('./analyzer-worker.js')
    );
  }
  
  async analyze(file: string): Promise<FileAnalysis> {
    const worker = await this.getAvailableWorker();
    return await worker.analyze(file);
  }
}
```

### Caching Strategy

```typescript
class AnalysisCache {
  private fileCache: LRUCache<string, FileAnalysis>;
  private astCache: LRUCache<string, AST>;
  
  async getOrAnalyze(
    file: string,
    analyzer: () => Promise<FileAnalysis>
  ): Promise<FileAnalysis> {
    const hash = await this.hashFile(file);
    
    if (this.fileCache.has(hash)) {
      return this.fileCache.get(hash);
    }
    
    const analysis = await analyzer();
    this.fileCache.set(hash, analysis);
    return analysis;
  }
}
```

### Incremental Analysis

```typescript
class IncrementalAnalyzer {
  private baseline: Map<string, FileAnalysis>;
  
  async analyzeChanges(
    projectPath: string,
    since: Date
  ): Promise<IncrementalResult> {
    const changed = await this.git.getChangedFiles(since);
    const analyses = await this.analyzeFiles(changed);
    
    return {
      changed: analyses,
      unchanged: this.baseline.filter(f => !changed.includes(f)),
      summary: this.compareToBaseline(analyses)
    };
  }
}
```

## Storage

### Configuration

```typescript
interface ProdReadyConfig {
  // Project config (.prodreadyrc)
  extends?: string;
  rules?: RuleConfig;
  ignore?: string[];
  severity?: SeverityOverrides;
  
  // User config (~/.prodready/config)
  telemetry?: boolean;
  theme?: 'dark' | 'light';
  editor?: string;
  
  // Team config (.prodready/team.json)
  standards?: TeamStandards;
  customRules?: CustomRule[];
  integrations?: IntegrationConfig;
}
```

### State Management

```typescript
class StateManager {
  private projectState: ProjectState;
  private userState: UserState;
  
  async saveBaseline(analysis: ProjectAnalysis): Promise<void> {
    await this.db.put('baseline', {
      timestamp: Date.now(),
      analysis: analysis,
      version: VERSION
    });
  }
  
  async getHistory(): Promise<AnalysisHistory> {
    return await this.db.getAll('analyses');
  }
}
```

## Extension Points

### Custom Detectors

```typescript
// In .prodready/detectors/custom-api-versioning.js
module.exports = {
  id: 'custom-api-versioning',
  category: 'operational',
  
  detect(ast, context) {
    const issues = [];
    
    // Find all route definitions
    const routes = findRoutes(ast);
    
    routes.forEach(route => {
      if (!route.path.includes('/v1/') && !route.path.includes('/v2/')) {
        issues.push({
          type: 'missing-api-version',
          line: route.line,
          message: 'API endpoint missing version in path'
        });
      }
    });
    
    return issues;
  }
};
```

### Framework Adapters

```typescript
// Framework-specific patterns
class ExpressAdapter implements IFrameworkAdapter {
  detectPatterns(ast: AST): FrameworkPattern[] {
    return [
      this.findMiddleware(ast),
      this.findRoutes(ast),
      this.findErrorHandlers(ast)
    ];
  }
  
  enhanceContext(context: FileContext): void {
    context.framework = 'express';
    context.middleware = this.extractMiddleware(context.ast);
    context.routes = this.extractRoutes(context.ast);
  }
}
```

## Security & Privacy

### Code Security

- Never execute user code
- All analysis done via AST
- Sandboxed worker processes
- No network calls during analysis

### Privacy

- Local analysis by default
- Opt-in telemetry
- No code leaves machine without permission
- Encrypted storage for sensitive configs

## Future Architecture

### Cloud Analysis Service (Optional)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   CLI Client │────▶│  API Gateway │────▶│   Analysis   │
└──────────────┘     └──────────────┘     │   Workers    │
                                           └──────────────┘
                                                  │
                                           ┌──────────────┐
                                           │   Results    │
                                           │    Cache     │
                                           └──────────────┘
```

### IDE Integration

```typescript
// Language Server Protocol implementation
class ProdReadyLanguageServer {
  async onDidOpenTextDocument(params: DidOpenTextDocumentParams) {
    const analysis = await this.analyzer.analyzeFile(params.textDocument.uri);
    this.publishDiagnostics(analysis.issues);
  }
  
  async onCodeAction(params: CodeActionParams): Promise<CodeAction[]> {
    const fixes = await this.fixer.getAvailableFixes(params.range);
    return fixes.map(fix => this.fixToCodeAction(fix));
  }
}
```

This architecture provides a solid foundation for building ProdReady while maintaining flexibility for future enhancements.