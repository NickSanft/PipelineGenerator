'use client';

import { useState } from 'react';

interface Props {
  yaml: string;
  outputPath: string;
  highlightedHtml: string;
}

export function YamlPanel({ yaml, outputPath, highlightedHtml }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outputPath.split('/').pop() ?? 'pipeline.yml';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[var(--muted)] font-mono">{outputPath}</span>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="text-xs px-3 py-1 rounded border border-[var(--border)]
                       text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]
                       transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="text-xs px-3 py-1 rounded border border-[var(--border)]
                       text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]
                       transition-colors"
          >
            Download
          </button>
        </div>
      </div>
      <div
        className="flex-1 overflow-auto rounded-lg border border-[var(--border)]"
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    </div>
  );
}
