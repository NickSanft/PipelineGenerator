import type { LintRule, LintIssue, LintPlatform } from '../base.js';

/**
 * Flags CI jobs that run a known dependency install command (`npm ci`,
 * `pip install`, `go mod download`, etc.) but do not configure a cache.
 *
 * Without caching, every CI run re-downloads the entire dependency graph
 * from the internet, which:
 * - Slows builds (npm: 30–120 s, pip: 20–60 s)
 * - Risks flakiness if the registry is temporarily unavailable
 * - Inflates bandwidth costs on self-hosted runners
 */

const INSTALL_PATTERNS = [
  { pattern: /npm ci\b/, label: 'npm ci', manager: 'npm' },
  { pattern: /yarn install\b/, label: 'yarn install', manager: 'yarn' },
  { pattern: /pnpm install\b/, label: 'pnpm install', manager: 'pnpm' },
  { pattern: /pip install\b/, label: 'pip install', manager: 'pip' },
  { pattern: /poetry install\b/, label: 'poetry install', manager: 'poetry' },
  { pattern: /go mod download\b/, label: 'go mod download', manager: 'go' },
  { pattern: /bundle install\b/, label: 'bundle install', manager: 'bundler' },
];

export const missingCacheRule: LintRule = {
  id: 'missing-cache',
  description: 'Jobs that install dependencies should configure a cache.',
  platforms: ['github-actions', 'gitlab-ci'],

  check(doc: unknown, platform: LintPlatform): LintIssue[] {
    if (!isObject(doc)) return [];

    if (platform === 'github-actions') {
      return checkGitHubActions(doc);
    }
    return checkGitLabCI(doc);
  },
};

function checkGitHubActions(doc: Record<string, unknown>): LintIssue[] {
  const issues: LintIssue[] = [];
  const jobs = doc['jobs'];
  if (!isObject(jobs)) return issues;

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!isObject(job)) continue;
    const steps: unknown[] = Array.isArray(job['steps']) ? job['steps'] : [];

    const allRunCommands = steps
      .filter(isObject)
      .map((s) => String(s['run'] ?? ''))
      .join('\n');

    const installMatch = INSTALL_PATTERNS.find((p) => p.pattern.test(allRunCommands));
    if (!installMatch) continue;

    // Check if there's a cache step (actions/cache or setup-* with cache: true)
    const hasCache = steps.some((s) => {
      if (!isObject(s)) return false;
      const uses = String(s['uses'] ?? '');
      // actions/cache or setup-node/python/go with cache: true
      if (/^actions\/cache@/.test(uses) || /^actions\/cache@[0-9a-f]{7,}/.test(uses)) return true;
      if (/^actions\/setup-(node|python|go)/.test(uses)) {
        const withBlock = s['with'];
        if (isObject(withBlock) && withBlock['cache']) return true;
      }
      return false;
    });

    if (!hasCache) {
      issues.push({
        rule: 'missing-cache',
        severity: 'warning',
        message: `Job "${jobName}" runs "${installMatch.label}" but has no cache configured. Each run re-downloads all dependencies.`,
        location: { job: jobName },
        suggestion: cacheHint(installMatch.manager),
      });
    }
  }

  return issues;
}

const GL_RESERVED = new Set([
  'stages', 'include', 'variables', 'default', 'workflow', 'image',
  'services', 'before_script', 'after_script', 'cache', 'pages',
]);

function checkGitLabCI(doc: Record<string, unknown>): LintIssue[] {
  const issues: LintIssue[] = [];

  // Global cache counts as a cache for all jobs
  const hasGlobalCache = 'cache' in doc;

  for (const [key, job] of Object.entries(doc)) {
    if (GL_RESERVED.has(key)) continue;
    if (!isObject(job)) continue;

    const script = job['script'];
    const allCommands = (Array.isArray(script) ? script.join('\n') : String(script ?? ''));

    const installMatch = INSTALL_PATTERNS.find((p) => p.pattern.test(allCommands));
    if (!installMatch) continue;

    const hasJobCache = 'cache' in job;
    if (!hasGlobalCache && !hasJobCache) {
      issues.push({
        rule: 'missing-cache',
        severity: 'warning',
        message: `Job "${key}" runs "${installMatch.label}" but has no cache configured.`,
        location: { job: key },
        suggestion: cacheHint(installMatch.manager),
      });
    }
  }

  return issues;
}

function cacheHint(manager: string): string {
  const hints: Record<string, string> = {
    npm: 'Use `actions/setup-node` with `cache: npm`, or add an `actions/cache` step keyed on `${{ hashFiles(\'package-lock.json\') }}`.',
    yarn: 'Use `actions/setup-node` with `cache: yarn`.',
    pnpm: 'Use `actions/setup-node` with `cache: pnpm`.',
    pip: 'Use `actions/setup-python` with `cache: pip`.',
    poetry: 'Cache `~/.cache/pypoetry` keyed on `${{ hashFiles(\'poetry.lock\') }}`.',
    go: 'Use `actions/setup-go` with `cache: true` (caches the Go module cache automatically).',
    bundler: 'Cache `vendor/bundle` keyed on `${{ hashFiles(\'Gemfile.lock\') }}`.',
  };
  return hints[manager] ?? 'Add a cache step for your package manager.';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
