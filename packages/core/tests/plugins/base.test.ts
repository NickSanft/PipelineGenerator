import { describe, it, expect } from 'vitest';
import { runHook } from '../../src/plugins/base.js';
import type { Plugin } from '../../src/plugins/base.js';
import type { Pipeline } from '../../src/types/pipeline.js';

const emptyPipeline: Pipeline = { name: 'CI', triggers: [], env: {}, stages: [] };

describe('runHook()', () => {
  it('passes pipeline through plugins in order', () => {
    const calls: string[] = [];

    const p1: Plugin = {
      name: 'p1',
      description: '',
      hooks: {
        beforeGenerate(p) {
          calls.push('p1');
          return { ...p, name: 'p1' };
        },
      },
    };
    const p2: Plugin = {
      name: 'p2',
      description: '',
      hooks: {
        beforeGenerate(p) {
          calls.push('p2:' + p.name);
          return { ...p, name: 'p2' };
        },
      },
    };

    const result = runHook([p1, p2], 'beforeGenerate', emptyPipeline);
    expect(calls).toEqual(['p1', 'p2:p1']); // p2 sees p1's output
    expect(result.name).toBe('p2');
  });

  it('skips plugins that do not implement the hook', () => {
    const p1: Plugin = {
      name: 'no-hooks',
      description: '',
      hooks: {}, // no beforeGenerate
    };
    const p2: Plugin = {
      name: 'has-hook',
      description: '',
      hooks: {
        beforeGenerate(p) {
          return { ...p, name: 'modified' };
        },
      },
    };

    const result = runHook([p1, p2], 'beforeGenerate', emptyPipeline);
    expect(result.name).toBe('modified');
  });

  it('returns original value unchanged when plugins array is empty', () => {
    const result = runHook([], 'beforeGenerate', emptyPipeline);
    expect(result).toBe(emptyPipeline);
  });
});
