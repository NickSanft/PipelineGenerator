import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { JavaAnalyzer } from '../../src/analyzers/java.js';
import { LocalFileSystem } from '../../src/utils/fs-adapter.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');
const fs = new LocalFileSystem();

describe('JavaAnalyzer', () => {
  const analyzer = new JavaAnalyzer();

  // ── detect() ────────────────────────────────────────────────────────────────

  describe('detect()', () => {
    it('detects a Maven project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'java-maven'), fs)).toBe(true);
    });

    it('detects a Kotlin Gradle project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'kotlin-gradle'), fs)).toBe(true);
    });

    it('does not detect a Node project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'node-basic'), fs)).toBe(false);
    });

    it('does not detect a Python project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'python-fastapi'), fs)).toBe(false);
    });

    it('does not detect a Go project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'go-service'), fs)).toBe(false);
    });
  });

  // ── analyze() — Maven ────────────────────────────────────────────────────────

  describe('analyze() — Maven', () => {
    it('produces the correct descriptor', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'java-maven'), fs);

      expect(descriptor.name).toBe('java-maven');
      expect(descriptor.language).toBe('java');
      expect(descriptor.packageManager).toBe('maven');
      expect(descriptor.buildTool).toBe('mvn');
      expect(descriptor.testRunner).toBe('junit');
    });

    it('detects Spring Boot framework', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'java-maven'), fs);
      expect(descriptor.framework).toBe('spring-boot');
    });
  });

  // ── analyze() — Kotlin Gradle ────────────────────────────────────────────────

  describe('analyze() — Kotlin Gradle', () => {
    it('produces the correct descriptor', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'kotlin-gradle'), fs);

      expect(descriptor.name).toBe('kotlin-service');
      expect(descriptor.language).toBe('kotlin');
      expect(descriptor.packageManager).toBe('gradle');
      expect(descriptor.testRunner).toBe('junit');
    });

    it('detects Spring Boot framework', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'kotlin-gradle'), fs);
      expect(descriptor.framework).toBe('spring-boot');
    });
  });
});
