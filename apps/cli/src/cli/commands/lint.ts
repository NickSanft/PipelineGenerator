import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import {
  lintYaml,
  detectPlatformFromPath,
  logger,
} from '@pipeline-gen/core';
import type { LintIssue, LintPlatform } from '@pipeline-gen/core';

export const lintCommand = new Command('lint')
  .description('Lint an existing CI pipeline config and report issues')
  .argument('<file>', 'Path to the CI config file (.github/workflows/*.yml or .gitlab-ci.yml)')
  .option('--platform <platform>', 'Override platform detection (github-actions | gitlab-ci)')
  .option('--min-severity <level>', 'Minimum severity to report: error | warning | info', 'info')
  .action(async (file: string, opts: { platform?: string; minSeverity: string }) => {
    const filePath = resolve(file);

    // ── Platform detection ───────────────────────────────────────────────────
    let platform: LintPlatform;
    if (opts.platform) {
      if (opts.platform !== 'github-actions' && opts.platform !== 'gitlab-ci') {
        logger.error(`Unknown platform "${opts.platform}". Use github-actions or gitlab-ci.`);
        process.exit(1);
      }
      platform = opts.platform;
    } else {
      const detected = detectPlatformFromPath(filePath);
      if (!detected) {
        logger.error(
          `Cannot detect platform from file path "${file}". ` +
          'Use --platform github-actions or --platform gitlab-ci.',
        );
        process.exit(1);
      }
      platform = detected;
    }

    // ── Read file ────────────────────────────────────────────────────────────
    let yaml: string;
    try {
      yaml = await readFile(filePath, 'utf-8');
    } catch {
      logger.error(`Cannot read file: ${filePath}`);
      process.exit(1);
    }

    // ── Lint ─────────────────────────────────────────────────────────────────
    const result = lintYaml(yaml, platform);

    const severityOrder: Record<string, number> = { error: 3, warning: 2, info: 1 };
    const minLevel = severityOrder[opts.minSeverity] ?? 1;
    const filtered = result.issues.filter(
      (i) => (severityOrder[i.severity] ?? 0) >= minLevel,
    );

    // ── Output ───────────────────────────────────────────────────────────────
    printHeader(filePath, platform);

    if (filtered.length === 0) {
      console.log(chalk.green('\n  ✓ No issues found.\n'));
    } else {
      for (const issue of filtered) {
        printIssue(issue);
      }
    }

    printSummary(result.summary, filtered.length, opts.minSeverity);

    if (result.summary.errors > 0) {
      process.exit(1);
    }
  });

// ── Formatting ────────────────────────────────────────────────────────────────

function printHeader(filePath: string, platform: LintPlatform) {
  console.log(
    chalk.bold('\n  pipeline-gen lint') +
    chalk.dim(` — ${platform} — `) +
    chalk.cyan(filePath),
  );
  console.log(chalk.dim('  ' + '─'.repeat(60)));
}

function printIssue(issue: LintIssue) {
  const icon = issue.severity === 'error' ? chalk.red('✖') :
    issue.severity === 'warning' ? chalk.yellow('⚠') :
    chalk.blue('ℹ');

  const severityLabel = issue.severity === 'error' ? chalk.red(issue.severity) :
    issue.severity === 'warning' ? chalk.yellow(issue.severity) :
    chalk.blue(issue.severity);

  const ruleLabel = chalk.dim(`[${issue.rule}]`);
  const locationParts = [issue.location?.job, issue.location?.step]
    .filter(Boolean)
    .join(' › ');
  const locationLabel = locationParts ? chalk.dim(` (${locationParts})`) : '';

  console.log(`\n  ${icon} ${severityLabel} ${ruleLabel}${locationLabel}`);
  console.log(`     ${issue.message}`);
  if (issue.suggestion) {
    console.log(chalk.dim(`     Suggestion: ${issue.suggestion}`));
  }
}

function printSummary(
  summary: { errors: number; warnings: number; infos: number },
  shown: number,
  minSeverity: string,
) {
  console.log(chalk.dim('\n  ' + '─'.repeat(60)));
  const parts = [
    summary.errors > 0 ? chalk.red(`${summary.errors} error${summary.errors !== 1 ? 's' : ''}`) : null,
    summary.warnings > 0 ? chalk.yellow(`${summary.warnings} warning${summary.warnings !== 1 ? 's' : ''}`) : null,
    summary.infos > 0 ? chalk.blue(`${summary.infos} info${summary.infos !== 1 ? 's' : ''}`) : null,
  ].filter(Boolean);

  const total = summary.errors + summary.warnings + summary.infos;
  if (total === 0) {
    console.log(chalk.green('  All checks passed.\n'));
  } else {
    const label = parts.length > 0 ? parts.join(chalk.dim(', ')) : `${shown} issue(s)`;
    const filtered = shown < total ? chalk.dim(` (showing ${shown} with min-severity: ${minSeverity})`) : '';
    console.log(`  ${label}${filtered}\n`);
  }
}
