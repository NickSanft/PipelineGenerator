import type { Pipeline, Stage } from '../types/pipeline.js';
import type { Plugin } from './base.js';

export interface SonarQubeConfig {
  /** SonarQube/SonarCloud project key */
  projectKey: string;
  /** SonarQube host URL. Defaults to SonarCloud. */
  hostUrl?: string;
}

/**
 * SonarQube plugin — adds a `code-quality` stage that runs the Sonar scanner
 * after the test stage (or after the last stage if no test stage is found).
 */
export function createSonarQubePlugin(config: SonarQubeConfig): Plugin {
  return {
    name: 'sonarqube',
    description: 'Adds a SonarQube/SonarCloud code-quality scan stage',
    hooks: {
      beforeGenerate(pipeline: Pipeline): Pipeline {
        // Find the test stage to depend on
        const testStage = pipeline.stages.find((s) => s.name === 'test');
        const dependsOn = testStage
          ? [testStage.name]
          : pipeline.stages.length > 0
            ? [pipeline.stages[pipeline.stages.length - 1].name]
            : undefined;

        const codeQualityStage: Stage = {
          name: 'code-quality',
          dependsOn,
          jobs: [
            {
              name: 'sonarqube-scan',
              runsOn: 'ubuntu-latest',
              timeoutMinutes: 15,
              steps: [
                {
                  name: 'Checkout (full history)',
                  type: 'action',
                  action: 'actions/checkout',
                  actionVersion: 'b4ffde65f46336ab88eb53be808477a3936bae11', // v4.1.1
                  with: { 'fetch-depth': '0' },
                },
                {
                  name: 'SonarQube Scan',
                  type: 'action',
                  action: 'SonarSource/sonarqube-scan-action',
                  actionVersion: 'aa23c01aba1a55eb0b38f58f53bfcfc87d0bfabb', // v2.3.0
                  env: {
                    SONAR_TOKEN: '${{ secrets.SONAR_TOKEN }}',
                    SONAR_HOST_URL: config.hostUrl ?? 'https://sonarcloud.io',
                  },
                  with: {
                    args: `-Dsonar.projectKey=${config.projectKey}`,
                  },
                },
              ],
            },
          ],
        };

        // Insert after the test stage (or at the end)
        const testIdx = pipeline.stages.findIndex((s) => s.name === 'test');
        const insertAt = testIdx >= 0 ? testIdx + 1 : pipeline.stages.length;

        const stages = [
          ...pipeline.stages.slice(0, insertAt),
          codeQualityStage,
          ...pipeline.stages.slice(insertAt),
        ];

        // Any stage that depended on "test" and comes after the insertion point
        // should now depend on "code-quality" so the DAG stays clean.
        const updatedStages = stages.map((s, idx) => {
          if (idx > insertAt && s.dependsOn?.includes('test')) {
            return {
              ...s,
              dependsOn: s.dependsOn.map((d) => (d === 'test' ? 'code-quality' : d)),
            };
          }
          return s;
        });

        return { ...pipeline, stages: updatedStages };
      },
    },
  };
}
