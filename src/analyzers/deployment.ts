import { anyFileExists } from '../utils/fs.js';
import type { DeployTarget } from '../types/manifest.js';
import fg from 'fast-glob';

/**
 * Detects deployment targets for a project directory.
 * Used as an enrichment step by the analyzer registry.
 */
export async function detectDeploymentTargets(projectRoot: string): Promise<DeployTarget[]> {
  const targets: DeployTarget[] = [];
  const checks = await Promise.all([
    detectKubernetes(projectRoot),
    detectServerless(projectRoot),
    detectStaticSite(projectRoot),
  ]);

  for (const target of checks) {
    if (target) targets.push(target);
  }

  return targets;
}

async function detectKubernetes(root: string): Promise<DeployTarget | null> {
  // Helm chart
  if (await anyFileExists(root, ['Chart.yaml', 'helm/Chart.yaml'])) {
    return { type: 'kubernetes', evidence: 'Chart.yaml (Helm)' };
  }
  // k8s manifests directory
  if (await anyFileExists(root, ['k8s', 'kubernetes', 'deploy/k8s'])) {
    return { type: 'kubernetes', evidence: 'k8s/ directory' };
  }
  // Any YAML with kind: Deployment/Service (scan top-level yamls only to keep it fast)
  const yamls = await fg('*.{yaml,yml}', { cwd: root, deep: 1 });
  for (const f of yamls) {
    const { readTextFile } = await import('../utils/fs.js');
    const content = await readTextFile(`${root}/${f}`);
    if (content?.match(/^kind:\s*(Deployment|Service|Ingress|StatefulSet)/m)) {
      return { type: 'kubernetes', evidence: f };
    }
  }
  return null;
}

async function detectServerless(root: string): Promise<DeployTarget | null> {
  if (await anyFileExists(root, ['serverless.yml', 'serverless.yaml', 'serverless.ts'])) {
    return { type: 'serverless', evidence: 'serverless.yml' };
  }
  if (await anyFileExists(root, ['template.yaml', 'template.yml', 'sam.yaml'])) {
    return { type: 'serverless', evidence: 'template.yaml (AWS SAM)' };
  }
  return null;
}

async function detectStaticSite(root: string): Promise<DeployTarget | null> {
  if (await anyFileExists(root, ['vercel.json', '.vercel'])) {
    return { type: 'static-site', evidence: 'vercel.json' };
  }
  if (await anyFileExists(root, ['netlify.toml', '.netlify'])) {
    return { type: 'static-site', evidence: 'netlify.toml' };
  }
  if (await anyFileExists(root, ['_config.yml', '_config.yaml'])) {
    return { type: 'static-site', evidence: '_config.yml (Jekyll/Hugo)' };
  }
  return null;
}
