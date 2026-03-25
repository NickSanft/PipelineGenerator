import { describe, it, expect } from 'vitest';
import { createSonarQubePlugin } from '../../src/plugins/sonarqube.js';
import type { Pipeline } from '../../src/types/pipeline.js';

function makePipeline(stageNames: string[]): Pipeline {
  const stages = stageNames.map((name, idx) => ({
    name,
    dependsOn: idx > 0 ? [stageNames[idx - 1]] : undefined,
    jobs: [{ name: `${name}-job`, runsOn: 'ubuntu-latest', steps: [] }],
  }));
  return { name: 'CI', triggers: [], env: {}, stages };
}

describe('createSonarQubePlugin()', () => {
  const plugin = createSonarQubePlugin({ projectKey: 'my-project' });

  it('has the correct name and description', () => {
    expect(plugin.name).toBe('sonarqube');
    expect(plugin.description).toContain('SonarQube');
  });

  it('inserts a code-quality stage after the test stage', () => {
    const pipeline = makePipeline(['lint', 'test', 'deploy']);
    const result = plugin.hooks.beforeGenerate!(pipeline);

    const names = result.stages.map((s) => s.name);
    expect(names).toEqual(['lint', 'test', 'code-quality', 'deploy']);
  });

  it('code-quality stage depends on test', () => {
    const pipeline = makePipeline(['lint', 'test', 'deploy']);
    const result = plugin.hooks.beforeGenerate!(pipeline);

    const cq = result.stages.find((s) => s.name === 'code-quality')!;
    expect(cq.dependsOn).toContain('test');
  });

  it('stages after code-quality that depended on test now depend on code-quality', () => {
    const pipeline = makePipeline(['lint', 'test', 'deploy']);
    const result = plugin.hooks.beforeGenerate!(pipeline);

    const deploy = result.stages.find((s) => s.name === 'deploy')!;
    expect(deploy.dependsOn).toContain('code-quality');
    expect(deploy.dependsOn).not.toContain('test');
  });

  it('appends at the end when no test stage exists', () => {
    const pipeline = makePipeline(['build', 'deploy']);
    const result = plugin.hooks.beforeGenerate!(pipeline);

    const names = result.stages.map((s) => s.name);
    expect(names).toEqual(['build', 'deploy', 'code-quality']);
  });

  it('includes a SonarQube scan step with the project key', () => {
    const pipeline = makePipeline(['test']);
    const result = plugin.hooks.beforeGenerate!(pipeline);

    const cq = result.stages.find((s) => s.name === 'code-quality')!;
    const scanStep = cq.jobs[0].steps.find((s) => s.name.includes('SonarQube'));
    expect(scanStep).toBeDefined();
    expect(scanStep?.with?.args).toContain('my-project');
  });

  it('uses custom hostUrl when provided', () => {
    const customPlugin = createSonarQubePlugin({
      projectKey: 'proj',
      hostUrl: 'https://sonar.internal',
    });
    const pipeline = makePipeline(['test']);
    const result = customPlugin.hooks.beforeGenerate!(pipeline);

    const cq = result.stages.find((s) => s.name === 'code-quality')!;
    const scanStep = cq.jobs[0].steps.find((s) => s.name.includes('SonarQube'))!;
    expect(scanStep.env?.['SONAR_HOST_URL']).toBe('https://sonar.internal');
  });
});
