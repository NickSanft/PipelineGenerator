import { describe, it, expect } from 'vitest';
import { parseGitHubUrl } from '../../src/utils/github-url.js';

describe('parseGitHubUrl()', () => {
  const cases = [
    {
      label: 'bare repo URL',
      url: 'https://github.com/owner/repo',
      expected: { owner: 'owner', repo: 'repo', ref: 'HEAD', subdir: '' },
    },
    {
      label: 'repo URL with trailing slash',
      url: 'https://github.com/owner/repo/',
      expected: { owner: 'owner', repo: 'repo', ref: 'HEAD', subdir: '' },
    },
    {
      label: 'repo URL with .git suffix',
      url: 'https://github.com/owner/repo.git',
      expected: { owner: 'owner', repo: 'repo', ref: 'HEAD', subdir: '' },
    },
    {
      label: 'tree URL with branch only',
      url: 'https://github.com/owner/repo/tree/main',
      expected: { owner: 'owner', repo: 'repo', ref: 'main', subdir: '' },
    },
    {
      label: 'tree URL with branch and single-level subdir',
      url: 'https://github.com/owner/repo/tree/main/packages',
      expected: { owner: 'owner', repo: 'repo', ref: 'main', subdir: 'packages' },
    },
    {
      label: 'tree URL with branch and multi-level subdir',
      url: 'https://github.com/owner/repo/tree/develop/apps/web/src',
      expected: { owner: 'owner', repo: 'repo', ref: 'develop', subdir: 'apps/web/src' },
    },
    {
      label: 'feature branch with slashes in name is not supported — branch is first path segment',
      url: 'https://github.com/acme/my-repo/tree/v2.0.0',
      expected: { owner: 'acme', repo: 'my-repo', ref: 'v2.0.0', subdir: '' },
    },
  ] as const;

  for (const { label, url, expected } of cases) {
    it(label, () => {
      const result = parseGitHubUrl(url);
      expect(result).toEqual(expected);
    });
  }

  it('throws for non-GitHub URLs', () => {
    expect(() => parseGitHubUrl('https://gitlab.com/owner/repo')).toThrow(
      'Not a valid GitHub repository URL',
    );
  });

  it('throws for completely invalid input', () => {
    expect(() => parseGitHubUrl('not-a-url')).toThrow('Not a valid GitHub repository URL');
  });
});
