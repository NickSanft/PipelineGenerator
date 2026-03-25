import type { LintRule, LintIssue, LintPlatform } from '../base.js';

/**
 * Flags `uses:` directives that reference a mutable tag (e.g. `@v4`) instead
 * of an immutable SHA (e.g. `@b4ffde65f46336...`).
 *
 * Tags are mutable — a compromised action publisher can push malicious code
 * to an existing tag and poison every workflow that uses it. SHA pinning is
 * the only way to guarantee reproducibility and supply-chain integrity.
 *
 * See also: ADR 003-sha-pinning.md
 */
export const unpinnedActionsRule: LintRule = {
  id: 'unpinned-actions',
  description: 'Actions should be pinned to a full-length commit SHA, not a tag.',
  platforms: ['github-actions'],

  check(doc: unknown, _platform: LintPlatform): LintIssue[] {
    if (!isObject(doc)) return [];
    const issues: LintIssue[] = [];

    const jobs = (doc as Record<string, unknown>)['jobs'];
    if (!isObject(jobs)) return [];

    for (const [jobName, job] of Object.entries(jobs as Record<string, unknown>)) {
      if (!isObject(job)) continue;
      const steps = (job as Record<string, unknown>)['steps'];
      if (!Array.isArray(steps)) continue;

      for (const step of steps) {
        if (!isObject(step)) continue;
        const uses = (step as Record<string, unknown>)['uses'];
        if (typeof uses !== 'string') continue;

        if (isTagRef(uses)) {
          const stepName = String((step as Record<string, unknown>)['name'] ?? uses);
          issues.push({
            rule: 'unpinned-actions',
            severity: 'error',
            message: `"${uses}" uses a mutable tag. Pin to a full SHA for supply-chain security.`,
            location: { job: jobName, step: stepName },
            suggestion: `Replace "@${uses.split('@')[1]}" with the commit SHA of that version, e.g. "${uses.split('@')[0]}@<sha> # ${uses.split('@')[1]}"`,
          });
        }
      }
    }

    return issues;
  },
};

/** True if the ref is a human-readable tag (v4, v3.1.2, latest, main, etc.) */
function isTagRef(uses: string): boolean {
  const ref = uses.split('@')[1];
  if (!ref) return false; // no ref at all — also suspicious, but a separate rule
  // A full SHA is 40 hex chars; partial SHAs (7+) are also acceptable
  return !/^[0-9a-f]{7,40}$/.test(ref);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
