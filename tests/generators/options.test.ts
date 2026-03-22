import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { analyzeRepo } from '../../src/analyzers/registry.js';
import { NodeGenerator } from '../../src/generators/node.js';
import { PythonGenerator } from '../../src/generators/python.js';
import { GoGenerator } from '../../src/generators/go.js';
import { makeDecisions } from '../../src/generators/decisions.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

// ── Coverage threshold ─────────────────────────────────────────────────────────

describe('Coverage threshold — Node', () => {
  it('applies vitest --coverage.lines flag when threshold is set', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest, { coverageThreshold: 85 });

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    const testStep = testJob.steps.find((s) => s.run?.includes('vitest') || s.run?.includes('jest'));
    expect(testStep?.run).toContain('85');
  });

  it('omits coverage flag when threshold is not set', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const pipeline = new NodeGenerator().generate(manifest);

    const testJob = pipeline.stages.find((s) => s.name === 'test')!.jobs[0];
    const testStep = testJob.steps.find((s) => s.run?.includes('vitest') || s.run?.includes('jest'));
    expect(testStep?.run).not.toContain('lines=');
    expect(testStep?.run).not.toContain('coverageThreshold');
  });
});

describe('Coverage threshold — Python', () => {
  it('applies --cov-fail-under when threshold is set', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));
    const pipeline = new PythonGenerator().generate(manifest, { coverageThreshold: 75 });

    const testStage = pipeline.stages.find((s) => s.name === 'test')!;
    const testJob = testStage.jobs[0];
    const testStep = testJob.steps.find((s) => s.run?.includes('pytest'));
    expect(testStep?.run).toContain('--cov-fail-under=75');
  });

  it('omits --cov-fail-under when threshold is not set', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'python-fastapi'));
    const pipeline = new PythonGenerator().generate(manifest);

    const testStage = pipeline.stages.find((s) => s.name === 'test')!;
    const testJob = testStage.jobs[0];
    const testStep = testJob.steps.find((s) => s.run?.includes('pytest'));
    expect(testStep?.run).not.toContain('--cov-fail-under');
  });
});

describe('Coverage threshold — Go', () => {
  it('applies awk threshold check when threshold is set', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest, { coverageThreshold: 70 });

    const testStage = pipeline.stages.find((s) => s.name === 'test')!;
    const testJob = testStage.jobs[0];
    const coverStep = testJob.steps.find((s) => s.run?.includes('go tool cover'));
    expect(coverStep?.run).toContain('70');
  });

  it('uses simple go tool cover when no threshold', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    const pipeline = new GoGenerator().generate(manifest);

    const testStage = pipeline.stages.find((s) => s.name === 'test')!;
    const testJob = testStage.jobs[0];
    const coverStep = testJob.steps.find((s) => s.run?.includes('go tool cover'));
    expect(coverStep?.run).toBe('go tool cover -func=coverage.out');
  });
});

// ── skipDockerPush ─────────────────────────────────────────────────────────────

describe('skipDockerPush option', () => {
  it('includes docker stage by default when Dockerfile is present', async () => {
    // go-service has a Dockerfile
    const manifest = await analyzeRepo(join(FIXTURES, 'go-service'));
    if (!manifest.projects.some((p) => p.hasDockerfile)) return; // skip if fixture has no Dockerfile

    const { generatePipeline } = await import('../../src/generators/registry.js');
    const pipeline = generatePipeline(manifest);
    const hasDockerStage = pipeline.stages.some((s) => s.name === 'docker');
    if (manifest.projects.some((p) => p.hasDockerfile)) {
      expect(hasDockerStage).toBe(true);
    }
  });
});

// ── makeDecisions ──────────────────────────────────────────────────────────────

describe('makeDecisions', () => {
  it('always includes language decision', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const decisions = makeDecisions(manifest);
    const lang = decisions.find((d) => d.category === 'Language');
    expect(lang).toBeDefined();
    expect(['typescript', 'javascript']).toContain(lang!.choice);
  });

  it('includes coverage gate decision with threshold', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const decisions = makeDecisions(manifest, { coverageThreshold: 90 });
    const cov = decisions.find((d) => d.category === 'Coverage gate');
    expect(cov?.choice).toBe('90%');
  });

  it('shows "none" for coverage gate when no threshold given', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const decisions = makeDecisions(manifest);
    const cov = decisions.find((d) => d.category === 'Coverage gate');
    expect(cov?.choice).toBe('none');
  });

  it('includes package manager when detected', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const decisions = makeDecisions(manifest);
    const pm = decisions.find((d) => d.category === 'Package manager');
    expect(pm).toBeDefined();
  });

  it('includes Slack channel when specified', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const decisions = makeDecisions(manifest, { slackChannel: '#builds' });
    const slack = decisions.find((d) => d.category === 'Notifications');
    expect(slack?.choice).toBe('#builds');
  });

  it('includes default branch decision', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const decisions = makeDecisions(manifest);
    const branch = decisions.find((d) => d.category === 'Default branch');
    expect(branch).toBeDefined();
    expect(branch!.choice).toBe(manifest.vcs.defaultBranch);
  });

  it('returns empty array for manifest with no projects', async () => {
    const manifest = await analyzeRepo(join(FIXTURES, 'node-basic'));
    const empty = makeDecisions({ ...manifest, projects: [] });
    expect(empty).toEqual([]);
  });
});
