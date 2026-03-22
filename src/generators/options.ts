/** Options that flow from the CLI (interactive or flags) into the generators. */
export interface GeneratorOptions {
  /** Minimum test coverage percentage (0–100). undefined = no gate */
  coverageThreshold?: number;
  /** Slack channel for failure notifications, e.g. "#builds". undefined = skip */
  slackChannel?: string;
  /** Explicitly disable the Docker push stage even if a Dockerfile is present */
  skipDockerPush?: boolean;
}
