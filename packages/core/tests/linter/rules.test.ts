import { describe, it, expect } from 'vitest';
import { lintYaml } from '../../src/linter/runner.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function gaYaml(jobsYaml: string): string {
  return `
name: CI
on: { push: {} }
${jobsYaml}
`.trim();
}

function glYaml(body: string): string {
  return `
stages: [test]
${body}
`.trim();
}

// ── unpinned-actions ──────────────────────────────────────────────────────────

describe('unpinned-actions rule', () => {
  it('flags a tag reference', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - run: echo ok
`);
    const result = lintYaml(yaml, 'github-actions');
    const issues = result.issues.filter((i) => i.rule === 'unpinned-actions');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('actions/checkout@v4');
  });

  it('does not flag a SHA reference', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'unpinned-actions')).toHaveLength(0);
  });

  it('flags a branch ref (main)', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: my-org/my-action@main
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'unpinned-actions')).toHaveLength(1);
  });

  it('does not run on gitlab-ci', () => {
    const yaml = glYaml(`
test:
  stage: test
  timeout: 10 minutes
  cache:
    key: test
    paths: [node_modules/]
  script: [echo ok]
`);
    const result = lintYaml(yaml, 'gitlab-ci');
    expect(result.issues.filter((i) => i.rule === 'unpinned-actions')).toHaveLength(0);
  });
});

// ── missing-timeout ───────────────────────────────────────────────────────────

describe('missing-timeout rule', () => {
  it('flags a GitHub Actions job with no timeout', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    steps: []
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'missing-timeout')).toHaveLength(1);
  });

  it('does not flag a job with timeout-minutes', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps: []
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'missing-timeout')).toHaveLength(0);
  });

  it('flags a GitLab CI job with no timeout', () => {
    const yaml = glYaml(`
test:
  stage: test
  script: [echo ok]
`);
    const result = lintYaml(yaml, 'gitlab-ci');
    expect(result.issues.filter((i) => i.rule === 'missing-timeout')).toHaveLength(1);
  });

  it('does not flag a GitLab job with timeout', () => {
    const yaml = glYaml(`
test:
  stage: test
  timeout: 15 minutes
  script: [echo ok]
`);
    const result = lintYaml(yaml, 'gitlab-ci');
    expect(result.issues.filter((i) => i.rule === 'missing-timeout')).toHaveLength(0);
  });
});

// ── missing-permissions ───────────────────────────────────────────────────────

describe('missing-permissions rule', () => {
  it('flags a workflow with no permissions block', () => {
    const yaml = gaYaml(`
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps: []
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'missing-permissions')).toHaveLength(1);
  });

  it('does not flag when permissions: read-all is set', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps: []
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'missing-permissions')).toHaveLength(0);
  });

  it('flags jobs using write-all', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: write-all
    steps: []
`);
    const result = lintYaml(yaml, 'github-actions');
    const issues = result.issues.filter((i) => i.rule === 'missing-permissions');
    expect(issues.some((i) => i.message.includes('write-all'))).toBe(true);
  });
});

// ── missing-cache ─────────────────────────────────────────────────────────────

describe('missing-cache rule', () => {
  it('flags a job that runs npm ci without a cache step', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - run: npm ci
      - run: npm test
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'missing-cache')).toHaveLength(1);
  });

  it('does not flag when setup-node with cache: npm is present', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8
        with:
          cache: npm
      - run: npm ci
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'missing-cache')).toHaveLength(0);
  });

  it('does not flag jobs with no install command', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  notify:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: echo "done"
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'missing-cache')).toHaveLength(0);
  });
});

// ── unsafe-install ────────────────────────────────────────────────────────────

describe('unsafe-install rule', () => {
  it('flags npm install', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8
        with:
          cache: npm
      - run: npm install
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'unsafe-install')).toHaveLength(1);
    expect(result.issues.find((i) => i.rule === 'unsafe-install')?.severity).toBe('error');
  });

  it('does not flag npm ci', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8
        with:
          cache: npm
      - run: npm ci
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'unsafe-install')).toHaveLength(0);
  });

  it('flags yarn install without --frozen-lockfile', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: yarn install
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'unsafe-install')).toHaveLength(1);
  });
});

// ── secret-leak ───────────────────────────────────────────────────────────────

describe('secret-leak rule', () => {
  it('flags secret interpolated in run command', () => {
    // Use string concat to avoid ${ being parsed as a JS template expression
    const expr = '$' + '{{ secrets.API_TOKEN }}';
    const yaml = gaYaml(`
permissions: read-all
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: deploy --token ${expr}
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'secret-leak')).toHaveLength(1);
    expect(result.issues.find((i) => i.rule === 'secret-leak')?.severity).toBe('error');
  });

  it('does not flag secrets referenced via env:', () => {
    const envExpr = '$' + '{{ secrets.API_TOKEN }}';
    const yaml = gaYaml(`
permissions: read-all
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Call API
        run: curl -H "Authorization: $API_TOKEN" https://example.com
        env:
          API_TOKEN: ${envExpr}
`);
    const result = lintYaml(yaml, 'github-actions');
    expect(result.issues.filter((i) => i.rule === 'secret-leak')).toHaveLength(0);
  });

  it('flags set +x as info', () => {
    const yaml = gaYaml(`
permissions: read-all
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: |
          set +x
          echo "doing stuff"
`);
    const result = lintYaml(yaml, 'github-actions');
    const issues = result.issues.filter((i) => i.rule === 'secret-leak');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('info');
  });
});
