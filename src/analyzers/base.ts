import type { ProjectDescriptor } from '../types/manifest.js';

export interface Analyzer {
  readonly name: string;
  /** Returns true if this analyzer should run for the given repo root */
  detect(repoRoot: string): Promise<boolean>;
  analyze(repoRoot: string): Promise<ProjectDescriptor>;
}
