import { describe, it, expect } from 'vitest';
import { createDependencyAuditPlugin } from '../../src/plugins/dependency-audit.js';
import type { Pipeline, Step } from '../../src/types/pipeline.js';

function makeJob(installCmd: string) {
  return {
    name: 'test',
    runsOn: 'ubuntu-latest',
    steps: [
      { name: 'Checkout', type: 'action' as const, action: 'actions/checkout', actionVersion: 'abc' },
      { name: 'Install', type: 'run' as const, run: installCmd },
      { name: 'Test', type: 'run' as const, run: 'npm test' },
    ] as Step[],
  };
}

function makePipeline(installCmd: string): Pipeline {
  return {
    name: 'CI',
    triggers: [],
    env: {},
    stages: [{ name: 'test', jobs: [makeJob(installCmd)] }],
  };
}

describe('createDependencyAuditPlugin()', () => {
  const plugin = createDependencyAuditPlugin();

  it('has the correct name', () => {
    expect(plugin.name).toBe('dependency-audit');
  });

  it('injects npm audit after npm ci', () => {
    const pipeline = makePipeline('npm ci');
    const result = plugin.hooks.beforeGenerate!(pipeline);

    const steps = result.stages[0].jobs[0].steps;
    const auditIdx = steps.findIndex((s) => s.name?.includes('npm'));
    const installIdx = steps.findIndex((s) => s.run === 'npm ci');
    expect(auditIdx).toBe(installIdx + 1);
    expect(steps[auditIdx].run).toContain('npm audit');
  });

  it('injects pip-audit after pip install', () => {
    const pipeline = makePipeline('pip install -r requirements.txt');
    const result = plugin.hooks.beforeGenerate!(pipeline);

    const steps = result.stages[0].jobs[0].steps;
    const auditStep = steps.find((s) => s.name?.includes('Python'));
    expect(auditStep).toBeDefined();
    expect(auditStep?.run).toContain('pip-audit');
  });

  it('injects govulncheck after go mod download', () => {
    const pipeline = makePipeline('go mod download');
    const result = plugin.hooks.beforeGenerate!(pipeline);

    const steps = result.stages[0].jobs[0].steps;
    const auditStep = steps.find((s) => s.name?.includes('Go'));
    expect(auditStep).toBeDefined();
    expect(auditStep?.run).toContain('govulncheck');
  });

  it('does not inject anything when no known install command is found', () => {
    const pipeline = makePipeline('mvn install');
    const result = plugin.hooks.beforeGenerate!(pipeline);

    const steps = result.stages[0].jobs[0].steps;
    expect(steps).toHaveLength(3); // unchanged
  });

  it('respects failOnHigh: false (adds || true)', () => {
    const lenient = createDependencyAuditPlugin({ failOnHigh: false });
    const pipeline = makePipeline('npm ci');
    const result = lenient.hooks.beforeGenerate!(pipeline);

    const auditStep = result.stages[0].jobs[0].steps.find((s) => s.run?.includes('npm audit'))!;
    expect(auditStep.run).toContain('|| true');
  });
});
