export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintLocation {
  /** Top-level job or stage name */
  job?: string;
  /** Step name or index */
  step?: string;
}

export interface LintIssue {
  rule: string;
  severity: LintSeverity;
  message: string;
  location?: LintLocation;
  /** Human-readable suggestion for fixing the issue */
  suggestion?: string;
}

export interface LintResult {
  platform: 'github-actions' | 'gitlab-ci';
  issues: LintIssue[];
  summary: { errors: number; warnings: number; infos: number };
}

export type LintPlatform = 'github-actions' | 'gitlab-ci';

export interface LintRule {
  id: string;
  description: string;
  platforms: LintPlatform[];
  /** Return any issues found in the parsed YAML document. */
  check(doc: unknown, platform: LintPlatform): LintIssue[];
}

export function buildSummary(issues: LintIssue[]): LintResult['summary'] {
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };
}
