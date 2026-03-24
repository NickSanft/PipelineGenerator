import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { GitHubFileSystem } from '../../src/utils/github-fs.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function treeResponse(paths: Array<{ path: string; type: 'blob' | 'tree' }>) {
  return {
    tree: paths,
    truncated: false,
  };
}

function contentsResponse(text: string) {
  return {
    content: Buffer.from(text, 'utf-8').toString('base64'),
    encoding: 'base64',
  };
}

function mockFetch(responses: Map<string, unknown>) {
  return vi.fn(async (url: string) => {
    const body = responses.get(url);
    if (!body) {
      return { ok: false, status: 404, statusText: 'Not Found' };
    }
    return { ok: true, status: 200, json: async () => body };
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GitHubFileSystem', () => {
  let fetchSpy: MockInstance;

  const TREE_URL =
    'https://api.github.com/repos/owner/repo/git/trees/main?recursive=1';

  const sampleTree = treeResponse([
    { path: 'package.json', type: 'blob' },
    { path: 'src', type: 'tree' },
    { path: 'src/index.ts', type: 'blob' },
    { path: 'src/utils', type: 'tree' },
    { path: 'src/utils/helper.ts', type: 'blob' },
    { path: 'dist', type: 'tree' },
    { path: 'dist/index.js', type: 'blob' },
  ]);

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch' as never);
  });

  it('fetches tree once for multiple FS calls', async () => {
    const responses = new Map<string, unknown>([[TREE_URL, sampleTree]]);
    fetchSpy.mockImplementation(mockFetch(responses));

    const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
    await ghfs.fileExists('package.json');
    await ghfs.fileExists('src/index.ts');

    // Tree should only be fetched once
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  describe('fileExists()', () => {
    it('returns true for a known blob', async () => {
      fetchSpy.mockImplementation(mockFetch(new Map([[TREE_URL, sampleTree]])));
      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      expect(await ghfs.fileExists('package.json')).toBe(true);
    });

    it('returns false for a directory path', async () => {
      fetchSpy.mockImplementation(mockFetch(new Map([[TREE_URL, sampleTree]])));
      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      expect(await ghfs.fileExists('src')).toBe(false);
    });

    it('returns false for a non-existent path', async () => {
      fetchSpy.mockImplementation(mockFetch(new Map([[TREE_URL, sampleTree]])));
      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      expect(await ghfs.fileExists('nonexistent.ts')).toBe(false);
    });
  });

  describe('anyFileExists()', () => {
    it('returns true when at least one file matches', async () => {
      fetchSpy.mockImplementation(mockFetch(new Map([[TREE_URL, sampleTree]])));
      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      expect(await ghfs.anyFileExists('', ['package.json', 'pyproject.toml'])).toBe(true);
    });

    it('returns false when no file matches', async () => {
      fetchSpy.mockImplementation(mockFetch(new Map([[TREE_URL, sampleTree]])));
      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      expect(await ghfs.anyFileExists('', ['go.mod', 'requirements.txt'])).toBe(false);
    });
  });

  describe('readTextFile()', () => {
    it('returns decoded content for an existing file', async () => {
      const contentUrl =
        'https://api.github.com/repos/owner/repo/contents/package.json?ref=main';
      const responses = new Map<string, unknown>([
        [TREE_URL, sampleTree],
        [contentUrl, contentsResponse('{"name":"my-pkg"}')],
      ]);
      fetchSpy.mockImplementation(mockFetch(responses));

      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      const text = await ghfs.readTextFile('package.json');
      expect(text).toBe('{"name":"my-pkg"}');
    });

    it('caches content — only one fetch per path', async () => {
      const contentUrl =
        'https://api.github.com/repos/owner/repo/contents/package.json?ref=main';
      const responses = new Map<string, unknown>([
        [TREE_URL, sampleTree],
        [contentUrl, contentsResponse('{}')],
      ]);
      fetchSpy.mockImplementation(mockFetch(responses));

      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      await ghfs.readTextFile('package.json');
      await ghfs.readTextFile('package.json');

      // readTextFile fetches content directly (no tree lookup) — 1 fetch total, cached on second call
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns null for a non-existent file', async () => {
      const contentUrl =
        'https://api.github.com/repos/owner/repo/contents/missing.txt?ref=main';
      const responses = new Map<string, unknown>([
        [TREE_URL, sampleTree],
        // No entry for contentUrl → 404
      ]);
      fetchSpy.mockImplementation(mockFetch(responses));

      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      expect(await ghfs.readTextFile('missing.txt')).toBeNull();
    });
  });

  describe('readJsonFile()', () => {
    it('parses valid JSON', async () => {
      const contentUrl =
        'https://api.github.com/repos/owner/repo/contents/package.json?ref=main';
      fetchSpy.mockImplementation(
        mockFetch(
          new Map([
            [TREE_URL, sampleTree],
            [contentUrl, contentsResponse('{"name":"pkg","version":"1.0.0"}')],
          ]),
        ),
      );

      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      const json = await ghfs.readJsonFile<{ name: string }>('package.json');
      expect(json?.name).toBe('pkg');
    });

    it('returns null for invalid JSON', async () => {
      const contentUrl =
        'https://api.github.com/repos/owner/repo/contents/package.json?ref=main';
      fetchSpy.mockImplementation(
        mockFetch(
          new Map([
            [TREE_URL, sampleTree],
            [contentUrl, contentsResponse('not-json')],
          ]),
        ),
      );

      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      expect(await ghfs.readJsonFile('package.json')).toBeNull();
    });
  });

  describe('glob()', () => {
    it('matches direct file patterns', async () => {
      fetchSpy.mockImplementation(mockFetch(new Map([[TREE_URL, sampleTree]])));
      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      const files = await ghfs.glob('*.ts', { cwd: 'src' });
      expect(files).toContain('index.ts');
      expect(files).not.toContain('utils/helper.ts'); // single * doesn't cross dirs
    });

    it('matches deep wildcard patterns', async () => {
      fetchSpy.mockImplementation(mockFetch(new Map([[TREE_URL, sampleTree]])));
      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      const files = await ghfs.glob('**/*.ts', { cwd: 'src' });
      expect(files).toContain('index.ts');
      expect(files).toContain('utils/helper.ts');
    });

    it('matches alternation patterns', async () => {
      fetchSpy.mockImplementation(mockFetch(new Map([[TREE_URL, sampleTree]])));
      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      const files = await ghfs.glob('*.{json,ts}', { cwd: '' });
      expect(files).toContain('package.json');
    });

    it('returns directories when onlyDirectories is true', async () => {
      fetchSpy.mockImplementation(mockFetch(new Map([[TREE_URL, sampleTree]])));
      const ghfs = new GitHubFileSystem('owner', 'repo', 'main');
      const dirs = await ghfs.glob('*/', { cwd: '', onlyDirectories: true });
      expect(dirs).toContain('src/');
      expect(dirs).toContain('dist/');
      expect(dirs).not.toContain('package.json');
    });
  });

  describe('fetchVCSInfo()', () => {
    it('returns the default branch from the GitHub repo API', async () => {
      const repoUrl = 'https://api.github.com/repos/owner/repo';
      fetchSpy.mockImplementation(
        mockFetch(new Map([[repoUrl, { default_branch: 'main' }]])),
      );

      const vcsInfo = await GitHubFileSystem.fetchVCSInfo('owner', 'repo');
      expect(vcsInfo.defaultBranch).toBe('main');
      expect(vcsInfo.hasReleaseBranches).toBe(false);
    });
  });
});
