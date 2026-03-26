import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { CSharpAnalyzer } from '../../src/analyzers/csharp.js';
import { LocalFileSystem } from '../../src/utils/fs-adapter.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');
const fs = new LocalFileSystem();

describe('CSharpAnalyzer', () => {
  const analyzer = new CSharpAnalyzer();

  // ── detect() ────────────────────────────────────────────────────────────────

  describe('detect()', () => {
    it('detects a .NET Web API project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'dotnet-webapi'), fs)).toBe(true);
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

    it('does not detect a Java project', async () => {
      expect(await analyzer.detect(join(FIXTURES, 'java-maven'), fs)).toBe(false);
    });
  });

  // ── analyze() ────────────────────────────────────────────────────────────────

  describe('analyze()', () => {
    it('produces the correct descriptor', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'dotnet-webapi'), fs);

      expect(descriptor.name).toBe('MyWebApi');
      expect(descriptor.language).toBe('csharp');
      expect(descriptor.packageManager).toBe('dotnet');
      expect(descriptor.buildTool).toBe('dotnet');
    });

    it('detects ASP.NET Core framework', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'dotnet-webapi'), fs);
      expect(descriptor.framework).toBe('aspnet');
    });

    it('detects xUnit test runner', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'dotnet-webapi'), fs);
      expect(descriptor.testRunner).toBe('xunit');
    });

    it('extracts the .NET version into raw metadata', async () => {
      const descriptor = await analyzer.analyze(join(FIXTURES, 'dotnet-webapi'), fs);
      expect((descriptor.raw as { dotnetVersion?: string })?.dotnetVersion).toBe('9.0');
    });
  });
});
