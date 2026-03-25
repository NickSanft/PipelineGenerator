import { parse as parseYaml } from 'yaml';
import type { LintResult, LintPlatform, LintRule } from './base.js';
import { buildSummary } from './base.js';
import { unpinnedActionsRule } from './rules/unpinned-actions.js';
import { missingTimeoutRule } from './rules/missing-timeout.js';
import { missingPermissionsRule } from './rules/missing-permissions.js';
import { missingCacheRule } from './rules/missing-cache.js';
import { unsafeInstallRule } from './rules/unsafe-install.js';
import { secretLeakRule } from './rules/secret-leak.js';

// ── Built-in rule registry ────────────────────────────────────────────────────

const BUILT_IN_RULES: LintRule[] = [
  unpinnedActionsRule,
  missingPermissionsRule,
  missingTimeoutRule,
  missingCacheRule,
  unsafeInstallRule,
  secretLeakRule,
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse `yaml` and run all applicable lint rules against it.
 *
 * @param yaml   Raw YAML text from the CI config file.
 * @param platform  Which platform the config is for.
 * @param extraRules  Additional rules to run (e.g., from plugins).
 */
export function lintYaml(
  yaml: string,
  platform: LintPlatform,
  extraRules: LintRule[] = [],
): LintResult {
  let doc: unknown;
  try {
    doc = parseYaml(yaml);
  } catch (err) {
    return {
      platform,
      issues: [
        {
          rule: 'parse-error',
          severity: 'error',
          message: `Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      summary: { errors: 1, warnings: 0, infos: 0 },
    };
  }

  const rules = [...BUILT_IN_RULES, ...extraRules].filter((r) =>
    r.platforms.includes(platform),
  );

  const issues = rules.flatMap((rule) => {
    try {
      return rule.check(doc, platform);
    } catch (err) {
      // Rule errors should never crash the linter
      return [
        {
          rule: rule.id,
          severity: 'error' as const,
          message: `Rule "${rule.id}" threw an error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ];
    }
  });

  return { platform, issues, summary: buildSummary(issues) };
}

/**
 * Detect the platform from a file path.
 * Returns `null` if the path is not a recognised CI config.
 */
export function detectPlatformFromPath(filePath: string): LintPlatform | null {
  const normalised = filePath.replace(/\\/g, '/');
  if (normalised.includes('.github/workflows/') && normalised.endsWith('.yml')) {
    return 'github-actions';
  }
  if (normalised.endsWith('.gitlab-ci.yml') || normalised === '.gitlab-ci.yaml') {
    return 'gitlab-ci';
  }
  return null;
}
