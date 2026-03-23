import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { analyzeRepo } from '../../src/analyzers/registry.js';
import { PythonGenerator } from '../../src/generators/python.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

describe('PythonGenerator', () => {
  it('generates a pipeline for python-fastapi', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));
    const pipeline = new PythonGenerator().generate(manifest);

    expect(pipeline.name).toContain('python-fastapi');
    expect(pipeline.permissions?.default).toBe('read-all');
  });

  it('has lint → test dependency', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));
    const pipeline = new PythonGenerator().generate(manifest);

    const testStage = pipeline.stages.find((s) => s.name === 'test');
    expect(testStage?.dependsOn).toContain('lint');
  });

  it('runs tests against Python 3.10, 3.11, 3.12 matrix', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));
    const pipeline = new PythonGenerator().generate(manifest);

    const testStage = pipeline.stages.find((s) => s.name === 'test')!;
    expect(testStage.jobs[0].matrix?.dimensions['python-version']).toEqual(['3.10', '3.11', '3.12']);
  });

  it('includes a secret scanning step', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));
    const pipeline = new PythonGenerator().generate(manifest);

    const lintJob = pipeline.stages.find((s) => s.name === 'lint')!.jobs[0];
    expect(lintJob.steps.some((s) => s.action?.includes('gitleaks'))).toBe(true);
  });

  it('uses pytest for the python-fastapi fixture', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));
    const pipeline = new PythonGenerator().generate(manifest);

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    expect(testJob.steps.some((s) => s.run?.includes('pytest'))).toBe(true);
  });

  it('includes a build stage for the wheel artifact', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));
    const pipeline = new PythonGenerator().generate(manifest);

    expect(pipeline.stages.some((s) => s.name === 'build')).toBe(true);
  });

  it('all action steps have SHA pins', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));
    const pipeline = new PythonGenerator().generate(manifest);

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
});
