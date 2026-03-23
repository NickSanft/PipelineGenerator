import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { PythonAnalyzer } from '../../src/analyzers/python.js';
import { LocalFileSystem } from '../../src/utils/fs-adapter.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');
const fs = new LocalFileSystem();

describe('PythonAnalyzer', () => {
  const analyzer = new PythonAnalyzer();

  describe('detect()', () => {
    it('detects a Python project with pyproject.toml', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'python-fastapi'), fs)).toBe(true);
    });

    it('does not detect a Node project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'node-basic'), fs)).toBe(false);
    });

    it('does not detect a Go project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'go-service'), fs)).toBe(false);
    });
  });

  describe('analyze()', () => {
    it('produces a correct descriptor for python-fastapi', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'python-fastapi'), fs);

      expect(descriptor.name).toBe('python-fastapi');
      expect(descriptor.language).toBe('python');
      expect(descriptor.framework).toBe('fastapi');
      expect(descriptor.packageManager).toBe('pip');
      expect(descriptor.testRunner).toBe('pytest');
      expect(descriptor.buildTool).toBe('hatch');
      expect(descriptor.artifacts).toContain('wheel');
    });
  });
});
