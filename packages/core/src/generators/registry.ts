import type { ProjectManifest } from '../types/manifest.js';
import type { Pipeline } from '../types/pipeline.js';
import type { PipelineGenerator } from './base.js';
import type { GeneratorOptions } from './options.js';
import { NodeGenerator } from './node.js';
import { PythonGenerator } from './python.js';
import { GoGenerator } from './go.js';
import { addDockerStage } from './docker.js';

const GENERATORS: PipelineGenerator[] = [
  new NodeGenerator(),
  new PythonGenerator(),
  new GoGenerator(),
];

/**
 * Pick the right generator for the manifest and produce a Pipeline.
 * Applies cross-cutting enrichments (Docker stage) afterwards.
 */
export function generatePipeline(manifest: ProjectManifest, options: GeneratorOptions = {}): Pipeline {
  if (manifest.projects.length === 0) {
    throw new Error('Cannot generate a pipeline: no projects detected in manifest');
  }

  // Primary language = the language of the first detected project
  const primaryLanguage = manifest.projects[0].language;

  const generator = GENERATORS.find((g) => matchesLanguage(g.name, primaryLanguage));
  if (!generator) {
    throw new Error(
      `No generator available for language "${primaryLanguage}". ` +
      `Supported: ${GENERATORS.map((g) => g.name).join(', ')}`,
    );
  }

  let pipeline = generator.generate(manifest, options);

  // Enrich with a Docker stage if any project has a Dockerfile (unless explicitly skipped)
  const hasDocker = manifest.projects.some((p) => p.hasDockerfile);
  if (hasDocker && !options.skipDockerPush) {
    const lastStage = pipeline.stages[pipeline.stages.length - 1]?.name;
    pipeline = addDockerStage(pipeline, { dependsOn: lastStage });
  }

  return pipeline;
}

function matchesLanguage(generatorName: string, language: string): boolean {
  switch (generatorName) {
    case 'node':   return language === 'typescript' || language === 'javascript';
    case 'python': return language === 'python';
    case 'go':     return language === 'go';
    default:       return false;
  }
}
