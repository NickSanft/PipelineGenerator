import type { Pipeline, Stage, Step } from '../types/pipeline.js';
import { actionStep, runStep } from '../utils/known-actions.js';

/**
 * Composable: adds a Docker build-and-push stage to any Pipeline.
 * Called by generators when `project.hasDockerfile` is true.
 */
export function addDockerStage(
  pipeline: Pipeline,
  options: {
    /** The stage this must wait for before building the image */
    dependsOn?: string;
    /** Image name, e.g. "ghcr.io/${{ github.repository }}" */
    imageName?: string;
    /** Tag strategy: 'sha' for PRs, 'semver' for releases */
    tagStrategy?: 'sha' | 'semver' | 'both';
  } = {},
): Pipeline {
  const {
    dependsOn,
    imageName = 'ghcr.io/${{ github.repository }}',
    tagStrategy = 'both',
  } = options;

  const tags = buildTagExpression(imageName, tagStrategy);

  const steps: Step[] = [
    actionStep('Checkout', 'checkout'),
    actionStep('Set up Docker Buildx', 'dockerSetupBuildx'),
    actionStep('Log in to GHCR', 'dockerLogin', {
      registry: 'ghcr.io',
      username: '${{ github.actor }}',
      password: '${{ secrets.GITHUB_TOKEN }}',
    }),
    runStep('Extract metadata', buildMetadataCommand(imageName)),
    actionStep('Build and push', 'dockerBuildPush', {
      context: '.',
      push: 'true',
      tags,
      'cache-from': 'type=gha',
      'cache-to': 'type=gha,mode=max',
    }),
  ];

  const dockerStage: Stage = {
    name: 'docker',
    ...(dependsOn && { dependsOn: [dependsOn] }),
    jobs: [
      {
        name: 'build-and-push',
        runsOn: 'ubuntu-latest',
        timeoutMinutes: 30,
        condition: "github.event_name != 'pull_request'",
        steps,
      },
    ],
  };

  return {
    ...pipeline,
    // Grant packages:write only for the docker stage (least privilege for push)
    permissions: {
      ...pipeline.permissions,
      packages: 'write',
    },
    stages: [...pipeline.stages, dockerStage],
  };
}

// GitHub Actions context expressions — kept as plain strings to avoid
// TypeScript mis-parsing the ${{ }} syntax inside template literals.
const GHA_SHA = '${{ github.sha }}';
const GHA_REF_NAME = '${{ github.ref_name }}';

function buildTagExpression(imageName: string, strategy: 'sha' | 'semver' | 'both'): string {
  const shaTag = `${imageName}:${GHA_SHA}`;
  const latestTag = `${imageName}:latest`;
  const semverTag = `${imageName}:${GHA_REF_NAME}`;

  switch (strategy) {
    case 'sha':    return shaTag;
    case 'semver': return `${shaTag}\n${semverTag}`;
    case 'both':
    default:       return `${shaTag}\n${latestTag}`;
  }
}

function buildMetadataCommand(imageName: string): string {
  return [
    `echo "IMAGE_NAME=${imageName}" >> $GITHUB_ENV`,
    `echo "IMAGE_TAG=${GHA_SHA}" >> $GITHUB_ENV`,
  ].join('\n');
}
