import type { Pipeline } from '../types/pipeline.js';

export interface PipelineRenderer {
  readonly platform: string;
  /** Serialize the pipeline to a valid YAML string */
  render(pipeline: Pipeline): string;
  /** Returns the file path where the output should be written */
  outputPath(pipeline: Pipeline): string;
}
