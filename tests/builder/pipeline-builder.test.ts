import { describe, it, expect } from 'vitest';
import { PipelineBuilder, StageBuilder, JobBuilder } from '../../src/builder/pipeline-builder.js';

describe('PipelineBuilder', () => {
  it('builds a pipeline with triggers and stages', () => {
    const pipeline = new PipelineBuilder('CI')
      .trigger({ type: 'push', branches: ['main'] })
      .trigger({ type: 'pull_request' })
      .stage('test', (stage) =>
        stage.job('unit-tests', (job) =>
          job
            .runsOn('ubuntu-latest')
            .step('Checkout', { type: 'action', action: 'actions/checkout', actionVersion: 'abc123' })
            .step('Test', { type: 'run', run: 'npm test' }),
        ),
      )
      .build();

    expect(pipeline.name).toBe('CI');
    expect(pipeline.triggers).toHaveLength(2);
    expect(pipeline.stages).toHaveLength(1);
    expect(pipeline.stages[0].jobs[0].steps).toHaveLength(2);
  });

  it('sets env variables', () => {
    const pipeline = new PipelineBuilder('CI')
      .env('NODE_ENV', 'test')
      .trigger({ type: 'push' })
      .stage('test', (stage) =>
        stage.job('job', (job) => job.step('Run', { type: 'run', run: 'echo hi' })),
      )
      .build();

    expect(pipeline.env['NODE_ENV']).toBe('test');
  });

  it('captures stage dependencies', () => {
    const pipeline = new PipelineBuilder('CI')
      .trigger({ type: 'push' })
      .stage('build', (stage) =>
        stage.job('build', (job) => job.step('Build', { type: 'run', run: 'npm run build' })),
      )
      .stage('deploy', (stage) =>
        stage
          .dependsOn('build')
          .job('deploy', (job) => job.step('Deploy', { type: 'run', run: 'npm run deploy' })),
      )
      .build();

    expect(pipeline.stages[1].dependsOn).toEqual(['build']);
  });

  it('throws when a stage depends on a non-existent stage', () => {
    expect(() =>
      new PipelineBuilder('CI')
        .trigger({ type: 'push' })
        .stage('deploy', (stage) =>
          stage
            .dependsOn('build') // 'build' does not exist
            .job('deploy', (job) => job.step('Deploy', { type: 'run', run: 'echo hi' })),
        )
        .build(),
    ).toThrow('unknown stage "build"');
  });

  it('throws when a job has no steps', () => {
    expect(() => new JobBuilder('empty').build()).toThrow('at least one step');
  });

  it('throws when a stage has no jobs', () => {
    expect(() => new StageBuilder('empty').build()).toThrow('at least one job');
  });
});
