import type { PipelineRenderer } from './base.js';
import type { Pipeline, Job, Step, Trigger, CacheConfig, MatrixConfig } from '../types/pipeline.js';
import { toYaml } from '../utils/yaml.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** GitHub Actions that map directly to a shell command in GitLab CI */
const ACTION_TO_SCRIPT: Record<string, (step: Step) => string | null> = {
  'gitleaks/gitleaks-action': () => 'gitleaks detect --source=. --exit-code=1 --no-git',
  'docker/login-action': (s) => {
    const registry = s.with?.['registry'] ?? '$CI_REGISTRY';
    return [
      `echo "$CI_REGISTRY_PASSWORD" | docker login ${registry} -u "$CI_REGISTRY_USER" --password-stdin`,
    ].join('\n');
  },
  'docker/setup-buildx-action': () => 'docker buildx create --use',
  'docker/build-push-action': (s) => {
    const tags = (s.with?.['tags'] ?? '$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA').split('\n')[0];
    return [`docker build -t ${tags} .`, `docker push ${tags}`].join('\n');
  },
};

/** Actions that are implicit in GitLab CI and should be skipped */
const IMPLICIT_ACTIONS = new Set([
  'actions/checkout',
  'actions/setup-node',
  'actions/setup-python',
  'actions/setup-go',
  'actions/cache',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toJobId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\$\{\{[^}]*\}\}/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Infer a Docker image from the job's setup-* action steps.
 * Returns undefined if the job uses a shell runner (no language setup action found).
 */
function inferDockerImage(job: Job): string | undefined {
  for (const step of job.steps) {
    if (step.action === 'actions/setup-node') {
      const ver = step.with?.['node-version'] ?? '20';
      // Matrix variable like ${{ matrix.node-version }} → use GitLab variable
      return ver.startsWith('${{') ? 'node:${NODE_VERSION}' : `node:${ver}-alpine`;
    }
    if (step.action === 'actions/setup-python') {
      const ver = step.with?.['python-version'] ?? '3.12';
      return ver.startsWith('${{') ? 'python:${PYTHON_VERSION}-slim' : `python:${ver}-slim`;
    }
    if (step.action === 'actions/setup-go') {
      return 'golang:alpine';
    }
  }
  return undefined;
}

function buildGitlabCache(cache: CacheConfig): Record<string, unknown> {
  return {
    key: '$CI_COMMIT_REF_SLUG',
    paths: cache.paths,
    policy: 'pull-push',
  };
}

function buildGitlabMatrix(matrix: MatrixConfig): Record<string, unknown> {
  // Convert { 'node-version': ['20','22'] } → [{ NODE_VERSION: ['20','22'] }]
  const entries = Object.entries(matrix.dimensions).map(([key, values]) => ({
    [key.toUpperCase().replace(/-/g, '_')]: values,
  }));
  return { matrix: entries };
}

function buildRules(triggers: Trigger[]): Record<string, unknown>[] {
  const rules: Record<string, unknown>[] = [];

  for (const t of triggers) {
    switch (t.type) {
      case 'push':
        if (t.branches?.length) {
          for (const branch of t.branches) {
            rules.push({ if: `$CI_COMMIT_BRANCH == "${branch}"` });
          }
        } else {
          rules.push({ if: '$CI_COMMIT_BRANCH' });
        }
        break;
      case 'pull_request':
        rules.push({ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' });
        break;
      case 'schedule':
        rules.push({ if: '$CI_PIPELINE_SOURCE == "schedule"' });
        break;
      case 'manual':
        rules.push({ if: '$CI_PIPELINE_SOURCE == "web"' });
        break;
    }
  }

  return rules;
}

/**
 * Convert GitHub Actions steps to a flat list of shell script lines.
 * Skips steps that are implicit in GitLab CI (checkout, setup-*, cache).
 * Substitutes known action → shell command mappings.
 * Emits a TODO comment for any unrecognized action.
 */
function buildScript(steps: Step[]): string[] {
  const lines: string[] = [];

  for (const step of steps) {
    if (step.type === 'run' && step.run) {
      lines.push(step.run);
      continue;
    }

    if (step.type !== 'action' || !step.action) continue;

    if (IMPLICIT_ACTIONS.has(step.action)) continue;

    const substitute = ACTION_TO_SCRIPT[step.action];
    if (substitute) {
      const cmd = substitute(step);
      if (cmd) lines.push(cmd);
      continue;
    }

    // Unknown action — emit a placeholder comment
    lines.push(`# TODO: no GitLab equivalent for "${step.action}" — configure manually`);
  }

  return lines;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

export class GitlabCiRenderer implements PipelineRenderer {
  readonly platform = 'gitlab-ci';

  render(pipeline: Pipeline): string {
    const config: Record<string, unknown> = {};

    // Top-level stages list (respects DAG order)
    config['stages'] = pipeline.stages.map((s) => s.name);

    // Global variables
    if (Object.keys(pipeline.env).length > 0) {
      config['variables'] = pipeline.env;
    }

    // Stage name → job IDs map (for needs: DAG resolution)
    const stageJobIds = new Map<string, string[]>();
    for (const stage of pipeline.stages) {
      stageJobIds.set(stage.name, stage.jobs.map((j) => toJobId(j.name)));
    }

    // Build a fresh rules array per job call to avoid YAML anchors from shared references
    const rulesTemplate = buildRules(pipeline.triggers);

    for (const stage of pipeline.stages) {
      const needsJobIds = (stage.dependsOn ?? []).flatMap((dep) => stageJobIds.get(dep) ?? []);

      for (const job of stage.jobs) {
        const jobKey = toJobId(job.name);
        const image = inferDockerImage(job);
        const script = buildScript(job.steps);
        const rules = rulesTemplate.map((r) => ({ ...r }));

        const jobObj: Record<string, unknown> = {};
        if (image) jobObj['image'] = image;
        jobObj['stage'] = stage.name;
        if (needsJobIds.length > 0) {
          jobObj['needs'] = needsJobIds.map((id) => ({ job: id }));
        }
        if (job.timeoutMinutes) jobObj['timeout'] = `${job.timeoutMinutes} minutes`;
        if (job.matrix) jobObj['parallel'] = buildGitlabMatrix(job.matrix);
        if (job.cache) jobObj['cache'] = buildGitlabCache(job.cache);
        jobObj['script'] = script.length > 0 ? script : ['echo "No steps"'];
        if (job.condition) jobObj['rules'] = [{ if: job.condition }];
        else jobObj['rules'] = rules;

        config[jobKey] = jobObj;
      }
    }

    return toYaml(config);
  }

  outputPath(_pipeline: Pipeline): string {
    return '.gitlab-ci.yml';
  }
}
