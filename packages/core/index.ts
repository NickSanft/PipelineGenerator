// ── Types ──────────────────────────────────────────────────────────────────────
export type {
  ProjectManifest,
  ProjectDescriptor,
  Language,
  DeployTarget,
  ArtifactType,
  VCSInfo,
} from './src/types/manifest.js';

export type {
  Pipeline,
  Stage,
  Job,
  Step,
  Trigger,
  CacheConfig,
  MatrixConfig,
  Permissions,
  PermissionLevel,
  Notification,
} from './src/types/pipeline.js';

// ── FileSystem adapter ─────────────────────────────────────────────────────────
export type { FileSystem } from './src/utils/fs-adapter.js';
export { LocalFileSystem } from './src/utils/fs-adapter.js';

// ── Analyzers ──────────────────────────────────────────────────────────────────
export { analyzeRepo } from './src/analyzers/registry.js';

// ── Generators ─────────────────────────────────────────────────────────────────
export { generatePipeline } from './src/generators/registry.js';
export { makeDecisions } from './src/generators/decisions.js';
export type { GeneratorOptions } from './src/generators/options.js';
export type { Decision } from './src/generators/decisions.js';

// ── Renderers ──────────────────────────────────────────────────────────────────
export { getRenderer } from './src/renderers/registry.js';
export type { SupportedPlatform } from './src/renderers/registry.js';

// ── Utils ──────────────────────────────────────────────────────────────────────
export { logger, setVerbose } from './src/utils/logger.js';
export { printManifestSummary, printDecisions, printOutputPath, printDiff } from './src/utils/display.js';
export { unifiedDiff } from './src/utils/diff.js';
