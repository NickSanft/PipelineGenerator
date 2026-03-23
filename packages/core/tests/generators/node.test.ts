import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { analyzeRepo } from '../../src/analyzers/registry.js';
import { NodeGenerator } from '../../src/generators/node.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

describe('NodeGenerator', () => {
  it('generates a pipeline for node-basic', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const generator = new NodeGenerator();
    const pipeline = generator.generate(manifest);

    expect(pipeline.name).toContain('node-basic');
    expect(pipeline.triggers).toHaveLength(2);
    expect(pipeline.triggers[0].type).toBe('push');
    expect(pipeline.triggers[1].type).toBe('pull_request');
  });

  it('sets permissions to read-all by default', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest);
    expect(pipeline.permissions?.default).toBe('read-all');
  });

  it('includes a test stage with matrix', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest);

    const testStage = pipeline.stages.find((s) => s.name === 'test');
    expect(testStage).toBeDefined();
    const job = testStage!.jobs[0];
    expect(job.matrix?.dimensions['node-version']).toEqual(['20', '22']);
  });

  it('includes a SHA-pinned checkout step', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest);

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    const checkoutStep = testJob.steps.find((s) => s.action === 'actions/checkout');
    expect(checkoutStep).toBeDefined();
    // Must be a SHA, not a tag
    expect(checkoutStep!.actionVersion).toMatch(/^[0-9a-f]{40}$/);
  });

  it('includes a secret scanning step', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest);

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    const scanStep = testJob.steps.find((s) => s.action?.includes('gitleaks'));
    expect(scanStep).toBeDefined();
  });

  it('includes a security audit step', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest);

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    const auditStep = testJob.steps.find((s) => s.run?.includes('audit'));
    expect(auditStep).toBeDefined();
  });

  it('includes a build stage when buildTool is detected', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest);

    const buildStage = pipeline.stages.find((s) => s.name === 'build');
    expect(buildStage).toBeDefined();
    expect(buildStage!.dependsOn).toContain('test');
  });

  it('uses npm ci for npm package manager', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest);

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    const installStep = testJob.steps.find((s) => s.run?.includes('npm ci'));
    expect(installStep).toBeDefined();
  });

  it('uses npm cache config', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest);

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    expect(testJob.cache?.paths).toContain('~/.npm');
  });

  it('all action steps have SHA pins (no mutable tags)', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest);

    for (const stage of pipeline.stages) {
      for (const job of stage.jobs) {
        for (const step of job.steps) {
          if (step.type === 'action') {
            expect(step.actionVersion, `Step "${step.name}" is missing SHA pin`)
              .toMatch(/^[0-9a-f]{40}$/);
          }
        }
      }
    }
  });
});
