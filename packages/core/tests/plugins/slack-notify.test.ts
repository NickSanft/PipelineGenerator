import { describe, it, expect } from 'vitest';
import { createSlackNotifyPlugin } from '../../src/plugins/slack-notify.js';
import type { Pipeline } from '../../src/types/pipeline.js';

function makePipeline(stageNames: string[]): Pipeline {
  const stages = stageNames.map((name, idx) => ({
    name,
    dependsOn: idx > 0 ? [stageNames[idx - 1]] : undefined,
    jobs: [
      {
        name: `${name}-job`,
        runsOn: 'ubuntu-latest',
        steps: [{ name: 'Main step', type: 'run' as const, run: 'echo ok' }],
      },
    ],
  }));
  return { name: 'CI', triggers: [], env: {}, stages };
}

describe('createSlackNotifyPlugin()', () => {
  const plugin = createSlackNotifyPlugin({ channel: '#deploys' });

  it('has the correct name', () => {
    expect(plugin.name).toBe('slack-notify');
  });

  it('adds a failure notification step to the last stage only', () => {
    const pipeline = makePipeline(['test', 'deploy']);
    const result = plugin.hooks.afterGenerate!(pipeline);

    // Last stage should have an extra step
    const lastJobs = result.stages[result.stages.length - 1].jobs;
    const lastSteps = lastJobs[0].steps;
    expect(lastSteps.at(-1)?.name).toContain('failure');

    // First stage should NOT be modified
    expect(result.stages[0].jobs[0].steps).toHaveLength(1);
  });

  it('step condition is failure()', () => {
    const pipeline = makePipeline(['deploy']);
    const result = plugin.hooks.afterGenerate!(pipeline);

    const notifyStep = result.stages[0].jobs[0].steps.at(-1)!;
    expect(notifyStep.condition).toBe('failure()');
  });

  it('sets the correct Slack channel', () => {
    const pipeline = makePipeline(['deploy']);
    const result = plugin.hooks.afterGenerate!(pipeline);

    const notifyStep = result.stages[0].jobs[0].steps.at(-1)!;
    expect(notifyStep.with?.channel).toBe('#deploys');
  });

  it('adds both failure and success steps when onSuccess is true', () => {
    const withSuccess = createSlackNotifyPlugin({ channel: '#ci', onSuccess: true });
    const pipeline = makePipeline(['deploy']);
    const result = withSuccess.hooks.afterGenerate!(pipeline);

    const addedSteps = result.stages[0].jobs[0].steps.slice(1);
    expect(addedSteps).toHaveLength(2);
    expect(addedSteps[0].condition).toBe('failure()');
    expect(addedSteps[1].condition).toBe('success()');
  });

  it('returns pipeline unchanged if there are no stages', () => {
    const empty: Pipeline = { name: 'CI', triggers: [], env: {}, stages: [] };
    const result = plugin.hooks.afterGenerate!(empty);
    expect(result.stages).toHaveLength(0);
  });
});
