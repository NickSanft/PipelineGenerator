import type { Pipeline } from '../types/pipeline.js';
import type { Plugin } from './base.js';

export interface DependencyAuditConfig {
  /**
   * Exit the job if a HIGH or CRITICAL vulnerability is found.
   * Default: true.
   */
  failOnHigh?: boolean;
}

/**
 * Dependency Audit plugin — injects an audit step into every job that runs
 * dependency installation (`npm ci`, `pip install`, `go mod download`).
 *
 * - Node   → `npm audit --audit-level=high`
 * - Python → `pip-audit` (installed via pip)
 * - Go     → `govulncheck ./...`
 */
export function createDependencyAuditPlugin(config: DependencyAuditConfig = {}): Plugin {
  const failOnHigh = config.failOnHigh ?? true;

  return {
    name: 'dependency-audit',
    description: 'Injects dependency vulnerability scanning into CI jobs',
    hooks: {
      beforeGenerate(pipeline: Pipeline): Pipeline {
        const updatedStages = pipeline.stages.map((stage) => ({
          ...stage,
          jobs: stage.jobs.map((job) => {
            const auditStep = buildAuditStep(job.steps.map((s) => s.run ?? ''), failOnHigh);
            if (!auditStep) return job;

            // Insert audit step right after the install step
            const installIdx = job.steps.findIndex((s) =>
              /npm ci|pip install|go mod download/.test(s.run ?? ''),
            );
            const insertAfter = installIdx >= 0 ? installIdx + 1 : job.steps.length;

            return {
              ...job,
              steps: [
                ...job.steps.slice(0, insertAfter),
                auditStep,
                ...job.steps.slice(insertAfter),
              ],
            };
          }),
        }));

        return { ...pipeline, stages: updatedStages };
      },
    },
  };
}

function buildAuditStep(
  runCommands: string[],
  failOnHigh: boolean,
): import('../types/pipeline.js').Step | null {
  const allCommands = runCommands.join(' ');

  if (/npm ci/.test(allCommands)) {
    return {
      name: 'Audit npm dependencies',
      type: 'run',
      run: failOnHigh ? 'npm audit --audit-level=high' : 'npm audit || true',
    };
  }

  if (/pip install/.test(allCommands)) {
    return {
      name: 'Audit Python dependencies',
      type: 'run',
      run: failOnHigh
        ? 'pip install pip-audit && pip-audit'
        : 'pip install pip-audit && pip-audit || true',
    };
  }

  if (/go mod download/.test(allCommands)) {
    return {
      name: 'Audit Go dependencies',
      type: 'run',
      run: failOnHigh
        ? 'go install golang.org/x/vuln/cmd/govulncheck@latest && govulncheck ./...'
        : 'go install golang.org/x/vuln/cmd/govulncheck@latest && govulncheck ./... || true',
    };
  }

  return null;
}
