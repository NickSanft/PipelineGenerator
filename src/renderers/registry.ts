import type { PipelineRenderer } from './base.js';
import { GithubActionsRenderer } from './github-actions.js';
import { GitlabCiRenderer } from './gitlab-ci.js';

export type SupportedPlatform = 'github-actions' | 'gitlab-ci';

export function getRenderer(platform: SupportedPlatform): PipelineRenderer {
  switch (platform) {
    case 'github-actions': return new GithubActionsRenderer();
    case 'gitlab-ci':      return new GitlabCiRenderer();
    default:
      throw new Error(
        `Unsupported platform: "${platform as string}". Supported: github-actions, gitlab-ci`,
      );
  }
}
