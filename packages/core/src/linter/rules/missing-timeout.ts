import type { LintRule, LintIssue, LintPlatform } from '../base.js';

/**
 * Flags jobs that have no timeout configured.
 *
 * Without a timeout, a hung job (waiting for user input, a stalled service,
 * or an infinite loop in tests) consumes CI minutes indefinitely. GitHub
 * Actions defaults to 6 hours; GitLab CI defaults to 1 hour — both are
 * far too long for typical CI jobs. Explicit short timeouts catch problems
 * faster and protect shared CI resources.
 */
export const missingTimeoutRule: LintRule = {
  id: 'missing-timeout',
  description: 'All CI jobs should declare an explicit timeout.',
  platforms: ['github-actions', 'gitlab-ci'],

  check(doc: unknown, platform: LintPlatform): LintIssue[] {
    if (typeof doc !== 'object' || doc === null) return [];
    const issues: LintIssue[] = [];

    if (platform === 'github-actions') {
      return checkGitHubActions(doc as Record<string, unknown>);
    }
    return checkGitLabCI(doc as Record<string, unknown>);
  },
};

function checkGitHubActions(doc: Record<string, unknown>): LintIssue[] {
  const issues: LintIssue[] = [];
  const jobs = doc['jobs'];
  if (!isObject(jobs)) return issues;

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!isObject(job)) continue;
    if (!('timeout-minutes' in job)) {
      issues.push({
        rule: 'missing-timeout',
        severity: 'warning',
        message: `Job "${jobName}" has no timeout-minutes. Without one, hung jobs consume CI minutes for up to 6 hours.`,
        location: { job: jobName },
        suggestion: 'Add `timeout-minutes: 15` (or an appropriate value for your job).',
      });
    }
  }

  return issues;
}

const RESERVED_GL_KEYS = new Set([
  'stages',
  'include',
  'variables',
  'default',
  'workflow',
  'image',
  'services',
  'before_script',
  'after_script',
  'cache',
  'pages',
]);

function checkGitLabCI(doc: Record<string, unknown>): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const [key, job] of Object.entries(doc)) {
    if (RESERVED_GL_KEYS.has(key)) continue;
    if (!isObject(job)) continue;
    if (!('script' in job)) continue; // not a job definition

    if (!('timeout' in job)) {
      issues.push({
        rule: 'missing-timeout',
        severity: 'warning',
        message: `Job "${key}" has no timeout. Without one, hung jobs can run for up to 1 hour.`,
        location: { job: key },
        suggestion: 'Add `timeout: 15 minutes` (or an appropriate value for your job).',
      });
    }
  }

  return issues;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
