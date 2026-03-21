import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { PythonAnalyzer } from '../../src/analyzers/python.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

describe('PythonAnalyzer', () => {
  const analyzer = new PythonAnalyzer();

  describe('detect()', () => {
    it('detects a Python project with pyproject.toml', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'python-fastapi'))).toBe(true);
    });

    it('does not detect a Node project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'node-basic'))).toBe(false);
    });

    it('does not detect a Go project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'go-service'))).toBe(false);
    });
  });

  describe('analyze()', () => {
    it('produces a correct descriptor for python-fastapi', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'python-fastapi'));

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
