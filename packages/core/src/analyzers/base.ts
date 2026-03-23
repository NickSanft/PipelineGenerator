import type { ProjectDescriptor } from '../types/manifest.js';
import type { FileSystem } from '../utils/fs-adapter.js';

export interface Analyzer {
  readonly name: string;
  /** Returns true if this analyzer should run for the given repo root */
  detect(repoRoot: string, fs: FileSystem): Promise<boolean>;
  analyze(repoRoot: string, fs: FileSystem): Promise<ProjectDescriptor>;
}
