# Web UI Implementation Plan

## Overview

A Next.js 14 app where you paste a GitHub URL and get a live preview of the generated pipeline YAML. Shares all analysis/generation logic with the CLI through a shared `@pipeline-gen/core` package.

---

## Architecture Decision: pnpm Monorepo

**Do not** add Next.js alongside the CLI in the same package. The reasons are concrete:

1. **`tsconfig.json` conflict** — CLI uses `module: NodeNext`; Next.js 14 requires `module: ESNext` + `moduleResolution: Bundler`. These cannot coexist in one config.
2. **`fast-glob` and `node:*` imports** — These must never reach the Next.js webpack bundler. A package boundary enforces this automatically.
3. **Independent deployment** — CLI publishes to npm; web app deploys to Vercel. Separate packages make this natural.

### Final layout

```
pipeline-gen/
  pnpm-workspace.yaml
  package.json                       ← private workspace root
  packages/
    core/                            ← @pipeline-gen/core (moved from src/)
      package.json
      tsconfig.json                  ← NodeNext (unchanged)
      src/
        analyzers/  generators/  renderers/  builder/  types/  utils/
      index.ts                       ← public barrel export
  apps/
    cli/                             ← "pipeline-gen" npm package (thin wrapper)
      package.json
      src/cli/
    web/                             ← @pipeline-gen/web (Next.js)
      package.json
      tsconfig.json                  ← ESNext/Bundler for Next.js
      src/app/  src/components/  src/lib/
  tests/                             ← moved into packages/core/tests/ and apps/cli/tests/
```

---

## The Key Design Insight: FileSystem Adapter

Every analyzer calls `fileExists`, `readTextFile`, `readJsonFile`, and `fast-glob` — all of which operate on a local disk. The web server cannot clone repos (serverless has no persistent disk; cloning is slow and insecure).

**Solution:** refactor the analyzer interface to accept an injected `FileSystem` adapter. Provide two implementations:

- `LocalFileSystem` — wraps the existing `node:fs/promises` + `fast-glob` (CLI, unchanged behavior)
- `GitHubFileSystem` — backed by the GitHub Contents API (web server)

```typescript
// packages/core/src/utils/fs-adapter.ts
export interface FileSystem {
  fileExists(path: string): Promise<boolean>;
  anyFileExists(dir: string, filenames: string[]): Promise<boolean>;
  readTextFile(path: string): Promise<string | null>;
  readJsonFile<T = unknown>(path: string): Promise<T | null>;
  glob(pattern: string, options: { cwd: string; onlyDirectories?: boolean; ignore?: string[] }): Promise<string[]>;
}
```

The `Analyzer` interface gains an `fs` parameter:
```typescript
detect(repoRoot: string, fs: FileSystem): Promise<boolean>;
analyze(repoRoot: string, fs: FileSystem): Promise<ProjectDescriptor>;
```

Everything downstream (generators, renderers, builder) is **unchanged** — they operate on `ProjectManifest` and `Pipeline`, not the filesystem.

---

## GitHub API Integration

The `GitHubFileSystem` adapter:
1. **On construction:** calls `GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1` once to get the full flat file tree. All `fileExists` / `glob` calls are O(1) lookups against this cached tree.
2. **On demand:** calls `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}` and decodes base64 content. Results are cached per path.

This means a typical repo analysis costs **1 tree fetch + 5–15 file fetches** — fast enough for a web response.

### Rate limiting strategy
- Server-side `GITHUB_TOKEN` env var (never exposed to browser) — 5,000 req/hour
- In-memory LRU cache keyed by `${owner}/${repo}@${sha}` with 5-minute TTL
- Per-IP token bucket: 10 analyses/hour for anonymous visitors
- Optional: user can paste their own GitHub PAT in the UI (used for that request only, never stored)

### URL parsing
Accepts:
- `https://github.com/owner/repo`
- `https://github.com/owner/repo/tree/branch`
- `https://github.com/owner/repo/tree/branch/subdir` (monorepo subfolder)

---

## Tech Stack (web app)

| Package | Purpose |
|---------|---------|
| `next@14` | App Router, React Server Components, Route Handlers |
| `react@18` | UI |
| `tailwindcss@3` | Styling |
| `shadcn/ui` | Button, Card, Tabs, Skeleton components |
| `shiki@1` | YAML syntax highlighting — runs server-side, zero client JS |
| `zod@3` | Already in core; reused for API request validation |

No tRPC, no React Query, no Redux, no database — not needed for a demo app.

---

## API Design

### `POST /api/analyze`

Request:
```typescript
{ url: string; platform: 'github-actions' | 'gitlab-ci'; token?: string }
```

Response:
```typescript
{
  manifest: ProjectManifest;
  pipeline: Pipeline;
  yaml: string;           // rendered + syntax-highlighted HTML
  outputPath: string;     // e.g. ".github/workflows/ci.yml"
  meta: { owner: string; repo: string; ref: string; analyzedAt: string; }
}
```

Handler flow: validate → rate limit check → parse URL → cache lookup → `GitHubFileSystem` → `analyzeRepo` → `generatePipeline` → renderer → return JSON.

---

## UI Layout

```
┌───────────────────────────────────────────────────┐
│  pipeline-gen                       [GitHub link]  │
├───────────────────────────────────────────────────┤
│  [ https://github.com/owner/repo      ] [Analyze] │
│  Target: ● GitHub Actions  ○ GitLab CI            │
├─────────────────────────┬─────────────────────────┤
│  Analysis Results       │  Generated Pipeline     │
│                         │                         │
│  Language: TypeScript   │  [Copy] [Download]      │
│  Framework: Next.js     │                         │
│  Package manager: pnpm  │  # Generated by...      │
│  Test runner: vitest    │  name: my-app CI        │
│  Dockerfile: yes        │  on:                    │
│  Deploy: kubernetes     │    push: ...            │
└─────────────────────────┴─────────────────────────┘
```

Page state machine (`useReducer`):
```typescript
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: AnalyzeResponse }
  | { status: 'error'; message: string };
```

---

## Implementation Phases

### Phase W-0: Monorepo Migration (1–2 days)
Move existing code into `packages/core/` and `apps/cli/`. Zero new features — existing CLI tests must pass unchanged via `pnpm -r test`.

### Phase W-1: FileSystem Adapter (2–3 days)
- Create `FileSystem` interface + `LocalFileSystem` in `packages/core/src/utils/fs-adapter.ts`
- Add `fs` parameter to `Analyzer` interface and all five concrete analyzers (mechanical find/replace)
- Extract `VCSProvider` interface from `vcs.ts` with `LocalVCSProvider` (git exec) and stub for `GitHubVCSProvider`
- All existing tests pass without modification (they use real fixture files → `LocalFileSystem`)

### Phase W-2: Renderers (2–3 days) — **prerequisite for web UI**
- `GithubActionsRenderer` — stages→jobs with `needs:`, matrix→`strategy.matrix`, cache→`actions/cache` step, SHA-pinned `uses:`
- `GitlabCiRenderer` — `stages:` list, job assignments, `rules:` for triggers
- `renderers/registry.ts` — `getRenderer(platform)`
- Snapshot tests against golden YAML files
- CLI `generate` command writes actual YAML file (not JSON)

### Phase W-3: GitHub FileSystem Adapter (2–3 days)
- `packages/core/src/utils/github-url.ts` — URL parser
- `packages/core/src/utils/github-fs.ts` — `GitHubFileSystem` (lazy fetch + tree cache) + `GitHubVCSProvider`
- Integration test (skipped by default, requires `GITHUB_TOKEN` env var)

### Phase W-4: Next.js Scaffold (1 day)
- `create-next-app` → `apps/web/`
- `next.config.ts` with `transpilePackages: ['@pipeline-gen/core']`
- shadcn/ui init, Tailwind config, placeholder main page

### Phase W-5: API Route (2–3 days)
- `apps/web/src/lib/rate-limiter.ts` + `cache.ts`
- `apps/web/src/types/api.ts` — Zod schemas
- `apps/web/src/app/api/analyze/route.ts` — full handler
- Tested by importing the route handler function directly with a mock `Request`

### Phase W-6: UI Components (2–3 days)
- `UrlInputForm`, `PlatformSelector`, `LoadingSkeleton`, `ErrorBanner`
- State machine in `page.tsx`
- `AnalysisPanel` (manifest summary)
- `YamlPanel` — Shiki highlighting (server-side), copy + download buttons

### Phase W-7: Polish (1–2 days)
- Mobile-responsive layout (single column on `sm:`)
- "Try an example" button pre-filling a known public repo
- `og:` meta tags for social sharing
- Vercel deployment config

---

## Testing Strategy

| Layer | Tool | Approach |
|-------|------|----------|
| Renderers | Vitest | Snapshot tests: `Pipeline` object → golden YAML string |
| GitHub URL parser | Vitest | Table-driven: input strings → expected `{ owner, repo, ref }` |
| `GitHubFileSystem` | Vitest | Mock `fetch` with `vi.stubGlobal`; assert caching behaviour |
| Rate limiter | Vitest | Assert 11th call from same IP returns false |
| Route Handler | Vitest | Import `POST` directly; call with mock `Request` |
| UI components | Vitest + `@testing-library/react` | Render + assert; mock the API call |
| Integration | Vitest (skipped by default) | Real GitHub API call; guarded by `GITHUB_TOKEN` env var |

---

## Critical File Changes Summary

| File | Change |
|------|--------|
| `src/utils/fs.ts` | Refactored into `LocalFileSystem` implementing `FileSystem` interface |
| `src/analyzers/base.ts` | `detect(root, fs)` + `analyze(root, fs)` |
| `src/analyzers/registry.ts` | Receives `fs: FileSystem`, threads it through; replaces `fast-glob` with `fs.glob` |
| `src/analyzers/node.ts` `python.ts` `go.ts` `docker.ts` `deployment.ts` | Mechanical: `fileExists(` → `fs.fileExists(` etc. |
| `src/analyzers/vcs.ts` | Extracted to `VCSProvider` interface |
| `src/cli/commands/analyze.ts` `generate.ts` | Pass `new LocalFileSystem()` and `new LocalVCSProvider()` |

Everything in `src/generators/`, `src/builder/`, `src/types/`, `src/utils/known-actions.ts`, `src/utils/yaml.ts` is **unchanged**.
