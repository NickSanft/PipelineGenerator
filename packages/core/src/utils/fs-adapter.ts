import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';

/**
 * Abstraction over filesystem operations used by analyzers.
 * Swap `LocalFileSystem` for `GitHubFileSystem` (W-3) to run analyzers
 * against a remote GitHub repository without cloning.
 */
export interface FileSystem {
  /** Returns true if the file exists at the given absolute path. */
  fileExists(path: string): Promise<boolean>;

  /** Returns true if any of the given filenames exist in `dir`. */
  anyFileExists(dir: string, filenames: string[]): Promise<boolean>;

  /** Read a text file, returning null if it doesn't exist or can't be read. */
  readTextFile(path: string): Promise<string | null>;

  /** Read and parse a JSON file, returning null if missing or invalid. */
  readJsonFile<T = unknown>(path: string): Promise<T | null>;

  /**
   * Glob for paths relative to `options.cwd`.
   * Returns relative paths (same contract as fast-glob).
   */
  glob(
    pattern: string,
    options: { cwd: string; onlyDirectories?: boolean; ignore?: string[] },
  ): Promise<string[]>;
}

// ── Local (disk) implementation ───────────────────────────────────────────────

export class LocalFileSystem implements FileSystem {
  async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async anyFileExists(dir: string, filenames: string[]): Promise<boolean> {
    const checks = filenames.map((f) => this.fileExists(join(dir, f)));
    const results = await Promise.all(checks);
    return results.some(Boolean);
  }

  async readTextFile(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf-8');
    } catch {
      return null;
    }
  }

  async readJsonFile<T = unknown>(path: string): Promise<T | null> {
    try {
      const contents = await readFile(path, 'utf-8');
      return JSON.parse(contents) as T;
    } catch {
      return null;
    }
  }

  async glob(
    pattern: string,
    options: { cwd: string; onlyDirectories?: boolean; ignore?: string[] },
  ): Promise<string[]> {
    return fg(pattern, options);
  }
}
