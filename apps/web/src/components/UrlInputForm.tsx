'use client';

import { useState, type FormEvent } from 'react';

interface Props {
  onSubmit: (url: string, platform: 'github-actions' | 'gitlab-ci', token?: string) => void;
  loading: boolean;
  defaultUrl?: string;
}

export function UrlInputForm({ onSubmit, loading, defaultUrl = '' }: Props) {
  const [url, setUrl] = useState(defaultUrl);
  const [platform, setPlatform] = useState<'github-actions' | 'gitlab-ci'>('github-actions');
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit(url.trim(), platform, token.trim() || undefined);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          required
          className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5
                     text-[var(--text)] placeholder-[var(--muted)] text-sm
                     focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                     transition"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)]
                     text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {/* Platform selector */}
      <div className="flex items-center gap-6">
        <span className="text-sm text-[var(--muted)]">Target:</span>
        {(['github-actions', 'gitlab-ci'] as const).map((p) => (
          <label key={p} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="platform"
              value={p}
              checked={platform === p}
              onChange={() => setPlatform(p)}
              className="accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text)]">
              {p === 'github-actions' ? 'GitHub Actions' : 'GitLab CI'}
            </span>
          </label>
        ))}

        <button
          type="button"
          onClick={() => setShowToken((v) => !v)}
          className="ml-auto text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          {showToken ? 'Hide token' : 'Private repo?'}
        </button>
      </div>

      {showToken && (
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="GitHub Personal Access Token (not stored)"
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5
                     text-[var(--text)] placeholder-[var(--muted)] text-sm
                     focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                     transition"
        />
      )}
    </form>
  );
}
