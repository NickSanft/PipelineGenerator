import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { analyzeRepo } from '../../src/analyzers/registry.js';
import { generatePipeline } from '../../src/generators/registry.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

describe('generatePipeline()', () => {
  it('selects the Node generator for a TypeScript project', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = generatePipeline(manifest);
    expect(pipeline.stages.some((s) => s.name === 'test')).toBe(true);
  });

  it('selects the Python generator for a Python project', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));
    const pipeline = generatePipeline(manifest);
    expect(pipeline.stages.some((s) => s.name === 'lint')).toBe(true);
  });

  it('selects the Go generator for a Go project', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = generatePipeline(manifest);
    expect(pipeline.stages.some((s) => s.name === 'check')).toBe(true);
  });

  it('throws for an unsupported language', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    // Corrupt the manifest to simulate an unsupported language
    manifest.projects[0].language = 'rust';
    expect(() => generatePipeline(manifest)).toThrow('No generator available');
  });

  it('throws when manifest has no projects', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    manifest.projects = [];
    expect(() => generatePipeline(manifest)).toThrow('no projects detected');
  });
});
