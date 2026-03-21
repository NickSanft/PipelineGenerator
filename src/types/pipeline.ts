export interface Trigger {
  type: 'push' | 'pull_request' | 'schedule' | 'manual';
  branches?: string[];
  /** For monorepo path-filtered triggers */
  paths?: string[];
  cron?: string;
}

export interface CacheConfig {
  key: string;
  paths: string[];
  restoreKeys?: string[];
}

export interface MatrixConfig {
  dimensions: Record<string, string[]>;
  exclude?: Record<string, string>[];
}

export interface ServiceContainer {
  name: string;
  image: string;
  env?: Record<string, string>;
  ports?: number[];
}

export interface Step {
  name: string;
  type: 'run' | 'action' | 'plugin';
  run?: string;
  action?: string; // e.g. "actions/checkout"
  /** SHA pin — required when type is "action" */
  actionVersion?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
  condition?: string;
}

export interface Job {
  name: string;
  runsOn: string; // e.g. "ubuntu-latest"
  services?: ServiceContainer[];
  matrix?: MatrixConfig;
  steps: Step[];
  condition?: string;
  timeoutMinutes?: number;
  cache?: CacheConfig;
}

export interface Stage {
  name: string;
  /** Names of stages this stage depends on — enables DAG execution */
  dependsOn?: string[];
  jobs: Job[];
}

export interface Notification {
  type: 'slack' | 'email' | 'webhook';
  on: ('success' | 'failure' | 'always')[];
  target: string; // channel, address, or URL
}

export interface Pipeline {
  name: string;
  triggers: Trigger[];
  env: Record<string, string>;
  stages: Stage[];
  notifications?: Notification[];
}
