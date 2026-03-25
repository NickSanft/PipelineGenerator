import type { LintRule, LintIssue, LintPlatform } from '../base.js';

/**
 * Flags GitHub Actions workflows that do not declare explicit `permissions:`.
 *
 * When no permissions block is present, every job receives the repository's
 * default permissions — often `write-all`, which gives malicious or
 * compromised third-party actions the ability to push code, create releases,
 * or modify branch protection. Declaring `permissions: read-all` at the
 * workflow level and granting `write` only where needed follows the principle
 * of least privilege.
 *
 * GitHub docs: https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions
 */
export const missingPermissionsRule: LintRule = {
  id: 'missing-permissions',
  description: 'GitHub Actions workflows should declare explicit permissions (prefer read-all).',
  platforms: ['github-actions'],

  check(doc: unknown, _platform: LintPlatform): LintIssue[] {
    if (!isObject(doc)) return [];
    const issues: LintIssue[] = [];

    // Workflow-level permissions
    const hasWorkflowPermissions = 'permissions' in doc;

    // Job-level — if ALL jobs have permissions declared, the lack of a top-level block is fine
    const jobs = doc['jobs'];
    const jobEntries = isObject(jobs) ? Object.entries(jobs) : [];
    const allJobsHavePermissions =
      jobEntries.length > 0 &&
      jobEntries.every(([, job]) => isObject(job) && 'permissions' in job);

    if (!hasWorkflowPermissions && !allJobsHavePermissions) {
      issues.push({
        rule: 'missing-permissions',
        severity: 'error',
        message:
          'Workflow has no permissions block. Without it, jobs may inherit write-all access.',
        suggestion:
          'Add `permissions: read-all` at the workflow level, then grant write access per-job only where needed.',
      });
    }

    // Also flag any job that explicitly uses write-all
    for (const [jobName, job] of jobEntries) {
      if (!isObject(job)) continue;
      const perms = job['permissions'];
      if (perms === 'write-all') {
        issues.push({
          rule: 'missing-permissions',
          severity: 'warning',
          message: `Job "${jobName}" uses permissions: write-all. Grant only the specific permissions this job requires.`,
          location: { job: jobName },
          suggestion: 'Replace write-all with a map of specific permissions, e.g. contents: read.',
        });
      }
    }

    return issues;
  },
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
