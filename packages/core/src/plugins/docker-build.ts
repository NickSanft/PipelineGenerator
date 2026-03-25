import type { Pipeline, Stage } from '../types/pipeline.js';
import type { Plugin } from './base.js';

export interface DockerBuildConfig {
  /** Container registry host. Default: ghcr.io */
  registry?: string;
  /** Image name. Default: `${{ github.repository }}` */
  imageName?: string;
  /** Only push on pushes to the default branch (not on PRs). Default: true */
  pushOnMainOnly?: boolean;
}

const DOCKER_LOGIN_SHA = '9780b0f04d4c1651776a9f0d1b6a87cef5b0df0e'; // docker/login-action@v3.3.0
const DOCKER_BUILD_PUSH_SHA = '4f58ea79222b3b9dc2c8bbdd6debcef730109a75'; // docker/build-push-action@v6.9.0
const DOCKER_META_SHA = '8e5442c4ef9f78752691e2d8f8d19755c6f78e81';    // docker/metadata-action@v5.5.1

/**
 * Docker Build plugin — adds a `docker` stage that builds and pushes the
 * container image to a registry. Only activates when a `Dockerfile` was NOT
 * already detected by the repo analyzer (avoids doubling up with the built-in
 * Docker enrichment in `generatePipeline`).
 */
export function createDockerBuildPlugin(config: DockerBuildConfig = {}): Plugin {
  const registry = config.registry ?? 'ghcr.io';
  const imageName = config.imageName ?? '${{ github.repository }}';
  const pushOnMainOnly = config.pushOnMainOnly ?? true;

  return {
    name: 'docker-build',
    description: 'Adds a Docker build-and-push stage to the pipeline',
    hooks: {
      beforeGenerate(pipeline: Pipeline): Pipeline {
        // Skip if a docker stage already exists
        if (pipeline.stages.some((s) => s.name === 'docker')) {
          return pipeline;
        }

        const lastStage = pipeline.stages[pipeline.stages.length - 1]?.name;

        const pushCondition = pushOnMainOnly
          ? "github.event_name == 'push' && github.ref == 'refs/heads/main'"
          : undefined;

        const dockerStage: Stage = {
          name: 'docker',
          dependsOn: lastStage ? [lastStage] : undefined,
          jobs: [
            {
              name: 'build-and-push',
              runsOn: 'ubuntu-latest',
              timeoutMinutes: 30,
              steps: [
                {
                  name: 'Checkout',
                  type: 'action',
                  action: 'actions/checkout',
                  actionVersion: 'b4ffde65f46336ab88eb53be808477a3936bae11', // v4.1.1
                },
                {
                  name: 'Docker metadata',
                  type: 'action',
                  action: 'docker/metadata-action',
                  actionVersion: DOCKER_META_SHA,
                  with: {
                    images: `${registry}/${imageName}`,
                    tags: [
                      'type=sha,prefix=sha-',
                      'type=ref,event=branch',
                      'type=semver,pattern={{version}}',
                    ].join('\n'),
                  },
                },
                {
                  name: `Log in to ${registry}`,
                  type: 'action',
                  action: 'docker/login-action',
                  actionVersion: DOCKER_LOGIN_SHA,
                  with: {
                    registry,
                    username: '${{ github.actor }}',
                    password: '${{ secrets.GITHUB_TOKEN }}',
                  },
                  ...(pushCondition ? { condition: pushCondition } : {}),
                },
                {
                  name: 'Build and push',
                  type: 'action',
                  action: 'docker/build-push-action',
                  actionVersion: DOCKER_BUILD_PUSH_SHA,
                  with: {
                    context: '.',
                    push: pushCondition ? `\${{ ${pushCondition} }}` : 'true',
                    tags: '${{ steps.meta.outputs.tags }}',
                    labels: '${{ steps.meta.outputs.labels }}',
                    'cache-from': 'type=gha',
                    'cache-to': 'type=gha,mode=max',
                  },
                },
              ],
            },
          ],
        };

        return { ...pipeline, stages: [...pipeline.stages, dockerStage] };
      },
    },
  };
}
