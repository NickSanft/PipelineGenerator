import type { LintRule, LintIssue, LintPlatform } from '../base.js';

/**
 * Flags dependency install commands that do not use a lockfile-aware flag.
 *
 * `npm install` resolves the latest compatible versions and mutates
 * `package-lock.json`, meaning two CI runs on the same commit can install
 * different dependency trees. `npm ci` reads the lockfile exactly — it
 * fails if the lockfile is out of sync and never mutates it.
 *
 * The same principle applies to other managers:
 * - `pip install` → `pip install -r requirements.txt` (acceptable) or
 *   `pip-sync` (preferred with pip-tools)
 * - `yarn install` → `yarn install --frozen-lockfile`
 * - `pnpm install` → `pnpm install --frozen-lockfile`
 */
export const unsafeInstallRule: LintRule = {
  id: 'unsafe-install',
  description: 'Dependency installs should use lockfile-frozen flags for reproducibility.',
  platforms: ['github-actions', 'gitlab-ci'],

  check(doc: unknown, platform: LintPlatform): LintIssue[] {
    if (!isObject(doc)) return [];

    const allSteps = platform === 'github-actions'
      ? extractGARunCommands(doc)
      : extractGLRunCommands(doc);

    const issues: LintIssue[] = [];

    for (const { job, step, run } of allSteps) {
      // npm install (but not npm install <pkg> or npm ci)
      if (/\bnpm install\b(?!\s+--save|\s+-[SDdPEOBO]|\s+\S)/.test(run)) {
        issues.push({
          rule: 'unsafe-install',
          severity: 'error',
          message: '`npm install` resolves latest versions and can mutate the lockfile. Use `npm ci` for reproducible installs.',
          location: { job, step },
          suggestion: 'Replace `npm install` with `npm ci`.',
        });
      }

      // yarn install without --frozen-lockfile
      if (/\byarn install\b/.test(run) && !/--frozen-lockfile|--immutable/.test(run)) {
        issues.push({
          rule: 'unsafe-install',
          severity: 'warning',
          message: '`yarn install` without `--frozen-lockfile` may install unexpected versions.',
          location: { job, step },
          suggestion: 'Use `yarn install --frozen-lockfile` (Yarn 1) or `yarn install --immutable` (Yarn 2+).',
        });
      }

      // pnpm install without --frozen-lockfile
      if (/\bpnpm install\b/.test(run) && !/--frozen-lockfile/.test(run)) {
        issues.push({
          rule: 'unsafe-install',
          severity: 'warning',
          message: '`pnpm install` without `--frozen-lockfile` may install unexpected versions.',
          location: { job, step },
          suggestion: 'Use `pnpm install --frozen-lockfile`.',
        });
      }
    }

    return issues;
  },
};

interface RunStep { job: string; step: string; run: string }

function extractGARunCommands(doc: Record<string, unknown>): RunStep[] {
  const results: RunStep[] = [];
  const jobs = doc['jobs'];
  if (!isObject(jobs)) return results;

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!isObject(job)) continue;
    const steps = job['steps'];
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      if (!isObject(step)) continue;
      const run = step['run'];
      if (typeof run === 'string') {
        results.push({ job: jobName, step: String(step['name'] ?? ''), run });
      }
    }
  }
  return results;
}

const GL_RESERVED = new Set([
  'stages', 'include', 'variables', 'default', 'workflow', 'image',
  'services', 'before_script', 'after_script', 'cache', 'pages',
]);

function extractGLRunCommands(doc: Record<string, unknown>): RunStep[] {
  const results: RunStep[] = [];
  for (const [key, job] of Object.entries(doc)) {
    if (GL_RESERVED.has(key) || !isObject(job)) continue;
    const script = job['script'];
    const commands = Array.isArray(script) ? script : [script];
    const combined = commands.map(String).join('\n');
    if (combined.trim()) {
      results.push({ job: key, step: 'script', run: combined });
    }
  }
  return results;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
