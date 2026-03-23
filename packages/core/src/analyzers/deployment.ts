import type { FileSystem } from '../utils/fs-adapter.js';
import type { DeployTarget } from '../types/manifest.js';

/**
 * Detects deployment targets for a project directory.
 * Used as an enrichment step by the analyzer registry.
 */
export async function detectDeploymentTargets(projectRoot: string, fs: FileSystem): Promise<DeployTarget[]> {
  const targets: DeployTarget[] = [];
  const checks = await Promise.all([
    detectKubernetes(projectRoot, fs),
    detectServerless(projectRoot, fs),
    detectStaticSite(projectRoot, fs),
  ]);

  for (const target of checks) {
    if (target) targets.push(target);
  }

  return targets;
}

async function detectKubernetes(root: string, fs: FileSystem): Promise<DeployTarget | null> {
  if (await fs.anyFileExists(root, ['Chart.yaml', 'helm/Chart.yaml'])) {
    return { type: 'kubernetes', evidence: 'Chart.yaml (Helm)' };
  }
  if (await fs.anyFileExists(root, ['k8s', 'kubernetes', 'deploy/k8s'])) {
    return { type: 'kubernetes', evidence: 'k8s/ directory' };
  }
  const yamls = await fs.glob('*.{yaml,yml}', { cwd: root });
  for (const f of yamls) {
    const content = await fs.readTextFile(`${root}/${f}`);
    if (content?.match(/^kind:\s*(Deployment|Service|Ingress|StatefulSet)/m)) {
      return { type: 'kubernetes', evidence: f };
    }
  }
  return null;
}

async function detectServerless(root: string, fs: FileSystem): Promise<DeployTarget | null> {
  if (await fs.anyFileExists(root, ['serverless.yml', 'serverless.yaml', 'serverless.ts'])) {
    return { type: 'serverless', evidence: 'serverless.yml' };
  }
  if (await fs.anyFileExists(root, ['template.yaml', 'template.yml', 'sam.yaml'])) {
    return { type: 'serverless', evidence: 'template.yaml (AWS SAM)' };
  }
  return null;
}

async function detectStaticSite(root: string, fs: FileSystem): Promise<DeployTarget | null> {
  if (await fs.anyFileExists(root, ['vercel.json', '.vercel'])) {
    return { type: 'static-site', evidence: 'vercel.json' };
  }
  if (await fs.anyFileExists(root, ['netlify.toml', '.netlify'])) {
    return { type: 'static-site', evidence: 'netlify.toml' };
  }
  if (await fs.anyFileExists(root, ['_config.yml', '_config.yaml'])) {
    return { type: 'static-site', evidence: '_config.yml (Jekyll/Hugo)' };
  }
  return null;
}
