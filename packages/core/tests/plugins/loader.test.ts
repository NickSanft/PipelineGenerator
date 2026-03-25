import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPlugins } from '../../src/plugins/loader.js';
import type { FileSystem } from '../../src/utils/fs-adapter.js';

function makeFs(rc: unknown): FileSystem {
  return {
    fileExists: vi.fn().mockResolvedValue(rc !== null),
    anyFileExists: vi.fn().mockResolvedValue(false),
    readTextFile: vi.fn().mockResolvedValue(rc !== null ? JSON.stringify(rc) : null),
    readJsonFile: vi.fn().mockResolvedValue(rc),
    glob: vi.fn().mockResolvedValue([]),
  };
}

describe('loadPlugins()', () => {
  it('returns empty plugins when no rc file exists', async () => {
    const { plugins, rc } = await loadPlugins('/', makeFs(null));
    expect(plugins).toHaveLength(0);
    expect(rc).toBeNull();
  });

  it('instantiates sonarqube plugin from rc', async () => {
    const { plugins } = await loadPlugins(
      '/',
      makeFs({
        plugins: ['sonarqube'],
        config: { sonarqube: { projectKey: 'my-proj' } },
      }),
    );
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('sonarqube');
  });

  it('instantiates slack-notify plugin from rc', async () => {
    const { plugins } = await loadPlugins(
      '/',
      makeFs({
        plugins: ['slack-notify'],
        config: { 'slack-notify': { channel: '#ci' } },
      }),
    );
    expect(plugins[0].name).toBe('slack-notify');
  });

  it('instantiates dependency-audit plugin with no config', async () => {
    const { plugins } = await loadPlugins('/', makeFs({ plugins: ['dependency-audit'] }));
    expect(plugins[0].name).toBe('dependency-audit');
  });

  it('instantiates docker-build plugin with no config', async () => {
    const { plugins } = await loadPlugins('/', makeFs({ plugins: ['docker-build'] }));
    expect(plugins[0].name).toBe('docker-build');
  });

  it('instantiates multiple plugins in order', async () => {
    const { plugins } = await loadPlugins(
      '/',
      makeFs({
        plugins: ['dependency-audit', 'sonarqube', 'slack-notify'],
        config: {
          sonarqube: { projectKey: 'p' },
          'slack-notify': { channel: '#c' },
        },
      }),
    );
    expect(plugins.map((p) => p.name)).toEqual(['dependency-audit', 'sonarqube', 'slack-notify']);
  });

  it('skips unknown plugins with a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { plugins } = await loadPlugins('/', makeFs({ plugins: ['unknown-plugin'] }));
    expect(plugins).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown-plugin'));
    warnSpy.mockRestore();
  });

  it('returns rc.target when set', async () => {
    const { rc } = await loadPlugins(
      '/',
      makeFs({ target: 'gitlab-ci', plugins: [] }),
    );
    expect(rc?.target).toBe('gitlab-ci');
  });
});
