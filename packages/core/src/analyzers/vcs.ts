import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { VCSInfo } from '../types/manifest.js';

const execAsync = promisify(exec);

const RELEASE_BRANCH_PATTERNS = [/^release\//, /^releases\//, /^hotfix\//, /^v\d+\.\d+/];

export async function analyzeVCS(repoRoot: string): Promise<VCSInfo> {
  try {
    const defaultBranch = await detectDefaultBranch(repoRoot);
    const { hasReleaseBranches, branchPattern } = await detectBranchInfo(repoRoot);

    return { defaultBranch, hasReleaseBranches, branchPattern };
  } catch {
    // Not a git repo or git not available — use safe defaults
    return { defaultBranch: 'main', hasReleaseBranches: false };
  }
}

async function detectDefaultBranch(repoRoot: string): Promise<string> {
  // Try to read the remote HEAD reference (most reliable for cloned repos)
  try {
    const { stdout } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD --short', {
      cwd: repoRoot,
    });
    return stdout.trim().replace('origin/', '');
  } catch {
    // Fall back to the current local HEAD branch
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot });
    return stdout.trim() || 'main';
  }
}

async function detectBranchInfo(
  repoRoot: string,
): Promise<{ hasReleaseBranches: boolean; branchPattern?: string }> {
  try {
    const { stdout } = await execAsync('git branch -r', { cwd: repoRoot });
    const branches = stdout
      .split('\n')
      .map((b) => b.trim().replace('origin/', ''))
      .filter(Boolean);

    const hasReleaseBranches = branches.some((b) =>
      RELEASE_BRANCH_PATTERNS.some((pat) => pat.test(b)),
    );

    // Detect a GitFlow-style branch pattern
    const hasFeatureBranches = branches.some((b) => b.startsWith('feature/'));
    const branchPattern = hasFeatureBranches ? 'gitflow' : undefined;

    return { hasReleaseBranches, branchPattern };
  } catch {
    return { hasReleaseBranches: false };
  }
}
