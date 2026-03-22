import { describe, it, expect } from 'vitest';
import { unifiedDiff } from '../../src/utils/diff.js';

describe('unifiedDiff', () => {
  it('returns empty string when inputs are identical', () => {
    const text = 'line1\nline2\nline3\n';
    expect(unifiedDiff(text, text)).toBe('');
  });

  it('includes --- and +++ headers', () => {
    const diff = unifiedDiff('old\n', 'new\n', 'existing', 'generated');
    expect(diff).toContain('--- existing');
    expect(diff).toContain('+++ generated');
  });

  it('marks added lines with +', () => {
    const diff = unifiedDiff('line1\n', 'line1\nline2\n');
    expect(diff).toContain('+line2');
  });

  it('marks removed lines with -', () => {
    const diff = unifiedDiff('line1\nline2\n', 'line1\n');
    expect(diff).toContain('-line2');
  });

  it('does not mark unchanged lines as added or removed', () => {
    const diff = unifiedDiff('a\nb\nc\n', 'a\nX\nc\n');
    const lines = diff.split('\n').filter((l) => l.startsWith('+') || l.startsWith('-'));
    const unchanged = lines.filter((l) => l === '+a' || l === '-a' || l === '+c' || l === '-c');
    expect(unchanged).toHaveLength(0);
  });

  it('includes @@ hunk header', () => {
    const diff = unifiedDiff('a\n', 'b\n');
    expect(diff).toContain('@@');
  });

  it('handles completely different content', () => {
    const diff = unifiedDiff('old content\n', 'new content\n');
    expect(diff).toContain('-old content');
    expect(diff).toContain('+new content');
  });

  it('handles empty old text (new file)', () => {
    const diff = unifiedDiff('', 'line1\nline2\n');
    expect(diff).toContain('+line1');
    expect(diff).toContain('+line2');
  });

  it('handles empty new text (deleted content)', () => {
    const diff = unifiedDiff('line1\nline2\n', '');
    expect(diff).toContain('-line1');
    expect(diff).toContain('-line2');
  });

  it('shows context lines around changes', () => {
    const text = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n');
    const modified = text.replace('line5', 'CHANGED');
    const diff = unifiedDiff(text, modified);
    // Lines near the change should appear as context
    expect(diff).toContain(' line4');
  });
});
