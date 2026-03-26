/**
 * SHA-pinned registry of well-known GitHub Actions.
 *
 * Tags are mutable and can be compromised. Pinning by SHA guarantees
 * reproducibility even if the upstream repo is compromised. See ADR 003.
 *
 * Keep these up to date via Renovate or Dependabot for GitHub Actions.
 */
import type { Step } from '../types/pipeline.js';

interface PinnedAction {
  /** Human-readable action ref, e.g. "actions/checkout" */
  action: string;
  /** The immutable commit SHA */
  sha: string;
  /** Human-readable tag for the comment */
  tag: string;
}

export const KNOWN_ACTIONS = {
  checkout: {
    action: 'actions/checkout',
    sha: '11bd71901bbe5b1630ceea73d27597364c9af683',
    tag: 'v4.2.2',
  },
  setupNode: {
    action: 'actions/setup-node',
    sha: '39370e3970a6d050c480ffad4ff0ed4d3fdee5af',
    tag: 'v4.1.0',
  },
  setupPython: {
    action: 'actions/setup-python',
    sha: '0b93645e9fea7318ecaed2b359559ac225c90a2b',
    tag: 'v5.3.0',
  },
  setupGo: {
    action: 'actions/setup-go',
    sha: 'f111f3307d96850f83d04b4c9e7e57ef5f51e8d4',
    tag: 'v5.3.0',
  },
  cache: {
    action: 'actions/cache',
    sha: 'd4323d4df104b026a6aa633fbc2026b85a2c7401',
    tag: 'v4.2.2',
  },
  dockerLogin: {
    action: 'docker/login-action',
    sha: '9780b0c442fbb1117ed29e0efdff1e18412f7567',
    tag: 'v3.3.0',
  },
  dockerBuildPush: {
    action: 'docker/build-push-action',
    sha: '48aba3b46827e16c1ba1bbc8d0e88bfb99ae4d3c',
    tag: 'v6.10.0',
  },
  dockerSetupBuildx: {
    action: 'docker/setup-buildx-action',
    sha: 'f7ce87ade9e31e4da9c83a3a3b3b13b543d52a2d',
    tag: 'v3.8.0',
  },
  gitleaks: {
    action: 'gitleaks/gitleaks-action',
    sha: 'cb7149a9b57195b609c63e8518d2c6ef8e5b7726',
    tag: 'v2.3.9',
  },
  setupJava: {
    action: 'actions/setup-java',
    sha: '3a4f6e1af504cf6a31855fa899c6aa5355ba6c12',
    tag: 'v4.7.0',
  },
  setupDotnet: {
    action: 'actions/setup-dotnet',
    sha: '67a3573c9a586a3f9c594539f4ab511d57bb3ce9',
    tag: 'v4.3.1',
  },
} as const satisfies Record<string, PinnedAction>;

/** Create a SHA-pinned action step. */
export function actionStep(
  name: string,
  key: keyof typeof KNOWN_ACTIONS,
  inputs?: Record<string, string>,
  env?: Record<string, string>,
): Step {
  const a = KNOWN_ACTIONS[key];
  return {
    name,
    type: 'action',
    action: a.action,
    actionVersion: a.sha,
    ...(inputs && { with: inputs }),
    ...(env && { env }),
  };
}

/** Create a shell `run` step. */
export function runStep(name: string, command: string, env?: Record<string, string>): Step {
  return {
    name,
    type: 'run',
    run: command,
    ...(env && { env }),
  };
}
