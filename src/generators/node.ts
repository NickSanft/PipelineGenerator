import type { PipelineGenerator } from './base.js';
import type { ProjectManifest, ProjectDescriptor } from '../types/manifest.js';
import type { CacheConfig, Pipeline, Step } from '../types/pipeline.js';
import { PipelineBuilder } from '../builder/pipeline-builder.js';
import { actionStep, runStep } from '../utils/known-actions.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function installCommand(pm: string | undefined): string {
  switch (pm) {
    case 'yarn': return 'yarn install --frozen-lockfile';
    case 'pnpm': return 'pnpm install --frozen-lockfile';
    default:     return 'npm ci';
  }
}

function auditCommand(pm: string | undefined): string {
  switch (pm) {
    case 'yarn': return 'yarn audit --level moderate';
    case 'pnpm': return 'pnpm audit --audit-level moderate';
    default:     return 'npm audit --audit-level=moderate';
  }
}

function testCommand(testRunner: string | undefined, pm: string | undefined): string {
  const runner = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : 'npx';
  switch (testRunner) {
    case 'vitest': return `${runner} vitest run --coverage`;
    case 'jest':   return `${runner} jest --coverage --ci --forceExit`;
    case 'mocha':  return `${runner} mocha`;
    default:       return pm === 'yarn' ? 'yarn test' : pm === 'pnpm' ? 'pnpm test' : 'npm test';
  }
}

function nodeCache(pm: string | undefined): CacheConfig {
  switch (pm) {
    case 'yarn':
      return {
        key: "yarn-${{ runner.os }}-${{ hashFiles('**/yarn.lock') }}",
        paths: ['~/.yarn/cache'],
        restoreKeys: ['yarn-${{ runner.os }}-'],
      };
    case 'pnpm':
      return {
        key: "pnpm-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}",
        paths: ['~/.pnpm-store'],
        restoreKeys: ['pnpm-${{ runner.os }}-'],
      };
    default:
      return {
        key: "npm-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}",
        paths: ['~/.npm'],
        restoreKeys: ['npm-${{ runner.os }}-'],
      };
  }
}

function hasScript(project: ProjectDescriptor, script: string): boolean {
  const scripts = project.raw?.['scripts'] as Record<string, string> | undefined;
  return script in (scripts ?? {});
}

// ── Generator ─────────────────────────────────────────────────────────────────

export class NodeGenerator implements PipelineGenerator {
  readonly name = 'node';

  generate(manifest: ProjectManifest): Pipeline {
    const project = manifest.projects.find(
      (p) => p.language === 'typescript' || p.language === 'javascript',
    );
    if (!project) throw new Error('NodeGenerator: no TypeScript/JavaScript project in manifest');

    const { packageManager: pm, testRunner, buildTool, name } = project;
    const defaultBranch = manifest.vcs.defaultBranch;

    const builder = new PipelineBuilder(`${name} CI`)
      .permissions({ default: 'read-all' })
      .trigger({ type: 'push', branches: [defaultBranch] })
      .trigger({ type: 'pull_request' });

    // ── test stage ────────────────────────────────────────────────────────────
    builder.stage('test', (stage) =>
      stage.job('unit-tests', (job) => {
        job
          .runsOn('ubuntu-latest')
          .timeout(20)
          .matrix({ dimensions: { 'node-version': ['20', '22'] } })
          .cache(nodeCache(pm))
          .step('Checkout', actionStep('Checkout', 'checkout'))
          .step('Scan for secrets', actionStep('Scan for secrets', 'gitleaks', undefined, {
            GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
          }))
          .step('Set up Node.js ${{ matrix.node-version }}',
            actionStep('Set up Node.js ${{ matrix.node-version }}', 'setupNode', {
              'node-version': '${{ matrix.node-version }}',
              cache: pm ?? 'npm',
            }),
          )
          .step('Install dependencies', runStep('Install dependencies', installCommand(pm)));

        if (hasScript(project, 'lint')) {
          const lintCmd = pm === 'yarn' ? 'yarn lint' : pm === 'pnpm' ? 'pnpm lint' : 'npm run lint';
          job.step('Lint', runStep('Lint', lintCmd));
        } else if (project.language === 'typescript') {
          // TypeScript-specific type check as a fallback lint step
          job.step('Type check', runStep('Type check', 'npx tsc --noEmit'));
        }

        job
          .step('Security audit', runStep('Security audit', auditCommand(pm)))
          .step('Run tests', runStep('Run tests', testCommand(testRunner, pm)));

        return job;
      }),
    );

    // ── build stage ───────────────────────────────────────────────────────────
    if (buildTool) {
      const buildCmd = hasScript(project, 'build')
        ? pm === 'yarn' ? 'yarn build' : pm === 'pnpm' ? 'pnpm build' : 'npm run build'
        : `npx ${buildTool}`;

      builder.stage('build', (stage) =>
        stage
          .dependsOn('test')
          .job('build', (job) =>
            job
              .runsOn('ubuntu-latest')
              .timeout(15)
              .cache(nodeCache(pm))
              .step('Checkout', actionStep('Checkout', 'checkout'))
              .step('Set up Node.js',
                actionStep('Set up Node.js', 'setupNode', {
                  'node-version': '20',
                  cache: pm ?? 'npm',
                }),
              )
              .step('Install dependencies', runStep('Install dependencies', installCommand(pm)))
              .step('Build', runStep('Build', buildCmd)),
          ),
      );
    }

    // ── publish stage (npm packages on tag push) ───────────────────────────────
    if (project.artifacts.includes('npm-package')) {
      const publishCmd = pm === 'yarn' ? 'yarn publish' : pm === 'pnpm' ? 'pnpm publish' : 'npm publish';
      builder.stage('publish', (stage) =>
        stage
          .dependsOn(buildTool ? 'build' : 'test')
          .job('publish-npm', (job) =>
            job
              .runsOn('ubuntu-latest')
              .timeout(10)
              .condition("github.ref_type == 'tag'")
              .cache(nodeCache(pm))
              .step('Checkout', actionStep('Checkout', 'checkout'))
              .step('Set up Node.js',
                actionStep('Set up Node.js', 'setupNode', {
                  'node-version': '20',
                  cache: pm ?? 'npm',
                  'registry-url': 'https://registry.npmjs.org',
                }),
              )
              .step('Install dependencies', runStep('Install dependencies', installCommand(pm)))
              .step('Publish to npm', runStep('Publish to npm', publishCmd, {
                NODE_AUTH_TOKEN: '${{ secrets.NPM_TOKEN }}',
              })),
          ),
      );
    }

    return builder.build();
  }
}
