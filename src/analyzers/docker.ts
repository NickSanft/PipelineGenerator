import { join } from 'node:path';
import { anyFileExists, readTextFile } from '../utils/fs.js';
import type { ArtifactType } from '../types/manifest.js';

export interface DockerInfo {
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  baseImage?: string;
  isMultiStage: boolean;
}

/**
 * Detects Docker-related configuration in a project directory.
 * Used as an enrichment step by the analyzer registry — not a standalone Analyzer.
 */
export async function detectDocker(projectRoot: string): Promise<DockerInfo> {
  const hasDockerfile = await anyFileExists(projectRoot, ['Dockerfile', 'Dockerfile.prod', 'Dockerfile.production']);
  const hasDockerCompose = await anyFileExists(projectRoot, ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']);

  if (!hasDockerfile) {
    return { hasDockerfile: false, hasDockerCompose, isMultiStage: false };
  }

  const content = await readTextFile(join(projectRoot, 'Dockerfile'));
  if (!content) {
    return { hasDockerfile: true, hasDockerCompose, isMultiStage: false };
  }

  const fromLines = content
    .split('\n')
    .filter((l) => /^FROM\s/i.test(l.trim()))
    .map((l) => l.trim());

  const isMultiStage = fromLines.length > 1;
  const firstFrom = fromLines[0] ?? '';
  // FROM node:20-alpine AS builder → "node:20-alpine"
  const baseImageMatch = firstFrom.match(/^FROM\s+(\S+)/i);
  const baseImage = baseImageMatch?.[1]?.replace(/\s+AS\s+\S+$/i, '');

  return { hasDockerfile, hasDockerCompose, baseImage, isMultiStage };
}

export function dockerArtifacts(info: DockerInfo): ArtifactType[] {
  return info.hasDockerfile ? ['docker-image'] : [];
}
