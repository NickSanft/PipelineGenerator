import inquirer from 'inquirer';
import type { GeneratorOptions } from '../generators/options.js';
import type { ProjectManifest } from '../types/manifest.js';
import type { SupportedPlatform } from '../renderers/registry.js';

export interface InteractiveResult {
  platform: SupportedPlatform;
  options: GeneratorOptions;
}

/**
 * Walk the user through generation choices via interactive prompts.
 * If `preselectedPlatform` is provided the platform prompt is skipped.
 */
export async function runInteractivePrompts(
  manifest: ProjectManifest,
  preselectedPlatform?: SupportedPlatform,
): Promise<InteractiveResult> {
  const project = manifest.projects[0];

  // ── Platform ───────────────────────────────────────────────────────────────
  let platform: SupportedPlatform;
  if (preselectedPlatform) {
    platform = preselectedPlatform;
  } else {
    const answer = await inquirer.prompt<{ platform: SupportedPlatform }>([
      {
        type: 'list',
        name: 'platform',
        message: 'Target platform:',
        choices: [
          { name: 'GitHub Actions  (.github/workflows/)', value: 'github-actions' },
          { name: 'GitLab CI       (.gitlab-ci.yml)',     value: 'gitlab-ci' },
        ],
      },
    ]);
    platform = answer.platform;
  }

  // ── Coverage gate ──────────────────────────────────────────────────────────
  const runnerHint = project?.testRunner ? ` (detected ${project.testRunner})` : '';
  const { includeCoverage } = await inquirer.prompt<{ includeCoverage: boolean }>([
    {
      type: 'confirm',
      name: 'includeCoverage',
      message: `Include a minimum coverage gate?${runnerHint}`,
      default: true,
    },
  ]);

  let coverageThreshold: number | undefined;
  if (includeCoverage) {
    const { threshold } = await inquirer.prompt<{ threshold: number }>([
      {
        type: 'number',
        name: 'threshold',
        message: 'Minimum coverage threshold (%):',
        default: 80,
        validate: (v: unknown) => {
          const n = Number(v);
          return n >= 0 && n <= 100 ? true : 'Enter a number between 0 and 100';
        },
      },
    ]);
    coverageThreshold = threshold;
  }

  // ── Docker push ────────────────────────────────────────────────────────────
  const hasDockerfile = manifest.projects.some((p) => p.hasDockerfile);
  let skipDockerPush = false;
  if (hasDockerfile) {
    const { dockerPush } = await inquirer.prompt<{ dockerPush: boolean }>([
      {
        type: 'confirm',
        name: 'dockerPush',
        message: 'Dockerfile detected. Include Docker build + push stage?',
        default: true,
      },
    ]);
    skipDockerPush = !dockerPush;
  }

  // ── Slack notifications ────────────────────────────────────────────────────
  const { slackInput } = await inquirer.prompt<{ slackInput: string }>([
    {
      type: 'input',
      name: 'slackInput',
      message: 'Slack channel for failure notifications (leave blank to skip):',
      default: '',
    },
  ]);

  const options: GeneratorOptions = {
    coverageThreshold,
    skipDockerPush,
    slackChannel: slackInput.trim() || undefined,
  };

  return { platform, options };
}
