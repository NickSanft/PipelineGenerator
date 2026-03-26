import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { analyzeRepo } from '../../src/analyzers/registry.js';
import { CSharpGenerator } from '../../src/generators/csharp.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

describe('CSharpGenerator', () => {
  it('generates a pipeline for dotnet-webapi', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'dotnet-webapi'));
    const pipeline = new CSharpGenerator().generate(manifest);

    expect(pipeline.name).toContain('MyWebApi');
    expect(pipeline.permissions?.default).toBe('read-all');
  });

  it('has lint → test → build stage order', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'dotnet-webapi'));
    const pipeline = new CSharpGenerator().generate(manifest);

    const names = pipeline.stages.map((s) => s.name);
    expect(names).toContain('lint');
    expect(names).toContain('test');
    expect(names).toContain('build');
    expect(names.indexOf('lint')).toBeLessThan(names.indexOf('test'));
    expect(names.indexOf('test')).toBeLessThan(names.indexOf('build'));
  });

  it('uses dotnet commands', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'dotnet-webapi'));
    const pipeline = new CSharpGenerator().generate(manifest);

    const allRuns = pipeline.stages
      .flatMap((s) => s.jobs)
      .flatMap((j) => j.steps)
      .filter((s) => s.type === 'run')
      .map((s) => s.run ?? '');

    expect(allRuns.some((r) => r.includes('dotnet test'))).toBe(true);
    expect(allRuns.some((r) => r.includes('dotnet build') || r.includes('dotnet publish'))).toBe(true);
  });

  it('uses a .NET matrix of 8.0 and 9.0 in the test stage', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'dotnet-webapi'));
    const pipeline = new CSharpGenerator().generate(manifest);

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    expect(testJob.matrix?.dimensions['dotnet-version']).toContain('8.0');
    expect(testJob.matrix?.dimensions['dotnet-version']).toContain('9.0');
  });

  it('all action steps have SHA pins', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'dotnet-webapi'));
    const pipeline = new CSharpGenerator().generate(manifest);

    for (const stage of pipeline.stages) {
      for (const job of stage.jobs) {
        for (const step of job.steps) {
          if (step.type === 'action') {
            expect(step.actionVersion, `Step "${step.name}" missing SHA pin`)
              .toMatch(/^[0-9a-f]{40}$/);
          }
        }
      }
    }
  });

  it('includes secret scanning', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'dotnet-webapi'));
    const pipeline = new CSharpGenerator().generate(manifest);

    const allSteps = pipeline.stages.flatMap((s) => s.jobs).flatMap((j) => j.steps);
    expect(allSteps.some((s) => s.action?.includes('gitleaks'))).toBe(true);
  });

  it('includes dependency audit', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'dotnet-webapi'));
    const pipeline = new CSharpGenerator().generate(manifest);

    const allRuns = pipeline.stages
      .flatMap((s) => s.jobs)
      .flatMap((j) => j.steps)
      .filter((s) => s.type === 'run')
      .map((s) => s.run ?? '');

    expect(allRuns.some((r) => r.includes('dotnet list package --vulnerable'))).toBe(true);
  });

  it('includes coverage collection when threshold is set', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'dotnet-webapi'));
    const pipeline = new CSharpGenerator().generate(manifest, { coverageThreshold: 80 });

    const allRuns = pipeline.stages
      .flatMap((s) => s.jobs)
      .flatMap((j) => j.steps)
      .filter((s) => s.type === 'run')
      .map((s) => s.run ?? '');

    expect(allRuns.some((r) => r.includes('XPlat Code Coverage'))).toBe(true);
  });
});
