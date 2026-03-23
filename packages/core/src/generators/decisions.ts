import type { ProjectManifest } from '../types/manifest.js';
import type { GeneratorOptions } from './options.js';

/** A single generator decision: what was chosen and why. */
export interface Decision {
  category: string;
  choice: string;
  reason: string;
}

/**
 * Derive the set of decisions the generator will make for a given manifest
 * and options. Used by --dry-run to show the "show your work" output.
 */
export function makeDecisions(manifest: ProjectManifest, options: GeneratorOptions = {}): Decision[] {
  const decisions: Decision[] = [];
  const project = manifest.projects[0];
  if (!project) return decisions;

  decisions.push({
    category: 'Language',
    choice: project.language,
    reason: 'detected from repository files',
  });

  if (project.framework) {
    decisions.push({
      category: 'Framework',
      choice: project.framework,
      reason: 'detected in project configuration',
    });
  }

  if (project.packageManager) {
    decisions.push({
      category: 'Package manager',
      choice: project.packageManager,
      reason: 'detected lockfile / config',
    });
  }

  if (project.testRunner) {
    decisions.push({
      category: 'Test runner',
      choice: project.testRunner,
      reason: 'detected in project configuration',
    });
  }

  if (project.buildTool) {
    decisions.push({
      category: 'Build tool',
      choice: project.buildTool,
      reason: 'detected in project configuration',
    });
  }

  if (options.coverageThreshold !== undefined) {
    decisions.push({
      category: 'Coverage gate',
      choice: `${options.coverageThreshold}%`,
      reason: 'specified via --coverage-threshold',
    });
  } else {
    decisions.push({
      category: 'Coverage gate',
      choice: 'none',
      reason: 'no threshold specified (use --coverage-threshold or --interactive)',
    });
  }

  const hasDocker = manifest.projects.some((p) => p.hasDockerfile);
  if (hasDocker) {
    decisions.push({
      category: 'Docker stage',
      choice: options.skipDockerPush ? 'skipped' : 'included',
      reason: options.skipDockerPush ? 'disabled via --skip-docker-push' : 'Dockerfile detected',
    });
  }

  if (options.slackChannel) {
    decisions.push({
      category: 'Notifications',
      choice: options.slackChannel,
      reason: 'Slack channel specified',
    });
  }

  if (manifest.vcs.hasReleaseBranches) {
    decisions.push({
      category: 'Release branches',
      choice: manifest.vcs.branchPattern ?? 'detected',
      reason: 'release branch pattern found in VCS',
    });
  }

  decisions.push({
    category: 'Default branch',
    choice: manifest.vcs.defaultBranch,
    reason: 'detected from git',
  });

  return decisions;
}
