import type { ProjectManifest } from '../types/manifest.js';
import type { Pipeline } from '../types/pipeline.js';

/**
 * Hook points in the generation lifecycle.
 * Plugins implement any subset of these.
 */
export interface PluginHooks {
  /**
   * Called after the repository has been analysed but before generation starts.
   * Enrich or modify the manifest (e.g., add extra deploy targets or metadata).
   */
  afterAnalyze(manifest: ProjectManifest): ProjectManifest;

  /**
   * Called after the base pipeline is generated.
   * Add or rearrange stages/jobs here.
   */
  beforeGenerate(pipeline: Pipeline): Pipeline;

  /**
   * Called after all generation is complete — final touch-ups only.
   * Use this for cross-cutting concerns like notification steps.
   */
  afterGenerate(pipeline: Pipeline): Pipeline;
}

export interface Plugin {
  readonly name: string;
  readonly description: string;
  readonly hooks: Partial<PluginHooks>;
}

/**
 * Thread `value` through the named hook of every plugin in order.
 * Each plugin receives the output of the previous, enabling composition.
 */
export function runHook(plugins: Plugin[], hook: 'afterAnalyze', value: ProjectManifest): ProjectManifest;
export function runHook(plugins: Plugin[], hook: 'beforeGenerate' | 'afterGenerate', value: Pipeline): Pipeline;
export function runHook(
  plugins: Plugin[],
  hook: keyof PluginHooks,
  value: ProjectManifest | Pipeline,
): ProjectManifest | Pipeline {
  let current = value;
  for (const plugin of plugins) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = plugin.hooks[hook] as ((v: any) => any) | undefined;
    if (fn) current = fn(current) as typeof value;
  }
  return current;
}
