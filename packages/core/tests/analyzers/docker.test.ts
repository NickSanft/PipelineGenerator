import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { detectDocker } from '../../src/analyzers/docker.js';
import { LocalFileSystem } from '../../src/utils/fs-adapter.js';

const fs = new LocalFileSystem();

const TMP = join(import.meta.dirname, '../fixtures/_docker-tmp');

beforeAll(async () => {
  await mkdir(TMP, { recursive: true });
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe('detectDocker()', () => {
  it('returns hasDockerfile: false when no Dockerfile exists', async () => {
    const result = await detectDocker(join(import.meta.dirname, '../fixtures/go-service'), fs);
    expect(result.hasDockerfile).toBe(false);
  });

  it('detects a simple Dockerfile', async () => {
    await writeFile(
      join(TMP, 'Dockerfile'),
      'FROM node:20-alpine\nRUN npm install\nCMD ["node", "index.js"]\n',
    );
    const result = await detectDocker(TMP, fs);
    expect(result.hasDockerfile).toBe(true);
    expect(result.baseImage).toBe('node:20-alpine');
    expect(result.isMultiStage).toBe(false);
  });

  it('detects a multi-stage Dockerfile', async () => {
    await writeFile(
      join(TMP, 'Dockerfile'),
      'FROM node:20-alpine AS builder\nRUN npm ci\nFROM node:20-alpine\nCOPY --from=builder /app .\n',
    );
    const result = await detectDocker(TMP, fs);
    expect(result.isMultiStage).toBe(true);
    expect(result.baseImage).toBe('node:20-alpine');
  });
});
