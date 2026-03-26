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

// ── FileSystem adapters ────────────────────────────────────────────────────────
export type { FileSystem } from './src/utils/fs-adapter.js';
export { LocalFileSystem } from './src/utils/fs-adapter.js';
export { GitHubFileSystem } from './src/utils/github-fs.js';
export { parseGitHubUrl } from './src/utils/github-url.js';
export type { GitHubRepoInfo } from './src/utils/github-url.js';

// ── Analyzers ──────────────────────────────────────────────────────────────────
export { analyzeRepo } from './src/analyzers/registry.js';
export { JavaAnalyzer } from './src/analyzers/java.js';
export { CSharpAnalyzer } from './src/analyzers/csharp.js';

// ── Generators ─────────────────────────────────────────────────────────────────
export { generatePipeline } from './src/generators/registry.js';
export { JavaGenerator } from './src/generators/java.js';
export { CSharpGenerator } from './src/generators/csharp.js';
export { makeDecisions } from './src/generators/decisions.js';
export type { GeneratorOptions } from './src/generators/options.js';
export type { Decision } from './src/generators/decisions.js';

// ── Renderers ──────────────────────────────────────────────────────────────────
export { getRenderer } from './src/renderers/registry.js';
export type { SupportedPlatform } from './src/renderers/registry.js';

// ── Linter ─────────────────────────────────────────────────────────────────────
export type { LintRule, LintIssue, LintResult, LintSeverity, LintPlatform, LintLocation } from './src/linter/base.js';
export { buildSummary } from './src/linter/base.js';
export { lintYaml, detectPlatformFromPath } from './src/linter/runner.js';
export { unpinnedActionsRule } from './src/linter/rules/unpinned-actions.js';
export { missingTimeoutRule } from './src/linter/rules/missing-timeout.js';
export { missingPermissionsRule } from './src/linter/rules/missing-permissions.js';
export { missingCacheRule } from './src/linter/rules/missing-cache.js';
export { unsafeInstallRule } from './src/linter/rules/unsafe-install.js';
export { secretLeakRule } from './src/linter/rules/secret-leak.js';

// ── Plugins ────────────────────────────────────────────────────────────────────
export type { Plugin, PluginHooks } from './src/plugins/base.js';
export { runHook } from './src/plugins/base.js';
export { createSonarQubePlugin } from './src/plugins/sonarqube.js';
export type { SonarQubeConfig } from './src/plugins/sonarqube.js';
export { createSlackNotifyPlugin } from './src/plugins/slack-notify.js';
export type { SlackNotifyConfig } from './src/plugins/slack-notify.js';
export { createDependencyAuditPlugin } from './src/plugins/dependency-audit.js';
export type { DependencyAuditConfig } from './src/plugins/dependency-audit.js';
export { createDockerBuildPlugin } from './src/plugins/docker-build.js';
export type { DockerBuildConfig } from './src/plugins/docker-build.js';
export { loadPlugins } from './src/plugins/loader.js';
export type { PipelineGenRc } from './src/plugins/loader.js';

// ── Utils ──────────────────────────────────────────────────────────────────────
export { logger, setVerbose } from './src/utils/logger.js';
export { printManifestSummary, printDecisions, printOutputPath, printDiff } from './src/utils/display.js';
export { unifiedDiff } from './src/utils/diff.js';
