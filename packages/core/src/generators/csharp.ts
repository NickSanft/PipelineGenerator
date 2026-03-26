import type { PipelineGenerator } from './base.js';
import type { ProjectManifest } from '../types/manifest.js';
import type { CacheConfig, Pipeline } from '../types/pipeline.js';
import type { GeneratorOptions } from './options.js';
import { PipelineBuilder } from '../builder/pipeline-builder.js';
import { actionStep, runStep } from '../utils/known-actions.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOTNET_VERSIONS = ['8.0', '9.0'];

function dotnetCache(): CacheConfig {
  return {
    key: "nuget-${{ runner.os }}-${{ hashFiles('**/*.csproj', '**/packages.lock.json') }}",
    paths: ['~/.nuget/packages'],
    restoreKeys: ['nuget-${{ runner.os }}-'],
  };
}

function testCommand(coverageThreshold: number | undefined): string {
  const base = 'dotnet test --configuration Release --no-build';
  return coverageThreshold !== undefined
    ? `${base} --collect:"XPlat Code Coverage"`
    : base;
}

// ── Generator ─────────────────────────────────────────────────────────────────

export class CSharpGenerator implements PipelineGenerator {
  readonly name = 'csharp';

  generate(manifest: ProjectManifest, options: GeneratorOptions = {}): Pipeline {
    const project = manifest.projects.find(
      (p) => p.language === 'csharp' || p.language === 'fsharp',
    );
    if (!project) throw new Error('CSharpGenerator: no C#/F# project in manifest');

    const { name } = project;
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
          .cache(dotnetCache())
          .step('Checkout', actionStep('Checkout', 'checkout'))
          .step('Scan for secrets', actionStep('Scan for secrets', 'gitleaks', undefined, {
            GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
          }))
          .step('Set up .NET', actionStep('Set up .NET', 'setupDotnet', { 'dotnet-version': '9.0' }))
          .step('Restore', runStep('Restore', 'dotnet restore'))
          .step('Format check', runStep('Format check', 'dotnet format --verify-no-changes')),
      ),
    );

    // ── test stage ────────────────────────────────────────────────────────────
    builder.stage('test', (stage) =>
      stage
        .dependsOn('lint')
        .job('unit-tests', (job) => {
          job
            .runsOn('ubuntu-latest')
            .timeout(20)
            .matrix({ dimensions: { 'dotnet-version': DOTNET_VERSIONS } })
            .cache(dotnetCache())
            .step('Checkout', actionStep('Checkout', 'checkout'))
            .step(
              'Set up .NET ${{ matrix.dotnet-version }}',
              actionStep('Set up .NET ${{ matrix.dotnet-version }}', 'setupDotnet', {
                'dotnet-version': '${{ matrix.dotnet-version }}',
              }),
            )
            .step('Restore', runStep('Restore', 'dotnet restore'))
            .step('Build', runStep('Build', 'dotnet build --configuration Release --no-restore'))
            .step('Run tests', runStep('Run tests', testCommand(options.coverageThreshold)))
            .step(
              'Dependency audit',
              runStep('Dependency audit', 'dotnet list package --vulnerable --include-transitive'),
            );
          return job;
        }),
    );

    // ── build stage ───────────────────────────────────────────────────────────
    builder.stage('build', (stage) =>
      stage
        .dependsOn('test')
        .job('build', (job) =>
          job
            .runsOn('ubuntu-latest')
            .timeout(15)
            .cache(dotnetCache())
            .step('Checkout', actionStep('Checkout', 'checkout'))
            .step('Set up .NET', actionStep('Set up .NET', 'setupDotnet', { 'dotnet-version': '9.0' }))
            .step('Restore', runStep('Restore', 'dotnet restore'))
            .step('Build', runStep('Build', 'dotnet build --configuration Release --no-restore'))
            .step(
              'Publish',
              runStep('Publish', 'dotnet publish --configuration Release --no-build -o ./output'),
            ),
        ),
    );

    return builder.build();
  }
}
