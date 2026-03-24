import type { FileSystem } from './fs-adapter.js';
import type { VCSInfo } from '../types/manifest.js';

interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
}

interface GitTreeResponse {
  tree: TreeEntry[];
  truncated: boolean;
}

interface ContentsResponse {
  content: string;
  encoding: string;
}

interface RepoResponse {
  default_branch: string;
}

/**
 * Glob pattern → RegExp.
 * Handles: `*` (single-segment wildcard), `**\/` (any-depth prefix), `{a,b}` (alternation).
 */
function globToRegExp(pattern: string): RegExp {
  // Normalise separators
  const p = pattern.replace(/\\/g, '/');

  let re = '';
  let i = 0;
  while (i < p.length) {
    const ch = p[i];

    if (ch === '*' && p[i + 1] === '*' && p[i + 2] === '/') {
      // **/ → match any path prefix (including none)
      re += '(?:.+/)?';
      i += 3;
    } else if (ch === '*' && p[i + 1] === '*') {
      // ** at end → match anything
      re += '.*';
      i += 2;
    } else if (ch === '*') {
      // * → match anything except a slash
      re += '[^/]+';
      i++;
    } else if (ch === '?') {
      re += '[^/]';
      i++;
    } else if (ch === '{') {
      const end = p.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
        i++;
      } else {
        const alts = p
          .slice(i + 1, end)
          .split(',')
          .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|');
        re += `(?:${alts})`;
        i = end + 1;
      }
    } else if (ch === '/') {
      re += '\\/';
      i++;
    } else {
      // Escape regex special chars
      re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }

  return new RegExp(`^${re}$`);
}

/**
 * A `FileSystem` implementation that reads from GitHub via the REST API.
 * The full repository tree is fetched once and cached; file contents are
 * fetched on demand and cached per path.
 */
export class GitHubFileSystem implements FileSystem {
  private readonly owner: string;
  private readonly repo: string;
  private readonly ref: string;
  private readonly token: string | undefined;
  private readonly subdir: string;

  /** path → type ('blob' | 'tree'), populated on first FS call */
  private treeCache: Map<string, 'blob' | 'tree'> | null = null;
  /** path → decoded text content */
  private contentCache = new Map<string, string | null>();

  constructor(owner: string, repo: string, ref: string, token?: string, subdir = '') {
    this.owner = owner;
    this.repo = repo;
    this.ref = ref;
    this.token = token;
    this.subdir = subdir.replace(/^\/|\/$/g, ''); // strip surrounding slashes
  }

  // ── Public helpers ────────────────────────────────────────────────────────

  /**
   * Fetch the default branch and return a minimal VCSInfo for the manifest.
   */
  static async fetchVCSInfo(owner: string, repo: string, token?: string): Promise<VCSInfo> {
    const headers = GitHubFileSystem.buildHeaders(token);
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
    }
    const data = (await res.json()) as RepoResponse;
    return {
      defaultBranch: data.default_branch,
      hasReleaseBranches: false,
    };
  }

  // ── FileSystem interface ──────────────────────────────────────────────────

  async fileExists(path: string): Promise<boolean> {
    const tree = await this.getTree();
    const normalised = this.toRepoPath(path);
    return tree.has(normalised) && tree.get(normalised) === 'blob';
  }

  async anyFileExists(dir: string, filenames: string[]): Promise<boolean> {
    const tree = await this.getTree();
    const normalised = this.toRepoPath(dir);
    for (const name of filenames) {
      const candidate = normalised ? `${normalised}/${name}` : name;
      if (tree.has(candidate) && tree.get(candidate) === 'blob') return true;
    }
    return false;
  }

  async readTextFile(path: string): Promise<string | null> {
    const normalised = this.toRepoPath(path);
    if (this.contentCache.has(normalised)) {
      return this.contentCache.get(normalised) ?? null;
    }
    const content = await this.fetchContent(normalised);
    this.contentCache.set(normalised, content);
    return content;
  }

  async readJsonFile<T = unknown>(path: string): Promise<T | null> {
    const text = await this.readTextFile(path);
    if (text === null) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  async glob(
    pattern: string,
    options: { cwd: string; onlyDirectories?: boolean; ignore?: string[] },
  ): Promise<string[]> {
    const tree = await this.getTree();
    const cwdRepo = this.toRepoPath(options.cwd);
    const targetType = options.onlyDirectories ? 'tree' : 'blob';

    const re = globToRegExp(pattern);
    const results: string[] = [];

    for (const [path, type] of tree) {
      if (type !== targetType) continue;

      // Must be under cwd
      const relative = cwdRepo ? this.stripPrefix(path, `${cwdRepo}/`) : path;
      if (relative === null) continue;

      // Directories get a trailing slash to match fast-glob convention (pattern `*/` etc.)
      const testPath = type === 'tree' ? `${relative}/` : relative;

      if (!re.test(testPath)) continue;

      // Apply ignore patterns
      if (options.ignore?.some((ig) => relative.startsWith(ig.replace(/\/\*\*$/, '')))) continue;

      results.push(testPath);
    }

    return results;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getTree(): Promise<Map<string, 'blob' | 'tree'>> {
    if (this.treeCache) return this.treeCache;

    const headers = GitHubFileSystem.buildHeaders(this.token);
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/${this.ref}?recursive=1`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as GitTreeResponse;
    if (data.truncated) {
      // Very large repos: tree is truncated; we proceed with what we have
      console.warn(`[GitHubFileSystem] Tree was truncated for ${this.owner}/${this.repo}`);
    }

    this.treeCache = new Map<string, 'blob' | 'tree'>();
    for (const entry of data.tree) {
      if (entry.type === 'blob' || entry.type === 'tree') {
        this.treeCache.set(entry.path, entry.type);
      }
    }

    return this.treeCache;
  }

  private async fetchContent(repoPath: string): Promise<string | null> {
    const headers = GitHubFileSystem.buildHeaders(this.token);
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${repoPath}?ref=${this.ref}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;

    const data = (await res.json()) as ContentsResponse;
    if (data.encoding !== 'base64') return null;

    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
  }

  /**
   * Convert a logical "path" (which may be an absolute-looking string like
   * `/some/dir/file.ts` produced by `join(repoRoot, ...)`) into a
   * repo-relative path with forward slashes.
   *
   * The `repoRoot` passed into `analyzeRepo` is the subdir (or '/'). We need
   * to strip that prefix if present.
   */
  private toRepoPath(path: string): string {
    // Normalise separators
    let p = path.replace(/\\/g, '/').replace(/^\/+/, '');

    // If the path starts with the subdir prefix, strip it
    if (this.subdir && p.startsWith(this.subdir + '/')) {
      p = p.slice(this.subdir.length + 1);
    } else if (this.subdir && p === this.subdir) {
      p = '';
    }

    return p;
  }

  private stripPrefix(path: string, prefix: string): string | null {
    if (!prefix) return path;
    if (path.startsWith(prefix)) return path.slice(prefix.length);
    return null;
  }

  private static buildHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }
}
