import { z } from 'zod';
import type { Plugin } from './base.js';
import type { FileSystem } from '../utils/fs-adapter.js';
import { LocalFileSystem } from '../utils/fs-adapter.js';
import { createSonarQubePlugin } from './sonarqube.js';
import { createSlackNotifyPlugin } from './slack-notify.js';
import { createDependencyAuditPlugin } from './dependency-audit.js';
import { createDockerBuildPlugin } from './docker-build.js';

// ── Config schema ─────────────────────────────────────────────────────────────

const PipelineGenRcSchema = z.object({
  target: z.enum(['github-actions', 'gitlab-ci']).optional(),
  plugins: z.array(z.string()).optional().default([]),
  config: z.record(z.unknown()).optional().default({}),
});

export type PipelineGenRc = z.infer<typeof PipelineGenRcSchema>;

// ── Built-in plugin registry ──────────────────────────────────────────────────

type PluginFactory = (config: unknown) => Plugin;

const BUILT_IN_PLUGINS: Record<string, PluginFactory> = {
  sonarqube: (cfg) => createSonarQubePlugin(cfg as Parameters<typeof createSonarQubePlugin>[0]),
  'slack-notify': (cfg) => createSlackNotifyPlugin(cfg as Parameters<typeof createSlackNotifyPlugin>[0]),
  'dependency-audit': (cfg) => createDependencyAuditPlugin(cfg as Parameters<typeof createDependencyAuditPlugin>[0] | undefined),
  'docker-build': (cfg) => createDockerBuildPlugin(cfg as Parameters<typeof createDockerBuildPlugin>[0] | undefined),
};

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Read `.pipelinegenrc.json` from `repoRoot` and instantiate configured plugins.
 *
 * Unknown plugin names are warned about and skipped (no hard failure — the
 * pipeline is still generated without them).
 */
export async function loadPlugins(
  repoRoot: string,
  fs: FileSystem = new LocalFileSystem(),
): Promise<{ plugins: Plugin[]; rc: PipelineGenRc | null }> {
  const raw = await fs.readJsonFile<unknown>(`${repoRoot}/.pipelinegenrc.json`);
  if (raw === null) {
    return { plugins: [], rc: null };
  }

  const parsed = PipelineGenRcSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `[pipeline-gen] .pipelinegenrc.json is invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
    return { plugins: [], rc: null };
  }

  const rc = parsed.data;
  const plugins: Plugin[] = [];

  for (const name of rc.plugins) {
    const factory = BUILT_IN_PLUGINS[name];
    if (!factory) {
      console.warn(`[pipeline-gen] Unknown plugin "${name}" — skipping. Available: ${Object.keys(BUILT_IN_PLUGINS).join(', ')}`);
      continue;
    }
    const pluginConfig = (rc.config as Record<string, unknown>)[name] ?? {};
    plugins.push(factory(pluginConfig));
  }

  return { plugins, rc };
}
