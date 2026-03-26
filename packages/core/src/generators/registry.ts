import type { ProjectManifest } from '../types/manifest.js';
import type { Pipeline } from '../types/pipeline.js';
import type { PipelineGenerator } from './base.js';
import type { GeneratorOptions } from './options.js';
import type { Plugin } from '../plugins/base.js';
import { runHook } from '../plugins/base.js';
import { NodeGenerator } from './node.js';
import { PythonGenerator } from './python.js';
import { GoGenerator } from './go.js';
import { JavaGenerator } from './java.js';
import { addDockerStage } from './docker.js';

const GENERATORS: PipelineGenerator[] = [
  new NodeGenerator(),
  new PythonGenerator(),
  new GoGenerator(),
  new JavaGenerator(),
];

/**
 * Pick the right generator for the manifest and produce a Pipeline.
 *
 * Plugin lifecycle:
 *   1. `afterAnalyze`  — plugins may enrich the manifest before generation
 *   2. base generation + Docker enrichment
 *   3. `beforeGenerate` — plugins may add/rearrange stages
 *   4. `afterGenerate`  — plugins may do final touch-ups (e.g., notifications)
 */
export function generatePipeline(
  manifest: ProjectManifest,
  options: GeneratorOptions = {},
  plugins: Plugin[] = [],
): Pipeline {
  if (manifest.projects.length === 0) {
    throw new Error('Cannot generate a pipeline: no projects detected in manifest');
  }

  // 1. afterAnalyze hooks
  const enrichedManifest = runHook(plugins, 'afterAnalyze', manifest);

  // Primary language = the language of the first detected project
  const primaryLanguage = enrichedManifest.projects[0].language;

  const generator = GENERATORS.find((g) => matchesLanguage(g.name, primaryLanguage));
  if (!generator) {
    throw new Error(
      `No generator available for language "${primaryLanguage}". ` +
      `Supported: ${GENERATORS.map((g) => g.name).join(', ')}`,
    );
  }

  // 2. Base generation
  let pipeline = generator.generate(enrichedManifest, options);

  // Enrich with a Docker stage if any project has a Dockerfile (unless explicitly skipped)
  const hasDocker = enrichedManifest.projects.some((p) => p.hasDockerfile);
  if (hasDocker && !options.skipDockerPush) {
    const lastStage = pipeline.stages[pipeline.stages.length - 1]?.name;
    pipeline = addDockerStage(pipeline, { dependsOn: lastStage });
  }

  // 3. beforeGenerate hooks
  pipeline = runHook(plugins, 'beforeGenerate', pipeline);

  // 4. afterGenerate hooks
  pipeline = runHook(plugins, 'afterGenerate', pipeline);

  return pipeline;
}

function matchesLanguage(generatorName: string, language: string): boolean {
  switch (generatorName) {
    case 'node':   return language === 'typescript' || language === 'javascript';
    case 'python': return language === 'python';
    case 'go':     return language === 'go';
    case 'java':   return language === 'java' || language === 'kotlin';
    default:       return false;
  }
}
