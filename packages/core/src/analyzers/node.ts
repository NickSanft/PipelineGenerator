import { join } from 'node:path';
import type { Analyzer } from './base.js';
import type { ProjectDescriptor, Language, ArtifactType } from '../types/manifest.js';
import type { FileSystem } from '../utils/fs-adapter.js';

interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  publishConfig?: Record<string, unknown>;
}

const FRAMEWORK_DEPS: Record<string, string> = {
  next: 'nextjs',
  nuxt: 'nuxt',
  express: 'express',
  fastify: 'fastify',
  '@nestjs/core': 'nestjs',
  hapi: 'hapi',
  koa: 'koa',
  '@remix-run/node': 'remix',
  remix: 'remix',
  vue: 'vue',
  react: 'react',
  svelte: 'svelte',
  '@angular/core': 'angular',
};

const TEST_RUNNER_DEPS: Record<string, string> = {
  vitest: 'vitest',
  jest: 'jest',
  '@jest/core': 'jest',
  mocha: 'mocha',
  jasmine: 'jasmine',
  ava: 'ava',
};

const BUILD_TOOL_DEPS: Record<string, string> = {
  vite: 'vite',
  webpack: 'webpack',
  esbuild: 'esbuild',
  rollup: 'rollup',
  parcel: 'parcel',
  turbo: 'turbopack',
};

export class NodeAnalyzer implements Analyzer {
  readonly name = 'node';

  async detect(repoRoot: string, fs: FileSystem): Promise<boolean> {
    return fs.fileExists(join(repoRoot, 'package.json'));
  }

  async analyze(repoRoot: string, fs: FileSystem): Promise<ProjectDescriptor> {
    const pkg = await fs.readJsonFile<PackageJson>(join(repoRoot, 'package.json'));
    const allDeps: Record<string, string> = {
      ...pkg?.dependencies,
      ...pkg?.devDependencies,
    };

    const language = await this.detectLanguage(repoRoot, allDeps, fs);
    const framework = this.detectFramework(allDeps);
    const packageManager = await this.detectPackageManager(repoRoot, fs);
    const testRunner = this.detectTestRunner(pkg?.scripts ?? {}, allDeps);
    const buildTool = this.detectBuildTool(pkg?.scripts ?? {}, allDeps, language);
    const artifacts = this.detectArtifacts(pkg);

    return {
      name: pkg?.name ?? 'unknown',
      path: '.',
      language,
      framework,
      packageManager,
      testRunner,
      buildTool,
      hasDockerfile: false,
      deploymentTargets: [],
      artifacts,
      raw: { scripts: pkg?.scripts ?? {} },
    };
  }

  private async detectLanguage(
    repoRoot: string,
    deps: Record<string, string>,
    fs: FileSystem,
  ): Promise<Language> {
    if ('typescript' in deps) return 'typescript';
    if (await fs.fileExists(join(repoRoot, 'tsconfig.json'))) return 'typescript';
    return 'javascript';
  }

  private detectFramework(deps: Record<string, string>): string | undefined {
    for (const [dep, framework] of Object.entries(FRAMEWORK_DEPS)) {
      if (dep in deps) return framework;
    }
    return undefined;
  }

  private async detectPackageManager(repoRoot: string, fs: FileSystem): Promise<string> {
    if (await fs.fileExists(join(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await fs.fileExists(join(repoRoot, 'yarn.lock'))) return 'yarn';
    return 'npm';
  }

  private detectTestRunner(
    scripts: Record<string, string>,
    deps: Record<string, string>,
  ): string | undefined {
    const testScript = scripts['test'] ?? '';
    if (testScript.includes('vitest')) return 'vitest';
    if (testScript.includes('jest')) return 'jest';
    if (testScript.includes('mocha')) return 'mocha';
    for (const [dep, runner] of Object.entries(TEST_RUNNER_DEPS)) {
      if (dep in deps) return runner;
    }
    return undefined;
  }

  private detectBuildTool(
    scripts: Record<string, string>,
    deps: Record<string, string>,
    language: Language,
  ): string | undefined {
    const buildScript = scripts['build'] ?? '';
    if (buildScript.includes('next build')) return 'next';
    if (buildScript.includes('vite build')) return 'vite';
    if (buildScript.includes('webpack')) return 'webpack';
    if (buildScript.includes('tsc')) return 'tsc';
    if (buildScript.includes('esbuild')) return 'esbuild';
    for (const [dep, tool] of Object.entries(BUILD_TOOL_DEPS)) {
      if (dep in deps) return tool;
    }
    if (language === 'typescript') return 'tsc';
    return undefined;
  }

  private detectArtifacts(pkg: PackageJson | null): ArtifactType[] {
    if (!pkg) return [];
    const isPublishable = !pkg.private && (pkg.publishConfig !== undefined || pkg.name !== undefined);
    return isPublishable ? ['npm-package'] : [];
  }
}
