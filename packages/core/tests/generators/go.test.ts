import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { analyzeRepo } from '../../src/analyzers/registry.js';
import { GoGenerator } from '../../src/generators/go.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

describe('GoGenerator', () => {
  it('generates a pipeline for go-service', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest);

    expect(pipeline.name).toContain('go-service');
    expect(pipeline.permissions?.default).toBe('read-all');
  });

  it('has check → test dependency', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest);

    const testStage = pipeline.stages.find((s) => s.name === 'test');
    expect(testStage?.dependsOn).toContain('check');
  });

  it('includes go vet in the check stage', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest);

    const checkJob = pipeline.stages.find((s) => s.name === 'check')!.jobs[0];
    expect(checkJob.steps.some((s) => s.run === 'go vet ./...')).toBe(true);
  });

  it('includes golangci-lint in the check stage', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest);

    const checkJob = pipeline.stages.find((s) => s.name === 'check')!.jobs[0];
    expect(checkJob.steps.some((s) => s.run?.includes('golangci-lint run'))).toBe(true);
  });

  it('runs tests with -race flag', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest);

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    expect(testJob.steps.some((s) => s.run?.includes('-race'))).toBe(true);
  });

  it('includes a build stage for binary artifacts', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest);

    expect(pipeline.stages.some((s) => s.name === 'build')).toBe(true);
  });

  it('includes govulncheck in the build stage', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest);

    const buildJob = pipeline.stages.find((s) => s.name === 'build')!.jobs[0];
    expect(buildJob.steps.some((s) => s.run?.includes('govulncheck'))).toBe(true);
  });

  it('includes a secret scanning step', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest);

    const checkJob = pipeline.stages.find((s) => s.name === 'check')!.jobs[0];
    expect(checkJob.steps.some((s) => s.action?.includes('gitleaks'))).toBe(true);
  });

  it('all action steps have SHA pins', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest);

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
