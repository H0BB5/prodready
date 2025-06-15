import { AnalysisResult } from '../types';

export class ReportGenerator {
  async generate(analysisResult: AnalysisResult, format: string): Promise<string> {
    switch (format) {
      case 'json':
        return this.generateJSON(analysisResult);
      case 'html':
        return this.generateHTML(analysisResult);
      default:
        return this.generateHTML(analysisResult);
    }
  }

  private generateJSON(analysisResult: AnalysisResult): string {
    return JSON.stringify({
      summary: {
        score: analysisResult.score,
        totalIssues: analysisResult.totalIssues,
        byCategory: analysisResult.byCategory,
        bySeverity: analysisResult.bySeverity
      },
      issues: analysisResult.issues.map(issue => ({
        type: issue.type,
        severity: issue.severity,
        category: issue.category,
        message: issue.message,
        file: issue.file,
        line: issue.line,
        impact: issue.impact
      })),
      files: analysisResult.files
    }, null, 2);
  }

  private generateHTML(analysisResult: AnalysisResult): string {
    const scoreColor = analysisResult.score >= 80 ? '#28a745' : 
                      analysisResult.score >= 50 ? '#ffc107' : 
                      '#dc3545';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ProdReady Report - Score: ${analysisResult.score}/100</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 0;
      text-align: center;
      border-radius: 10px;
      margin-bottom: 30px;
    }
    
    h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    
    .score-container {
      background: white;
      border-radius: 10px;
      padding: 30px;
      margin-bottom: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      text-align: center;
    }
    
    .score {
      font-size: 72px;
      font-weight: bold;
      color: ${scoreColor};
      margin: 20px 0;
    }
    
    .score-bar {
      width: 100%;
      height: 30px;
      background: #e0e0e0;
      border-radius: 15px;
      overflow: hidden;
      margin: 20px 0;
    }
    
    .score-fill {
      height: 100%;
      background: ${scoreColor};
      width: ${analysisResult.score}%;
      transition: width 2s ease-out;
    }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    .stat-card h3 {
      color: #667eea;
      margin-bottom: 15px;
    }
    
    .issues-section {
      background: white;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    .issue {
      border-left: 4px solid;
      padding: 15px;
      margin-bottom: 15px;
      background: #f8f9fa;
      border-radius: 0 5px 5px 0;
    }
    
    .issue.critical {
      border-color: #dc3545;
    }
    
    .issue.high {
      border-color: #fd7e14;
    }
    
    .issue.medium {
      border-color: #ffc107;
    }
    
    .issue.low {
      border-color: #0dcaf0;
    }
    
    .severity {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 3px;
      font-size: 0.85em;
      font-weight: bold;
      color: white;
      margin-right: 10px;
    }
    
    .severity.critical {
      background: #dc3545;
    }
    
    .severity.high {
      background: #fd7e14;
    }
    
    .severity.medium {
      background: #ffc107;
      color: #333;
    }
    
    .severity.low {
      background: #0dcaf0;
    }
    
    .file-path {
      color: #666;
      font-size: 0.9em;
      margin-top: 5px;
    }
    
    footer {
      text-align: center;
      padding: 30px 0;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🚀 ProdReady Production Readiness Report</h1>
      <p>Generated on ${new Date().toLocaleString()}</p>
    </header>
    
    <div class="score-container">
      <h2>Overall Score</h2>
      <div class="score">${analysisResult.score}/100</div>
      <div class="score-bar">
        <div class="score-fill"></div>
      </div>
      <p>${this.getScoreMessage(analysisResult.score)}</p>
    </div>
    
    <div class="stats">
      <div class="stat-card">
        <h3>Total Issues</h3>
        <p style="font-size: 2em; font-weight: bold;">${analysisResult.totalIssues}</p>
      </div>
      
      <div class="stat-card">
        <h3>By Severity</h3>
        ${Object.entries(analysisResult.bySeverity)
          .map(([severity, count]) => `
            <p><span class="severity ${severity}">${severity.toUpperCase()}</span> ${count}</p>
          `).join('')}
      </div>
      
      <div class="stat-card">
        <h3>By Category</h3>
        ${Object.entries(analysisResult.byCategory)
          .map(([category, count]) => `
            <p><strong>${category}:</strong> ${count}</p>
          `).join('')}
      </div>
      
      <div class="stat-card">
        <h3>Files Analyzed</h3>
        <p style="font-size: 2em; font-weight: bold;">${analysisResult.files.length}</p>
      </div>
    </div>
    
    <div class="issues-section">
      <h2>Issues Found</h2>
      ${analysisResult.issues.length === 0 ? 
        '<p style="text-align: center; padding: 40px; color: #28a745; font-size: 1.2em;">🎉 No issues found! Your code is production-ready.</p>' :
        analysisResult.issues.map(issue => `
          <div class="issue ${issue.severity}">
            <span class="severity ${issue.severity}">${issue.severity.toUpperCase()}</span>
            <strong>${issue.type}</strong>
            <p>${issue.message}</p>
            <p class="file-path">📁 ${issue.file}:${issue.line || '?'}</p>
            ${issue.impact ? `<p><strong>Impact:</strong> ${issue.impact}</p>` : ''}
          </div>
        `).join('')}
    </div>
    
    <footer>
      <p>Generated by ProdReady • Making AI-generated code production-ready</p>
    </footer>
  </div>
  
  <script>
    // Animate score fill on load
    window.addEventListener('load', () => {
      const fill = document.querySelector('.score-fill');
      setTimeout(() => {
        fill.style.width = '${analysisResult.score}%';
      }, 100);
    });
  </script>
</body>
</html>
    `;
  }

  private getScoreMessage(score: number): string {
    if (score >= 90) return "🎉 Excellent! Your code is highly production-ready.";
    if (score >= 80) return "👍 Good! Your code is mostly production-ready with minor issues.";
    if (score >= 70) return "⚠️ Fair. Your code needs some work to be production-ready.";
    if (score >= 50) return "⚠️ Needs improvement. Several important issues to address.";
    return "🚨 Critical issues found. Significant work needed for production readiness.";
  }
}