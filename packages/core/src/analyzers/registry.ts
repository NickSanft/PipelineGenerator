import { join, relative, resolve } from 'node:path';
import type { ProjectDescriptor, ProjectManifest, VCSInfo } from '../types/manifest.js';
import type { Analyzer } from './base.js';
import type { FileSystem } from '../utils/fs-adapter.js';
import { LocalFileSystem } from '../utils/fs-adapter.js';
import { NodeAnalyzer } from './node.js';
import { PythonAnalyzer } from './python.js';
import { GoAnalyzer } from './go.js';
import { JavaAnalyzer } from './java.js';
import { CSharpAnalyzer } from './csharp.js';
import { detectDocker, dockerArtifacts } from './docker.js';
import { detectDeploymentTargets } from './deployment.js';
import { analyzeVCS } from './vcs.js';
import { logger } from '../utils/logger.js';

interface PackageJsonWorkspaces {
  workspaces?: string[] | { packages: string[] };
}

/** All registered language analyzers, in priority order */
const LANGUAGE_ANALYZERS: Analyzer[] = [
  new NodeAnalyzer(),
  new PythonAnalyzer(),
  new GoAnalyzer(),
  new JavaAnalyzer(),
  new CSharpAnalyzer(),
];

/**
 * Analyze a repository.
 *
 * - `fs` defaults to `LocalFileSystem`; pass a `GitHubFileSystem` for web use.
 * - `vcsInfo` is optional; if omitted the local git analyzeVCS() is used
 *   (only meaningful for LocalFileSystem).
 * - For non-local filesystems, `repoRoot` should be `'/'` (or the subdir path
 *   as returned by `parseGitHubUrl`); `resolve()` is skipped so paths don't
 *   get the process CWD prepended.
 */
export async function analyzeRepo(
  repoRoot: string,
  fs: FileSystem = new LocalFileSystem(),
  vcsInfo?: VCSInfo,
): Promise<ProjectManifest> {
  const absoluteRoot = fs instanceof LocalFileSystem ? resolve(repoRoot) : repoRoot;

  logger.debug(`Starting analysis of ${absoluteRoot}`);

  const projectRoots = await discoverProjectRoots(absoluteRoot, fs);
  logger.debug(`Discovered ${projectRoots.length} project root(s)`);

  const projects: ProjectDescriptor[] = [];
  for (const projectRoot of projectRoots) {
    const descriptor = await analyzeProject(projectRoot, absoluteRoot, fs);
    if (descriptor) {
      projects.push(descriptor);
    }
  }

  const vcs = vcsInfo ?? (fs instanceof LocalFileSystem ? await analyzeVCS(absoluteRoot) : { defaultBranch: 'main', hasReleaseBranches: false });

  return {
    root: absoluteRoot,
    projects,
    vcs,
    raw: {},
  };
}

/**
 * Discover all project roots within the repo.
 * Supports Node workspaces. Falls back to the repo root itself.
 */
async function discoverProjectRoots(repoRoot: string, fs: FileSystem): Promise<string[]> {
  // Node monorepo with workspaces
  const pkg = await fs.readJsonFile<PackageJsonWorkspaces>(join(repoRoot, 'package.json'));
  if (pkg?.workspaces) {
    const patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages;
    const roots = await expandWorkspaceGlobs(repoRoot, patterns, fs);
    if (roots.length > 0) {
      logger.debug(`Detected Node monorepo with ${roots.length} workspace(s)`);
      return roots;
    }
  }

  // Multi-language monorepo: look for top-level dirs that each have a project marker
  const topLevelDirs = await fs.glob('*/', {
    cwd: repoRoot,
    onlyDirectories: true,
    ignore: ['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__'],
  });

  if (topLevelDirs.length >= 2) {
    const multiRoots: string[] = [];
    for (const dir of topLevelDirs) {
      const fullPath = join(repoRoot, dir);
      const hasProject = await isProjectRoot(fullPath, fs);
      if (hasProject) multiRoots.push(fullPath);
    }
    if (multiRoots.length >= 2) {
      logger.debug(`Detected multi-language monorepo with ${multiRoots.length} project(s)`);
      return multiRoots;
    }
  }

  return [repoRoot];
}

async function expandWorkspaceGlobs(repoRoot: string, patterns: string[], fs: FileSystem): Promise<string[]> {
  // Glob each pattern separately and merge (FileSystem.glob accepts a single pattern string)
  const allDirs: string[] = [];
  for (const p of patterns) {
    const pattern = p.endsWith('/') ? p : `${p}/`;
    const dirs = await fs.glob(pattern, {
      cwd: repoRoot,
      onlyDirectories: true,
      ignore: ['node_modules/**'],
    });
    allDirs.push(...dirs);
  }
  return allDirs.map((d) => join(repoRoot, d));
}

async function isProjectRoot(dir: string, fs: FileSystem): Promise<boolean> {
  for (const analyzer of LANGUAGE_ANALYZERS) {
    if (await analyzer.detect(dir, fs)) return true;
  }
  return false;
}

async function analyzeProject(
  projectRoot: string,
  repoRoot: string,
  fs: FileSystem,
): Promise<ProjectDescriptor | null> {
  for (const analyzer of LANGUAGE_ANALYZERS) {
    if (!(await analyzer.detect(projectRoot, fs))) continue;

    logger.debug(`Using ${analyzer.name} analyzer for ${projectRoot}`);

    try {
      const descriptor = await analyzer.analyze(projectRoot, fs);

      // Enrich with Docker info
      const dockerInfo = await detectDocker(projectRoot, fs);
      descriptor.hasDockerfile = dockerInfo.hasDockerfile;
      if (dockerInfo.hasDockerfile) {
        descriptor.artifacts = [...new Set([...descriptor.artifacts, ...dockerArtifacts(dockerInfo)])];
      }

      // Enrich with deployment targets
      descriptor.deploymentTargets = await detectDeploymentTargets(projectRoot, fs);

      // Set path relative to repo root
      const relPath = relative(repoRoot, projectRoot);
      descriptor.path = relPath || '.';

      return descriptor;
    } catch (err) {
      logger.warn(`Analyzer ${analyzer.name} failed for ${projectRoot}: ${String(err)}`);
      return null;
    }
  }

  logger.debug(`No analyzer matched ${projectRoot}`);
  return null;
}
