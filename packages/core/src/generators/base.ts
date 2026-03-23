import type { ProjectManifest } from '../types/manifest.js';
import type { Pipeline } from '../types/pipeline.js';
import type { GeneratorOptions } from './options.js';

export interface PipelineGenerator {
  readonly name: string;
  generate(manifest: ProjectManifest, options?: GeneratorOptions): Pipeline;
}
