import type { PipelineGenerator } from './base.js';
import type { ProjectManifest } from '../types/manifest.js';
import type { CacheConfig, Pipeline } from '../types/pipeline.js';
import { PipelineBuilder } from '../builder/pipeline-builder.js';
import { actionStep, runStep } from '../utils/known-actions.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const GO_MODULE_CACHE: CacheConfig = {
  key: "go-${{ runner.os }}-${{ hashFiles('**/go.sum') }}",
  paths: ['~/go/pkg/mod', '~/.cache/go-build'],
  restoreKeys: ['go-${{ runner.os }}-'],
};

// ── Generator ─────────────────────────────────────────────────────────────────

export class GoGenerator implements PipelineGenerator {
  readonly name = 'go';

  generate(manifest: ProjectManifest): Pipeline {
    const project = manifest.projects.find((p) => p.language === 'go');
    if (!project) throw new Error('GoGenerator: no Go project in manifest');

    const { name } = project;
    const defaultBranch = manifest.vcs.defaultBranch;

    const builder = new PipelineBuilder(`${name} CI`)
      .permissions({ default: 'read-all' })
      .trigger({ type: 'push', branches: [defaultBranch] })
      .trigger({ type: 'pull_request' });

    // ── check stage (vet + lint) ───────────────────────────────────────────────
    builder.stage('check', (stage) =>
      stage.job('vet-and-lint', (job) =>
        job
          .runsOn('ubuntu-latest')
          .timeout(15)
          .cache(GO_MODULE_CACHE)
          .step('Checkout', actionStep('Checkout', 'checkout'))
          .step('Scan for secrets', actionStep('Scan for secrets', 'gitleaks', undefined, {
            GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
          }))
          .step('Set up Go',
            actionStep('Set up Go', 'setupGo', {
              'go-version-file': 'go.mod',
            }),
          )
          .step('Download modules', runStep('Download modules', 'go mod download'))
          .step('Verify modules', runStep('Verify modules', 'go mod verify'))
          .step('Vet', runStep('Vet', 'go vet ./...'))
          .step('Install golangci-lint', runStep('Install golangci-lint',
            'go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest',
          ))
          .step('Lint', runStep('Lint', 'golangci-lint run ./...')),
      ),
    );

    // ── test stage ────────────────────────────────────────────────────────────
    builder.stage('test', (stage) =>
      stage
        .dependsOn('check')
        .job('unit-tests', (job) =>
          job
            .runsOn('ubuntu-latest')
            .timeout(20)
            .cache(GO_MODULE_CACHE)
            .step('Checkout', actionStep('Checkout', 'checkout'))
            .step('Set up Go',
              actionStep('Set up Go', 'setupGo', {
                'go-version-file': 'go.mod',
                }),
            )
            .step('Download modules', runStep('Download modules', 'go mod download'))
            .step('Run tests',
              runStep('Run tests',
                'go test -race -coverprofile=coverage.out -covermode=atomic ./...',
              ),
            )
            .step('Check coverage', runStep('Check coverage', 'go tool cover -func=coverage.out')),
        ),
    );

    // ── build stage (binaries only) ───────────────────────────────────────────
    if (project.artifacts.includes('binary')) {
      builder.stage('build', (stage) =>
        stage
          .dependsOn('test')
          .job('build-binary', (job) =>
            job
              .runsOn('ubuntu-latest')
              .timeout(15)
              .cache(GO_MODULE_CACHE)
              .step('Checkout', actionStep('Checkout', 'checkout'))
              .step('Set up Go',
                actionStep('Set up Go', 'setupGo', {
                  'go-version-file': 'go.mod',
                    }),
              )
              .step('Build', runStep('Build', 'go build -v -ldflags="-s -w" ./...'))
              .step('Security scan', runStep('Security scan',
                'go install golang.org/x/vuln/cmd/govulncheck@latest && govulncheck ./...',
              )),
          ),
      );
    }

    return builder.build();
  }
}
