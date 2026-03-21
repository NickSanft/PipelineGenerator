import { join, relative, resolve } from 'node:path';
import type { ProjectDescriptor, ProjectManifest } from '../types/manifest.js';
import type { Analyzer } from './base.js';
import { NodeAnalyzer } from './node.js';
import { PythonAnalyzer } from './python.js';
import { GoAnalyzer } from './go.js';
import { detectDocker, dockerArtifacts } from './docker.js';
import { detectDeploymentTargets } from './deployment.js';
import { analyzeVCS } from './vcs.js';
import { readJsonFile, fileExists } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import fg from 'fast-glob';

interface PackageJsonWorkspaces {
  workspaces?: string[] | { packages: string[] };
}

/** All registered language analyzers, in priority order */
const LANGUAGE_ANALYZERS: Analyzer[] = [
  new NodeAnalyzer(),
  new PythonAnalyzer(),
  new GoAnalyzer(),
];

export async function analyzeRepo(repoRoot: string): Promise<ProjectManifest> {
  const absoluteRoot = resolve(repoRoot);

  logger.debug(`Starting analysis of ${absoluteRoot}`);

  const projectRoots = await discoverProjectRoots(absoluteRoot);
  logger.debug(`Discovered ${projectRoots.length} project root(s)`);

  const projects: ProjectDescriptor[] = [];
  for (const projectRoot of projectRoots) {
    const descriptor = await analyzeProject(projectRoot, absoluteRoot);
    if (descriptor) {
      projects.push(descriptor);
    }
  }

  const vcs = await analyzeVCS(absoluteRoot);

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
async function discoverProjectRoots(repoRoot: string): Promise<string[]> {
  // Node monorepo with workspaces
  const pkg = await readJsonFile<PackageJsonWorkspaces>(join(repoRoot, 'package.json'));
  if (pkg?.workspaces) {
    const patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages;
    const roots = await expandWorkspaceGlobs(repoRoot, patterns);
    if (roots.length > 0) {
      logger.debug(`Detected Node monorepo with ${roots.length} workspace(s)`);
      return roots;
    }
  }

  // Multi-language monorepo: look for top-level dirs that each have a project marker
  const topLevelDirs = await fg('*/', {
    cwd: repoRoot,
    onlyDirectories: true,
    ignore: ['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__'],
  });

  if (topLevelDirs.length >= 2) {
    const multiRoots: string[] = [];
    for (const dir of topLevelDirs) {
      const fullPath = join(repoRoot, dir);
      const hasProject = await isProjectRoot(fullPath);
      if (hasProject) multiRoots.push(fullPath);
    }
    if (multiRoots.length >= 2) {
      logger.debug(`Detected multi-language monorepo with ${multiRoots.length} project(s)`);
      return multiRoots;
    }
  }

  return [repoRoot];
}

async function expandWorkspaceGlobs(repoRoot: string, patterns: string[]): Promise<string[]> {
  const dirs = await fg(
    patterns.map((p) => (p.endsWith('/') ? p : `${p}/`)),
    {
      cwd: repoRoot,
      onlyDirectories: true,
      ignore: ['node_modules/**'],
    },
  );
  return dirs.map((d) => join(repoRoot, d));
}

async function isProjectRoot(dir: string): Promise<boolean> {
  for (const analyzer of LANGUAGE_ANALYZERS) {
    if (await analyzer.detect(dir)) return true;
  }
  return false;
}

async function analyzeProject(
  projectRoot: string,
  repoRoot: string,
): Promise<ProjectDescriptor | null> {
  for (const analyzer of LANGUAGE_ANALYZERS) {
    if (!(await analyzer.detect(projectRoot))) continue;

    logger.debug(`Using ${analyzer.name} analyzer for ${projectRoot}`);

    try {
      const descriptor = await analyzer.analyze(projectRoot);

      // Enrich with Docker info
      const dockerInfo = await detectDocker(projectRoot);
      descriptor.hasDockerfile = dockerInfo.hasDockerfile;
      if (dockerInfo.hasDockerfile) {
        descriptor.artifacts = [...new Set([...descriptor.artifacts, ...dockerArtifacts(dockerInfo)])];
      }

      // Enrich with deployment targets
      descriptor.deploymentTargets = await detectDeploymentTargets(projectRoot);

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
