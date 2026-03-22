import type { PipelineRenderer } from './base.js';
import type { Pipeline, Stage, Job, Step, Trigger, CacheConfig, MatrixConfig, Permissions } from '../types/pipeline.js';
import { KNOWN_ACTIONS } from '../utils/known-actions.js';
import { toYaml } from '../utils/yaml.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a human-readable name to a valid GitHub Actions job ID */
function toJobId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\$\{\{[^}]*\}\}/g, '') // strip GHA expressions
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── Trigger serialization ─────────────────────────────────────────────────────

function buildTriggers(triggers: Trigger[]): Record<string, unknown> {
  const on: Record<string, unknown> = {};

  for (const t of triggers) {
    switch (t.type) {
      case 'push':
        on['push'] = {
          ...(t.branches?.length && { branches: t.branches }),
          ...(t.paths?.length && { paths: t.paths }),
        };
        break;
      case 'pull_request':
        on['pull_request'] = {
          ...(t.branches?.length && { branches: t.branches }),
          ...(t.paths?.length && { paths: t.paths }),
        };
        break;
      case 'schedule':
        on['schedule'] = [{ cron: t.cron }];
        break;
      case 'manual':
        on['workflow_dispatch'] = {};
        break;
    }
  }

  return on;
}

// ── Permissions serialization ─────────────────────────────────────────────────

function buildPermissions(permissions: Permissions): unknown {
  const { default: def, ...specific } = permissions;
  const hasSpecific = Object.keys(specific).length > 0;

  if (!hasSpecific) {
    // Pure shorthand: permissions: read-all or write-all
    return def ?? undefined;
  }

  // Mix of default + overrides — emit explicit scopes
  const result: Record<string, string> = {};
  if (def === 'read-all') result['contents'] = 'read';

  const keyMap: [keyof typeof specific, string][] = [
    ['contents',       'contents'],
    ['packages',       'packages'],
    ['idToken',        'id-token'],
    ['pullRequests',   'pull-requests'],
    ['securityEvents', 'security-events'],
  ];

  for (const [propKey, yamlKey] of keyMap) {
    const val = specific[propKey];
    if (val !== undefined) result[yamlKey] = val;
  }

  return result;
}

// ── Strategy / matrix ─────────────────────────────────────────────────────────

function buildStrategy(matrix: MatrixConfig): Record<string, unknown> {
  return {
    'fail-fast': false,
    matrix: {
      ...matrix.dimensions,
      ...(matrix.exclude?.length && { exclude: matrix.exclude }),
    },
  };
}

// ── Cache step injection ──────────────────────────────────────────────────────

function buildCacheStep(cache: CacheConfig): Record<string, unknown> {
  const pathValue = cache.paths.length === 1 ? cache.paths[0] : cache.paths.join('\n');
  const step: Record<string, unknown> = {
    name: 'Cache dependencies',
    uses: `${KNOWN_ACTIONS.cache.action}@${KNOWN_ACTIONS.cache.sha}`,
    with: {
      key: cache.key,
      path: pathValue,
    },
  };

  if (cache.restoreKeys?.length) {
    (step['with'] as Record<string, string>)['restore-keys'] = cache.restoreKeys.join('\n');
  }

  return step;
}

// ── Step serialization ────────────────────────────────────────────────────────

function buildStep(step: Step): Record<string, unknown> {
  const out: Record<string, unknown> = { name: step.name };

  if (step.type === 'action') {
    out['uses'] = `${step.action}@${step.actionVersion}`;
    if (step.with && Object.keys(step.with).length > 0) out['with'] = step.with;
  } else {
    out['run'] = step.run;
  }

  if (step.env && Object.keys(step.env).length > 0) out['env'] = step.env;
  if (step.condition) out['if'] = step.condition;

  return out;
}

function buildSteps(job: Job): Record<string, unknown>[] {
  const steps: Record<string, unknown>[] = [];
  let cacheInjected = false;

  for (const step of job.steps) {
    steps.push(buildStep(step));

    // Inject actions/cache right after the first checkout step
    if (!cacheInjected && job.cache && step.action === 'actions/checkout') {
      steps.push(buildCacheStep(job.cache));
      cacheInjected = true;
    }
  }

  // No checkout found but cache requested — prepend
  if (!cacheInjected && job.cache) {
    steps.unshift(buildCacheStep(job.cache));
  }

  return steps;
}

// ── Job serialization ─────────────────────────────────────────────────────────

function buildJob(job: Job, needs: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  out['name'] = job.name;
  out['runs-on'] = job.runsOn;
  if (needs.length > 0) out['needs'] = needs;
  if (job.timeoutMinutes) out['timeout-minutes'] = job.timeoutMinutes;
  if (job.condition) out['if'] = job.condition;
  if (job.matrix) out['strategy'] = buildStrategy(job.matrix);
  out['steps'] = buildSteps(job);

  return out;
}

// ── Jobs map ──────────────────────────────────────────────────────────────────

function buildJobs(pipeline: Pipeline): Record<string, unknown> {
  // Stage name → list of job IDs it contains (for needs resolution)
  const stageJobIds = new Map<string, string[]>();
  for (const stage of pipeline.stages) {
    stageJobIds.set(stage.name, stage.jobs.map((j) => toJobId(j.name)));
  }

  const jobs: Record<string, unknown> = {};

  for (const stage of pipeline.stages) {
    const needs = (stage.dependsOn ?? []).flatMap((dep) => stageJobIds.get(dep) ?? []);

    for (const job of stage.jobs) {
      jobs[toJobId(job.name)] = buildJob(job, needs);
    }
  }

  return jobs;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

export class GithubActionsRenderer implements PipelineRenderer {
  readonly platform = 'github-actions';

  render(pipeline: Pipeline): string {
    const workflow: Record<string, unknown> = {};

    workflow['name'] = pipeline.name;
    workflow['on'] = buildTriggers(pipeline.triggers);

    if (pipeline.permissions) {
      workflow['permissions'] = buildPermissions(pipeline.permissions);
    }

    if (Object.keys(pipeline.env).length > 0) {
      workflow['env'] = pipeline.env;
    }

    workflow['jobs'] = buildJobs(pipeline);

    return toYaml(workflow);
  }

  outputPath(pipeline: Pipeline): string {
    return `.github/workflows/${slugify(pipeline.name)}.yml`;
  }
}
