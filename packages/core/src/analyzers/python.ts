import { join } from 'node:path';
import type { Analyzer } from './base.js';
import type { ProjectDescriptor, ArtifactType } from '../types/manifest.js';
import type { FileSystem } from '../utils/fs-adapter.js';

// Minimal types for the parts of pyproject.toml we care about
interface PyprojectToml {
  project?: {
    name?: string;
    dependencies?: string[];
    'optional-dependencies'?: Record<string, string[]>;
  };
  tool?: {
    poetry?: {
      name?: string;
      dependencies?: Record<string, unknown>;
      group?: Record<string, { dependencies?: Record<string, unknown> }>;
    };
    pytest?: {
      'ini_options'?: Record<string, unknown>;
    };
    ruff?: Record<string, unknown>;
    hatch?: Record<string, unknown>;
  };
  'build-system'?: {
    'build-backend'?: string;
  };
}

const FRAMEWORK_DEPS: Record<string, string> = {
  fastapi: 'fastapi',
  django: 'django',
  flask: 'flask',
  starlette: 'starlette',
  tornado: 'tornado',
  aiohttp: 'aiohttp',
  litestar: 'litestar',
};

function extractPackageName(dep: string): string {
  // "fastapi>=0.110.0" → "fastapi", "uvicorn[standard]>=0.29.0" → "uvicorn"
  return dep.toLowerCase().split(/[>=<!\[; ]/)[0].trim().replace(/-/g, '-');
}

export class PythonAnalyzer implements Analyzer {
  readonly name = 'python';

  async detect(repoRoot: string, fs: FileSystem): Promise<boolean> {
    if (await fs.anyFileExists(repoRoot, ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'])) {
      return true;
    }
    // Fallback: any .py file in the root (tutorial / script repos)
    const pyFiles = await fs.glob('*.py', { cwd: repoRoot });
    return pyFiles.length > 0;
  }

  async analyze(repoRoot: string, fs: FileSystem): Promise<ProjectDescriptor> {
    let name = 'unknown';
    let framework: string | undefined;
    let packageManager = 'pip';
    let testRunner: string | undefined;
    let buildTool: string | undefined;

    if (await fs.fileExists(join(repoRoot, 'pyproject.toml'))) {
      const result = await this.analyzePyproject(repoRoot, fs);
      name = result.name ?? name;
      framework = result.framework;
      packageManager = result.packageManager;
      testRunner = result.testRunner;
      buildTool = result.buildTool;
    } else if (await fs.fileExists(join(repoRoot, 'setup.py'))) {
      const result = await this.analyzeSetupPy(repoRoot, fs);
      name = result.name ?? name;
      framework = result.framework;
    }

    // Detect test runner from config files if not found yet
    if (!testRunner) {
      testRunner = await this.detectTestRunner(repoRoot, fs);
    }

    const artifacts = this.detectArtifacts(buildTool, packageManager);

    return {
      name,
      path: '.',
      language: 'python',
      framework,
      packageManager,
      testRunner,
      buildTool,
      hasDockerfile: false,
      deploymentTargets: [],
      artifacts,
    };
  }

  private async analyzePyproject(repoRoot: string, fs: FileSystem): Promise<{
    name?: string;
    framework?: string;
    packageManager: string;
    testRunner?: string;
    buildTool?: string;
  }> {
    const content = await fs.readTextFile(join(repoRoot, 'pyproject.toml'));
    if (!content) return { packageManager: 'pip' };

    let toml: PyprojectToml;
    try {
      const { parse } = await import('smol-toml');
      toml = parse(content) as PyprojectToml;
    } catch {
      return { packageManager: 'pip' };
    }

    const isPoetry = toml.tool?.poetry !== undefined;
    const packageManager = isPoetry ? 'poetry' : 'pip';

    const name = toml.project?.name ?? toml.tool?.poetry?.name;

    // Collect all dependency strings
    const allDeps: string[] = [];
    if (toml.project?.dependencies) allDeps.push(...toml.project.dependencies);
    if (toml.project?.['optional-dependencies']) {
      for (const group of Object.values(toml.project['optional-dependencies'])) {
        allDeps.push(...group);
      }
    }
    if (isPoetry && toml.tool?.poetry?.dependencies) {
      allDeps.push(...Object.keys(toml.tool.poetry.dependencies));
    }

    const framework = this.detectFrameworkFromDeps(allDeps);

    // Detect test runner
    let testRunner: string | undefined;
    if (toml.tool?.pytest) {
      testRunner = 'pytest';
    } else if (allDeps.some((d) => extractPackageName(d) === 'pytest')) {
      testRunner = 'pytest';
    }

    // Detect build backend
    let buildTool: string | undefined;
    const backend = toml['build-system']?.['build-backend'] ?? '';
    if (backend.includes('hatchling')) buildTool = 'hatch';
    else if (backend.includes('poetry')) buildTool = 'poetry';
    else if (backend.includes('flit')) buildTool = 'flit';
    else if (backend.includes('setuptools')) buildTool = 'setuptools';

    return { name, framework, packageManager, testRunner, buildTool };
  }

  private async analyzeSetupPy(repoRoot: string, fs: FileSystem): Promise<{
    name?: string;
    framework?: string;
  }> {
    const content = await fs.readTextFile(join(repoRoot, 'setup.py'));
    if (!content) return {};
    const nameMatch = content.match(/name\s*=\s*['"]([^'"]+)['"]/);
    const installRequires = content.match(/install_requires\s*=\s*\[([^\]]+)\]/s);
    const deps = installRequires ? installRequires[1].split(',').map((d) => d.trim().replace(/['"]/g, '')) : [];
    return {
      name: nameMatch?.[1],
      framework: this.detectFrameworkFromDeps(deps),
    };
  }

  private detectFrameworkFromDeps(deps: string[]): string | undefined {
    const normalized = deps.map(extractPackageName);
    for (const [dep, framework] of Object.entries(FRAMEWORK_DEPS)) {
      if (normalized.includes(dep)) return framework;
    }
    return undefined;
  }

  private async detectTestRunner(repoRoot: string, fs: FileSystem): Promise<string | undefined> {
    if (await fs.anyFileExists(repoRoot, ['pytest.ini', 'conftest.py', 'tox.ini'])) return 'pytest';
    if (await fs.fileExists(join(repoRoot, 'tox.ini'))) return 'tox';
    return undefined;
  }

  private detectArtifacts(buildTool: string | undefined, packageManager: string): ArtifactType[] {
    if (buildTool || packageManager === 'poetry') return ['wheel'];
    return [];
  }
}
