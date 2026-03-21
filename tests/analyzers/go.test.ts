import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { GoAnalyzer } from '../../src/analyzers/go.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

describe('GoAnalyzer', () => {
  const analyzer = new GoAnalyzer();

  describe('detect()', () => {
    it('detects a Go project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'go-service'))).toBe(true);
    });

    it('does not detect a Node project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'node-basic'))).toBe(false);
    });

    it('does not detect a Python project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'python-fastapi'))).toBe(false);
    });
  });

  describe('analyze()', () => {
    it('produces a correct descriptor for go-service', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'go-service'));

      expect(descriptor.name).toBe('go-service');
      expect(descriptor.language).toBe('go');
      expect(descriptor.framework).toBe('gin');
      expect(descriptor.packageManager).toBe('go modules');
      expect(descriptor.testRunner).toBe('go test');
      expect(descriptor.buildTool).toBe('go build');
      expect(descriptor.artifacts).toContain('binary'); // has main.go
    });
  });
});
