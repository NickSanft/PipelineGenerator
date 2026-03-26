import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { analyzeRepo } from '../../src/analyzers/registry.js';
import { JavaGenerator } from '../../src/generators/java.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

describe('JavaGenerator — Maven', () => {
  it('generates a pipeline for java-maven', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'java-maven'));
    const pipeline = new JavaGenerator().generate(manifest);

    expect(pipeline.name).toContain('java-maven');
    expect(pipeline.permissions?.default).toBe('read-all');
  });

  it('has lint → test → build stage order', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'java-maven'));
    const pipeline = new JavaGenerator().generate(manifest);

    const names = pipeline.stages.map((s) => s.name);
    expect(names).toContain('lint');
    expect(names).toContain('test');
    expect(names).toContain('build');
    expect(names.indexOf('lint')).toBeLessThan(names.indexOf('test'));
    expect(names.indexOf('test')).toBeLessThan(names.indexOf('build'));
  });

  it('uses Maven commands', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'java-maven'));
    const pipeline = new JavaGenerator().generate(manifest);

    const allRuns = pipeline.stages
      .flatMap((s) => s.jobs)
      .flatMap((j) => j.steps)
      .filter((s) => s.type === 'run')
      .map((s) => s.run ?? '');

    expect(allRuns.some((r) => r.includes('mvn test'))).toBe(true);
    expect(allRuns.some((r) => r.includes('mvn package'))).toBe(true);
  });

  it('uses a Java matrix of 17 and 21 in the test stage', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'java-maven'));
    const pipeline = new JavaGenerator().generate(manifest);

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    expect(testJob.matrix?.dimensions['java-version']).toContain('17');
    expect(testJob.matrix?.dimensions['java-version']).toContain('21');
  });

  it('all action steps have SHA pins', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'java-maven'));
    const pipeline = new JavaGenerator().generate(manifest);

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
    const manifest = await analyzeRepo(join(FIXTURES, 'java-maven'));
    const pipeline = new JavaGenerator().generate(manifest);

    const allSteps = pipeline.stages.flatMap((s) => s.jobs).flatMap((j) => j.steps);
    expect(allSteps.some((s) => s.action?.includes('gitleaks'))).toBe(true);
  });
});

describe('JavaGenerator — Kotlin Gradle', () => {
  it('generates a pipeline for kotlin-gradle', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'kotlin-gradle'));
    const pipeline = new JavaGenerator().generate(manifest);

    expect(pipeline.name).toContain('kotlin-service');
  });

  it('uses Gradle commands', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'kotlin-gradle'));
    const pipeline = new JavaGenerator().generate(manifest);

    const allRuns = pipeline.stages
      .flatMap((s) => s.jobs)
      .flatMap((j) => j.steps)
      .filter((s) => s.type === 'run')
      .map((s) => s.run ?? '');

    expect(allRuns.some((r) => r.includes('gradlew') || r.includes('gradle'))).toBe(true);
  });

  it('uses ktlint for linting Kotlin projects', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'kotlin-gradle'));
    const pipeline = new JavaGenerator().generate(manifest);

    const lintJob = pipeline.stages.find((s) => s.name === 'lint')!.jobs[0];
    expect(lintJob.steps.some((s) => s.run?.includes('ktlint'))).toBe(true);
  });
});
