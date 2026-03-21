import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { NodeAnalyzer } from '../../src/analyzers/node.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

describe('NodeAnalyzer', () => {
  const analyzer = new NodeAnalyzer();

  describe('detect()', () => {
    it('detects a Node project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'node-basic'))).toBe(true);
    });

    it('does not detect a Python project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'python-fastapi'))).toBe(false);
    });

    it('does not detect a Go project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'go-service'))).toBe(false);
    });
  });

  describe('analyze()', () => {
    it('produces a correct descriptor for node-basic', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'node-basic'));

      expect(descriptor.name).toBe('node-basic');
      expect(descriptor.language).toBe('typescript'); // has typescript in devDeps
      expect(descriptor.framework).toBe('express');
      expect(descriptor.packageManager).toBe('npm'); // has package-lock.json
      expect(descriptor.testRunner).toBe('jest');
      expect(descriptor.buildTool).toBe('tsc');
      expect(descriptor.artifacts).toContain('npm-package');
    });

    it('detects pnpm from lockfile', async () => {
      // node-monorepo/packages/api has no lockfile → npm
      const descriptor = await analyzer.analyze(join(FIXTURES, 'node-monorepo', 'packages', 'api'));
      expect(descriptor.packageManager).toBe('npm');
    });

    it('detects nextjs framework', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'node-monorepo', 'packages', 'web'));
      expect(descriptor.framework).toBe('nextjs');
      expect(descriptor.testRunner).toBe('jest');
    });

    it('defaults hasDockerfile to false', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'node-basic'));
      expect(descriptor.hasDockerfile).toBe(false);
    });
  });
});
