import type { LintRule, LintIssue, LintPlatform } from '../base.js';

/**
 * Flags run steps that may print secrets to the log.
 *
 * GitHub Actions masks known secrets in logs via string substitution, but
 * there are well-known bypass patterns:
 *
 * 1. `echo ${{ secrets.FOO }}` — the literal value is interpolated into the
 *    shell command BEFORE log masking runs; if the mask string is short or
 *    the secret contains special chars the mask may not apply cleanly.
 * 2. `set +x` followed by secret usage — disables xtrace but the intent is
 *    suspicious enough to warn about.
 * 3. Passing secrets via positional args to scripts — args are visible in
 *    `ps` output and some log drivers capture the full argv.
 *
 * The safest pattern is to pass secrets via environment variables and read
 * them in the script, never interpolating them into the command string.
 */
export const secretLeakRule: LintRule = {
  id: 'secret-leak',
  description: 'Run steps should not echo or interpolate secrets directly into shell commands.',
  platforms: ['github-actions'],

  check(doc: unknown, _platform: LintPlatform): LintIssue[] {
    if (!isObject(doc)) return [];
    const issues: LintIssue[] = [];

    const jobs = doc['jobs'];
    if (!isObject(jobs)) return issues;

    for (const [jobName, job] of Object.entries(jobs)) {
      if (!isObject(job)) continue;
      const steps = job['steps'];
      if (!Array.isArray(steps)) continue;

      for (const step of steps) {
        if (!isObject(step)) continue;
        const run = step['run'];
        if (typeof run !== 'string') continue;
        const stepName = String(step['name'] ?? '(unnamed step)');

        // Pattern 1: secret expression directly in a run string
        if (/\$\{\{\s*secrets\.\w+\s*\}\}/.test(run)) {
          issues.push({
            rule: 'secret-leak',
            severity: 'error',
            message: `Step "${stepName}" in job "${jobName}" interpolates a secret expression directly into the run command. The raw secret value may appear in logs.`,
            location: { job: jobName, step: stepName },
            suggestion:
              'Move the secret to the step\'s `env:` block (e.g. `MY_TOKEN: ${{ secrets.MY_TOKEN }}`) and reference `$MY_TOKEN` in the script instead.',
          });
        }

        // Pattern 2: set +x (disables command echoing — often used to hide secrets, but also hides bugs)
        if (/\bset\s+\+x\b/.test(run)) {
          issues.push({
            rule: 'secret-leak',
            severity: 'info',
            message: `Step "${stepName}" in job "${jobName}" uses \`set +x\`. This disables xtrace which can obscure debugging and is sometimes a sign that secrets are being handled unsafely.`,
            location: { job: jobName, step: stepName },
            suggestion:
              'Ensure secrets are passed via environment variables, not shell arguments or echo commands.',
          });
        }
      }
    }

    return issues;
  },
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
