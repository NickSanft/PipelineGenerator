import type { ProjectManifest } from '../types/manifest.js';
import type { Pipeline } from '../types/pipeline.js';

export interface PipelineGenerator {
  readonly name: string;
  generate(manifest: ProjectManifest): Pipeline;
}
