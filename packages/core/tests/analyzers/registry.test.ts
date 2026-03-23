import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { analyzeRepo } from '../../src/analyzers/registry.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

describe('analyzeRepo()', () => {
  it('produces a manifest for node-basic', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));

    expect(manifest.projects).toHaveLength(1);
    const [project] = manifest.projects;
    expect(project.language).toBe('typescript');
    expect(project.framework).toBe('express');
    expect(project.path).toBe('.');
    expect(manifest.vcs.defaultBranch).toBeTruthy();
  });

  it('produces a manifest for python-fastapi', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));

    expect(manifest.projects).toHaveLength(1);
    expect(manifest.projects[0].language).toBe('python');
    expect(manifest.projects[0].framework).toBe('fastapi');
  });

  it('produces a manifest for go-service', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));

    expect(manifest.projects).toHaveLength(1);
    expect(manifest.projects[0].language).toBe('go');
    expect(manifest.projects[0].name).toBe('go-service');
  });

  it('detects multiple workspaces in node-monorepo', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-monorepo'));

    // Should find packages/api and packages/web
    expect(manifest.projects.length).toBeGreaterThanOrEqual(2);
    const langs = manifest.projects.map((p) => p.language);
    expect(langs).toContain('typescript');
  });

  it('includes root path in manifest', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    expect(manifest.root).toContain('node-basic');
  });
});
