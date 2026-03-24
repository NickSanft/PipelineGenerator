export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  /** Branch or tag ref. Defaults to 'HEAD' if not specified in URL. */
  ref: string;
  /** Sub-directory within the repo, without leading slash. Empty string = repo root. */
  subdir: string;
}

/**
 * Parse a GitHub URL into its components.
 *
 * Supported forms:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch
 *   https://github.com/owner/repo/tree/branch/some/sub/dir
 */
export function parseGitHubUrl(url: string): GitHubRepoInfo {
  // Normalise: strip trailing slash, strip .git suffix
  const cleaned = url.trim().replace(/\.git$/, '').replace(/\/$/, '');

  const match = cleaned.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?$/,
  );

  if (!match) {
    throw new Error(`Not a valid GitHub repository URL: ${url}`);
  }

  const [, owner, repo, ref, subdir] = match;
  return {
    owner,
    repo,
    ref: ref ?? 'HEAD',
    subdir: subdir ?? '',
  };
}
