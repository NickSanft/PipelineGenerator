import type { Pipeline, Stage, Job, Step, Trigger, CacheConfig, MatrixConfig } from '../types/pipeline.js';

// ── Job Builder ───────────────────────────────────────────────────────────────

export class JobBuilder {
  private job: Job;

  constructor(name: string) {
    this.job = { name, runsOn: 'ubuntu-latest', steps: [] };
  }

  runsOn(runner: string): this {
    this.job.runsOn = runner;
    return this;
  }

  cache(config: CacheConfig): this {
    this.job.cache = config;
    return this;
  }

  matrix(config: MatrixConfig): this {
    this.job.matrix = config;
    return this;
  }

  condition(expr: string): this {
    this.job.condition = expr;
    return this;
  }

  timeout(minutes: number): this {
    this.job.timeoutMinutes = minutes;
    return this;
  }

  step(name: string, config: Omit<Step, 'name'>): this {
    this.job.steps.push({ name, ...config });
    return this;
  }

  build(): Job {
    if (this.job.steps.length === 0) {
      throw new Error(`Job "${this.job.name}" must have at least one step`);
    }
    return { ...this.job, steps: [...this.job.steps] };
  }
}

// ── Stage Builder ─────────────────────────────────────────────────────────────

export class StageBuilder {
  private stage: Stage;

  constructor(name: string) {
    this.stage = { name, jobs: [] };
  }

  dependsOn(...stageNames: string[]): this {
    this.stage.dependsOn = stageNames;
    return this;
  }

  job(name: string, configure: (job: JobBuilder) => JobBuilder): this {
    const builder = configure(new JobBuilder(name));
    this.stage.jobs.push(builder.build());
    return this;
  }

  build(): Stage {
    if (this.stage.jobs.length === 0) {
      throw new Error(`Stage "${this.stage.name}" must have at least one job`);
    }
    return { ...this.stage, jobs: [...this.stage.jobs] };
  }
}

// ── Pipeline Builder ──────────────────────────────────────────────────────────

export class PipelineBuilder {
  private pipeline: Pipeline;

  constructor(name: string) {
    this.pipeline = { name, triggers: [], env: {}, stages: [] };
  }

  trigger(config: Trigger): this {
    this.pipeline.triggers.push(config);
    return this;
  }

  env(key: string, value: string): this {
    this.pipeline.env[key] = value;
    return this;
  }

  stage(name: string, configure: (stage: StageBuilder) => StageBuilder): this {
    const builder = configure(new StageBuilder(name));
    this.pipeline.stages.push(builder.build());
    return this;
  }

  build(): Pipeline {
    this.validateDependencies();
    return {
      ...this.pipeline,
      triggers: [...this.pipeline.triggers],
      stages: [...this.pipeline.stages],
    };
  }

  private validateDependencies(): void {
    const stageNames = new Set(this.pipeline.stages.map((s) => s.name));
    for (const stage of this.pipeline.stages) {
      for (const dep of stage.dependsOn ?? []) {
        if (!stageNames.has(dep)) {
          throw new Error(
            `Stage "${stage.name}" depends on unknown stage "${dep}"`,
          );
        }
      }
    }
  }
}
