'use client';

import { useReducer } from 'react';
import { UrlInputForm } from '@/components/UrlInputForm';
import { AnalysisPanel } from '@/components/AnalysisPanel';
import { YamlPanel } from '@/components/YamlPanel';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import type { AnalyzeResponse } from '@/types/api';

// ── State machine ────────────────────────────────────────────────────────────

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: AnalyzeResponse & { highlightedHtml: string } }
  | { status: 'error'; message: string };

type Action =
  | { type: 'SUBMIT' }
  | { type: 'SUCCESS'; result: AnalyzeResponse & { highlightedHtml: string } }
  | { type: 'ERROR'; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SUBMIT':
      return { status: 'loading' };
    case 'SUCCESS':
      return { status: 'success', result: action.result };
    case 'ERROR':
      return { status: 'error', message: action.message };
    default:
      return state;
  }
}

// ── Example repos (W-7) ──────────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'Node.js', url: 'https://github.com/expressjs/express' },
  { label: 'Python', url: 'https://github.com/tiangolo/fastapi' },
  { label: 'Go', url: 'https://github.com/gin-gonic/gin' },
  { label: 'Java', url: 'https://github.com/spring-projects/spring-petclinic' },
  { label: 'Kotlin', url: 'https://github.com/NickSanft/ISO8583Tutorial' },
  { label: 'C#', url: 'https://github.com/jasontaylordev/CleanArchitecture' },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });

  async function handleAnalyze(
    url: string,
    platform: 'github-actions' | 'gitlab-ci',
    token?: string,
  ) {
    dispatch({ type: 'SUBMIT' });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, platform, token }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        dispatch({ type: 'ERROR', message: err.error ?? 'Unknown error' });
        return;
      }

      const data = (await res.json()) as AnalyzeResponse;

      // Request server-side Shiki highlighting
      const hlRes = await fetch('/api/highlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: data.yaml }),
      });
      const { html } = hlRes.ok
        ? ((await hlRes.json()) as { html: string })
        : { html: `<pre class="shiki"><code>${data.yaml}</code></pre>` };

      dispatch({ type: 'SUCCESS', result: { ...data, highlightedHtml: html } });
    } catch (err) {
      dispatch({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  return (
    <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 gap-8">
      {/* Hero */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Generate CI/CD pipelines{' '}
          <span className="text-[var(--accent)]">instantly</span>
        </h1>
        <p className="text-[var(--muted)] text-sm sm:text-base max-w-xl mx-auto">
          Paste any GitHub repository URL and get a production-ready pipeline in seconds.
          No sign-up required.
        </p>
      </div>

      {/* Input */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 sm:p-6">
        <UrlInputForm
          onSubmit={handleAnalyze}
          loading={state.status === 'loading'}
        />

        {/* Example buttons (W-7) */}
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[var(--muted)]">Try an example:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.url}
              type="button"
              onClick={() => handleAnalyze(ex.url, 'github-actions')}
              disabled={state.status === 'loading'}
              className="text-xs px-2.5 py-1 rounded border border-[var(--border)]
                         text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]
                         transition-colors disabled:opacity-40"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {state.status === 'loading' && <LoadingSkeleton />}

      {state.status === 'error' && <ErrorBanner message={state.message} />}

      {state.status === 'success' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-4">Analysis Results</h2>
            <AnalysisPanel manifest={state.result.manifest} meta={state.result.meta} />
          </div>

          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 sm:p-6 flex flex-col">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-4">Generated Pipeline</h2>
            <YamlPanel
              yaml={state.result.yaml}
              outputPath={state.result.outputPath}
              highlightedHtml={state.result.highlightedHtml}
            />
          </div>
        </div>
      )}
    </div>
  );
}
