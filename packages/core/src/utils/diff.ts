/**
 * Minimal unified diff implementation.
 * Produces output similar to `diff -u oldFile newFile`.
 * Uses Myers' diff algorithm (O(ND) variant).
 */

interface Edit {
  type: 'equal' | 'insert' | 'delete';
  line: string;
}

/** Compute the shortest edit sequence using a simple greedy LCS approach. */
function computeEdits(oldLines: string[], newLines: string[]): Edit[] {
  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Trace back
  const edits: Edit[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      edits.push({ type: 'equal', line: oldLines[i] });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      edits.push({ type: 'insert', line: newLines[j] });
      j++;
    } else {
      edits.push({ type: 'delete', line: oldLines[i] });
      i++;
    }
  }
  return edits;
}

/**
 * Produce a unified diff string between two texts.
 * @param oldText  The existing file content.
 * @param newText  The newly generated content.
 * @param fromFile Label for the old file (e.g., existing path).
 * @param toFile   Label for the new file (e.g., "generated").
 * @param context  Number of unchanged context lines around each hunk (default: 3).
 */
export function unifiedDiff(
  oldText: string,
  newText: string,
  fromFile = 'existing',
  toFile = 'generated',
  context = 3,
): string {
  if (oldText === newText) return '';

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const edits = computeEdits(oldLines, newLines);

  // Convert edits to line-indexed hunks
  // Track old/new line numbers
  let oldLineNo = 1;
  let newLineNo = 1;

  interface HunkLine {
    tag: '+' | '-' | ' ';
    text: string;
    oldLineNo?: number;
    newLineNo?: number;
  }

  const allLines: HunkLine[] = [];
  for (const edit of edits) {
    if (edit.type === 'equal') {
      allLines.push({ tag: ' ', text: edit.line, oldLineNo, newLineNo });
      oldLineNo++; newLineNo++;
    } else if (edit.type === 'delete') {
      allLines.push({ tag: '-', text: edit.line, oldLineNo });
      oldLineNo++;
    } else {
      allLines.push({ tag: '+', text: edit.line, newLineNo });
      newLineNo++;
    }
  }

  // Find changed line indices
  const changedIndices = allLines.reduce<number[]>((acc, l, i) => {
    if (l.tag !== ' ') acc.push(i);
    return acc;
  }, []);

  if (changedIndices.length === 0) return '';

  // Group into hunks with context
  const hunks: Array<[number, number]> = [];
  let hunkStart = changedIndices[0] - context;
  let hunkEnd = changedIndices[0] + context;

  for (let k = 1; k < changedIndices.length; k++) {
    const idx = changedIndices[k];
    if (idx - context <= hunkEnd) {
      hunkEnd = idx + context;
    } else {
      hunks.push([Math.max(0, hunkStart), Math.min(allLines.length - 1, hunkEnd)]);
      hunkStart = idx - context;
      hunkEnd = idx + context;
    }
  }
  hunks.push([Math.max(0, hunkStart), Math.min(allLines.length - 1, hunkEnd)]);

  const resultLines: string[] = [
    `--- ${fromFile}`,
    `+++ ${toFile}`,
  ];

  for (const [start, end] of hunks) {
    const slice = allLines.slice(start, end + 1);
    const oldCount = slice.filter((l) => l.tag !== '+').length;
    const newCount = slice.filter((l) => l.tag !== '-').length;
    const oldStart = slice.find((l) => l.oldLineNo !== undefined)?.oldLineNo ?? 1;
    const newStart = slice.find((l) => l.newLineNo !== undefined)?.newLineNo ?? 1;
    resultLines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const l of slice) {
      resultLines.push(`${l.tag}${l.text}`);
    }
  }

  return resultLines.join('\n');
}
