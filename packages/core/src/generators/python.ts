import type { PipelineGenerator } from './base.js';
import type { ProjectManifest } from '../types/manifest.js';
import type { CacheConfig, Pipeline } from '../types/pipeline.js';
import type { GeneratorOptions } from './options.js';
import { PipelineBuilder } from '../builder/pipeline-builder.js';
import { actionStep, runStep } from '../utils/known-actions.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function installCommand(pm: string | undefined): string {
  switch (pm) {
    case 'poetry': return 'poetry install --with dev';
    case 'pip':
    default:       return 'pip install -e ".[dev]"';
  }
}

function testCommand(
  testRunner: string | undefined,
  pm: string | undefined,
  coverageThreshold?: number,
): string {
  const prefix = pm === 'poetry' ? 'poetry run ' : '';
  const gate = coverageThreshold !== undefined ? ` --cov-fail-under=${coverageThreshold}` : '';
  switch (testRunner) {
    case 'pytest': return `${prefix}pytest --cov --cov-report=xml${gate} -v`;
    case 'tox':    return 'tox';
    default:       return `${prefix}python -m pytest --cov --cov-report=xml${gate}`;
  }
}

function lintCommand(pm: string | undefined): string {
  const prefix = pm === 'poetry' ? 'poetry run ' : '';
  return `${prefix}ruff check . && ${prefix}ruff format --check .`;
}

function pythonCache(pm: string | undefined): CacheConfig {
  if (pm === 'poetry') {
    return {
      key: "poetry-${{ runner.os }}-${{ hashFiles('**/poetry.lock') }}",
      paths: ['~/.cache/pypoetry'],
      restoreKeys: ['poetry-${{ runner.os }}-'],
    };
  }
  return {
    key: "pip-${{ runner.os }}-${{ hashFiles('**/pyproject.toml', '**/requirements*.txt') }}",
    paths: ['~/.cache/pip'],
    restoreKeys: ['pip-${{ runner.os }}-'],
  };
}

// ── Generator ─────────────────────────────────────────────────────────────────

export class PythonGenerator implements PipelineGenerator {
  readonly name = 'python';

  generate(manifest: ProjectManifest, options: GeneratorOptions = {}): Pipeline {
    const project = manifest.projects.find((p) => p.language === 'python');
    if (!project) throw new Error('PythonGenerator: no Python project in manifest');

    const { packageManager: pm, testRunner, buildTool, name } = project;
    const defaultBranch = manifest.vcs.defaultBranch;

    const builder = new PipelineBuilder(`${name} CI`)
      .permissions({ default: 'read-all' })
      .trigger({ type: 'push', branches: [defaultBranch] })
      .trigger({ type: 'pull_request' });

    // ── lint stage ────────────────────────────────────────────────────────────
    builder.stage('lint', (stage) =>
      stage.job('lint', (job) =>
        job
          .runsOn('ubuntu-latest')
          .timeout(10)
          .step('Checkout', actionStep('Checkout', 'checkout'))
          .step('Scan for secrets', actionStep('Scan for secrets', 'gitleaks', undefined, {
            GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
          }))
          .step('Set up Python',
            actionStep('Set up Python', 'setupPython', { 'python-version': '3.12' }),
          )
          .step('Install linting tools', runStep('Install linting tools',
            pm === 'poetry' ? 'pip install poetry && poetry install --with dev' : 'pip install ruff',
          ))
          .step('Lint & format check', runStep('Lint & format check', lintCommand(pm))),
      ),
    );

    // ── test stage ────────────────────────────────────────────────────────────
    builder.stage('test', (stage) =>
      stage
        .dependsOn('lint')
        .job('unit-tests', (job) =>
          job
            .runsOn('ubuntu-latest')
            .timeout(20)
            .matrix({ dimensions: { 'python-version': ['3.10', '3.11', '3.12'] } })
            .cache(pythonCache(pm))
            .step('Checkout', actionStep('Checkout', 'checkout'))
            .step('Set up Python ${{ matrix.python-version }}',
              actionStep('Set up Python ${{ matrix.python-version }}', 'setupPython', {
                'python-version': '${{ matrix.python-version }}',
              }),
            )
            .step('Install dependencies', runStep('Install dependencies', installCommand(pm)))
            .step('Run tests', runStep('Run tests', testCommand(testRunner, pm, options.coverageThreshold))),
        ),
    );

    // ── build stage (wheel) ───────────────────────────────────────────────────
    if (project.artifacts.includes('wheel') && buildTool) {
      const buildCmd = buildTool === 'poetry'
        ? 'poetry build'
        : buildTool === 'hatch'
          ? 'hatch build'
          : 'python -m build';

      builder.stage('build', (stage) =>
        stage
          .dependsOn('test')
          .job('build-wheel', (job) =>
            job
              .runsOn('ubuntu-latest')
              .timeout(10)
              .step('Checkout', actionStep('Checkout', 'checkout'))
              .step('Set up Python',
                actionStep('Set up Python', 'setupPython', { 'python-version': '3.12' }),
              )
              .step('Install build tools', runStep('Install build tools',
                pm === 'poetry' ? 'pip install poetry' : `pip install ${buildTool ?? 'build'}`,
              ))
              .step('Build wheel', runStep('Build wheel', buildCmd)),
          ),
      );
    }

    return builder.build();
  }
}
