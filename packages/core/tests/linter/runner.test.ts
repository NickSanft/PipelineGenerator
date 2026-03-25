import { describe, it, expect } from 'vitest';
import { lintYaml, detectPlatformFromPath } from '../../src/linter/runner.js';

// ── detectPlatformFromPath ────────────────────────────────────────────────────

describe('detectPlatformFromPath()', () => {
  it('detects github-actions from workflow path', () => {
    expect(detectPlatformFromPath('.github/workflows/ci.yml')).toBe('github-actions');
    expect(detectPlatformFromPath('/repo/.github/workflows/release.yml')).toBe('github-actions');
  });

  it('detects gitlab-ci from .gitlab-ci.yml', () => {
    expect(detectPlatformFromPath('.gitlab-ci.yml')).toBe('gitlab-ci');
    expect(detectPlatformFromPath('/repo/.gitlab-ci.yml')).toBe('gitlab-ci');
  });

  it('returns null for unrecognised paths', () => {
    expect(detectPlatformFromPath('circle.yml')).toBeNull();
    expect(detectPlatformFromPath('bitbucket-pipelines.yml')).toBeNull();
  });
});

// ── lintYaml — parse error ────────────────────────────────────────────────────

describe('lintYaml() — parse error', () => {
  it('returns a parse-error issue for invalid YAML', () => {
    const result = lintYaml('{ not: valid: yaml: [', 'github-actions');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].rule).toBe('parse-error');
    expect(result.issues[0].severity).toBe('error');
    expect(result.summary.errors).toBe(1);
  });
});

// ── lintYaml — clean pipeline ─────────────────────────────────────────────────

describe('lintYaml() — clean GitHub Actions pipeline', () => {
  const CLEAN_YAML = `
name: CI
permissions: read-all
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8
        with:
          cache: npm
      - run: npm ci
      - run: npm test
`;

  it('reports no issues for a clean pipeline', () => {
    const result = lintYaml(CLEAN_YAML, 'github-actions');
    expect(result.issues).toHaveLength(0);
    expect(result.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
  });
});
