export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'java'
  | 'rust'
  | 'unknown';

export interface DeployTarget {
  type: 'kubernetes' | 'serverless' | 'static-site' | 'vm' | 'unknown';
  /** The file or config that triggered this detection */
  evidence: string;
}

export interface ProjectDescriptor {
  name: string;
  /** Relative path from repo root */
  path: string;
  language: Language;
  framework?: string; // e.g. "nextjs", "fastapi", "gin"
  packageManager?: string; // npm, yarn, pnpm, pip, poetry, go modules
  testRunner?: string; // jest, vitest, pytest, go test
  buildTool?: string; // webpack, vite, tsc, go build
  hasDockerfile: boolean;
  deploymentTargets: DeployTarget[];
  artifacts: ArtifactType[];
}

export type ArtifactType = 'docker-image' | 'npm-package' | 'binary' | 'wheel' | 'unknown';

export interface VCSInfo {
  defaultBranch: string;
  hasReleaseBranches: boolean;
  branchPattern?: string;
}

export interface ProjectManifest {
  root: string;
  projects: ProjectDescriptor[];
  vcs: VCSInfo;
  /** Escape hatch for analyzer-specific raw data */
  raw: Record<string, unknown>;
}
