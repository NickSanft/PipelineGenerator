import chalk from 'chalk';
import type { ProjectManifest } from '../types/manifest.js';
import type { Decision } from '../generators/decisions.js';

// ── Manifest summary ──────────────────────────────────────────────────────────

export function printManifestSummary(manifest: ProjectManifest): void {
  console.log(chalk.bold('\nDetected repository:'));
  for (const project of manifest.projects) {
    console.log(`  ${chalk.cyan(project.name)}  ${chalk.dim('(' + project.language + ')')}`);
    if (project.framework)       console.log(`    Framework:       ${project.framework}`);
    if (project.packageManager)  console.log(`    Package mgr:     ${project.packageManager}`);
    if (project.testRunner)      console.log(`    Test runner:     ${project.testRunner}`);
    if (project.buildTool)       console.log(`    Build tool:      ${project.buildTool}`);
    console.log(`    Dockerfile:      ${project.hasDockerfile ? chalk.green('yes') : 'no'}`);
    if (project.deploymentTargets.length > 0) {
      const targets = project.deploymentTargets.map((d) => d.type).join(', ');
      console.log(`    Deploy targets:  ${targets}`);
    }
    if (project.artifacts.length > 0) {
      console.log(`    Artifacts:       ${project.artifacts.join(', ')}`);
    }
  }
  console.log(`  Branch:          ${chalk.cyan(manifest.vcs.defaultBranch)}`);
  console.log();
}

// ── Decisions list ────────────────────────────────────────────────────────────

export function printDecisions(decisions: Decision[]): void {
  if (decisions.length === 0) return;
  console.log(chalk.bold('Generator decisions:'));
  for (const d of decisions) {
    const cat = chalk.dim(d.category.padEnd(22));
    const choice = chalk.white(d.choice);
    const reason = chalk.dim('— ' + d.reason);
    console.log(`  ${cat} ${choice}  ${reason}`);
  }
  console.log();
}

// ── File header ───────────────────────────────────────────────────────────────

export function printOutputPath(outputPath: string): void {
  console.log(chalk.bold('Would write:'));
  console.log(`  ${chalk.green(outputPath)}`);
  console.log();
}

// ── Diff output ───────────────────────────────────────────────────────────────

export function printDiff(diffText: string, outputPath: string): void {
  if (!diffText.trim()) {
    console.log(chalk.green('✔ No changes — generated output matches existing file.'));
    return;
  }
  console.log(chalk.bold(`Diff: ${outputPath}`));
  console.log(chalk.dim('─'.repeat(60)));
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+')) {
      process.stdout.write(chalk.green(line) + '\n');
    } else if (line.startsWith('-')) {
      process.stdout.write(chalk.red(line) + '\n');
    } else if (line.startsWith('@')) {
      process.stdout.write(chalk.cyan(line) + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }
}
