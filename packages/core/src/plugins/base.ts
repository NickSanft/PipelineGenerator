import type { ProjectManifest } from '../types/manifest.js';
import type { Pipeline } from '../types/pipeline.js';

export interface PluginHooks {
  /** Enrich or modify the manifest after analysis */
  afterAnalyze(manifest: ProjectManifest): ProjectManifest;
  /** Add or modify stages before generation completes */
  beforeGenerate(pipeline: Pipeline): Pipeline;
  /** Final pipeline modifications after all generation */
  afterGenerate(pipeline: Pipeline): Pipeline;
}

export interface Plugin {
  readonly name: string;
  readonly description: string;
  hooks: Partial<PluginHooks>;
}
