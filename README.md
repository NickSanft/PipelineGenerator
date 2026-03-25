# pipeline-gen

**Analyze your repo. Generate your pipeline. Ship with confidence.**

pipeline-gen inspects your repository and produces a production-ready CI/CD pipeline configuration — SHA-pinned actions, dependency caching, coverage gates, secret scanning — without copy-pasting from someone else's workflow.

```
$ pipeline-gen generate --target github-actions ./my-repo

  ✓ Detected: TypeScript · Express · npm · Jest
  ✓ Decisions: coverage gate 80% · matrix Node 18/20 · gitleaks scan
  ✓ Writing .github/workflows/my-repo.yml

$ pipeline-gen lint .github/workflows/ci.yml

  ⚠ warning  [missing-cache]  (test)
     Job "test" runs "npm ci" but has no cache configured.
     Suggestion: Use actions/setup-node with cache: npm
```

---

## Why this exists

CI/CD configs are copy-pasted far more than they are written from scratch. The result is:

- **Drift** — `service-b` still uses the Node 16 matrix from `service-a` in 2022.
- **Insecurity** — actions pinned by mutable tag (`@v4`), no secret scanning, `permissions: write-all` because it was easier at 2am.
- **Inconsistency** — four microservices, four different caching strategies, none of them optimal.

pipeline-gen replaces "find a working config and edit it" with "run one command and get something correct."

---

## Quick start

```bash
# Install
npm install -g pipeline-gen

# Generate a GitHub Actions workflow
pipeline-gen generate --target github-actions ./my-repo

# Generate a GitLab CI config
pipeline-gen generate --target gitlab-ci ./my-repo

# Preview without writing (shows decisions + diff)
pipeline-gen generate --target github-actions --dry-run ./my-repo

# Walk through choices interactively
pipeline-gen generate --target github-actions --interactive ./my-repo

# See what changed since last generation
pipeline-gen diff --target github-actions ./my-repo

# Lint an existing workflow
pipeline-gen lint .github/workflows/ci.yml
```

---

## What it detects

| Category | Detected values |
|---|---|
| **Language** | TypeScript, JavaScript, Python, Go |
| **Framework** | Express, Next.js, Fastify, FastAPI, Django, Flask, Gin |
| **Package manager** | npm, yarn, pnpm, pip, poetry, go modules |
| **Test runner** | Jest, Vitest, pytest, go test |
| **Build tool** | tsc, webpack, Vite, go build, hatch |
| **Dockerfile** | Base image, multi-stage detection |
| **Deploy targets** | Kubernetes (Helm), serverless, static sites (Vercel/Netlify) |
| **Monorepo** | Node workspaces, multi-language top-level dirs |

---

## CLI reference

### `analyze [path]`

Prints the detected project manifest — what pipeline-gen learned about the repo.

```bash
pipeline-gen analyze ./my-repo --verbose
```

### `generate [path]`

Generates a CI/CD pipeline configuration file.

```
  --target <platform>        github-actions | gitlab-ci  (required)
  --output <path>            Override the default output path
  --dry-run                  Print manifest, decisions, and YAML without writing
  --interactive              Prompt for coverage threshold, deploy target, Slack, etc.
  --coverage-threshold <n>   Minimum test coverage percentage (0–100)
  --skip-docker-push         Skip the Docker build/push stage
```

`--dry-run` shows the "show your work" output: manifest summary → decisions → output path → rendered YAML. Nothing is written to disk.

### `diff [path]`

Compares the existing CI config to what pipeline-gen would generate today. Colorized unified diff. Useful for spotting drift after updating the tool.

### `lint <file>`

Reads an existing CI config and reports issues. Exits with code 1 if any errors are found — safe to run in CI.

```
  --platform <platform>      Override auto-detection
  --min-severity <level>     error | warning | info  (default: info)
```

**Built-in rules:**

| Rule | Sev | Description |
|---|---|---|
| `unpinned-actions` | error | `uses:` references a tag instead of a commit SHA |
| `missing-permissions` | error | No `permissions:` block; or `write-all` on a job |
| `missing-timeout` | warning | Job has no `timeout-minutes` / `timeout:` |
| `missing-cache` | warning | Install command with no cache configured |
| `unsafe-install` | error | `npm install` instead of `npm ci`; no `--frozen-lockfile` |
| `secret-leak` | error | `${{ secrets.* }}` interpolated directly into `run:` |

---

## Security defaults

Every generated pipeline includes these without opt-in:

- **SHA-pinned actions** — not tags. Tags are mutable; a compromised tag can silently exfiltrate secrets ([see the tj-actions incident](https://github.com/advisories/GHSA-mrrh-fwg8-r2hp)). See [ADR 003](docs/adr/003-sha-pinning.md).
- **`permissions: read-all`** — least privilege at the workflow level; jobs opt in to write access only where needed.
- **Frozen lockfile installs** — `npm ci`, `pnpm install --frozen-lockfile`, etc. Reproducible builds.
- **Secret scanning** — a gitleaks step runs before any other work.

---

## Plugins

Register plugins in `.pipelinegenrc.json` at your repo root:

```json
{
  "target": "github-actions",
  "plugins": ["sonarqube", "slack-notify", "dependency-audit"],
  "config": {
    "sonarqube": { "projectKey": "my-project" },
    "slack-notify": { "channel": "#deploys" }
  }
}
```

**Built-in plugins:**

| Plugin | What it adds |
|---|---|
| `sonarqube` | `code-quality` stage with SonarQube/SonarCloud scan after tests |
| `slack-notify` | Failure (+ optional success) Slack notification on the last stage |
| `dependency-audit` | `npm audit` / `pip-audit` / `govulncheck` step after install |
| `docker-build` | Full Docker build-push stage (metadata, login, GHA layer cache) |

**Writing a custom plugin:**

```typescript
import type { Plugin } from '@pipeline-gen/core';

export const myPlugin: Plugin = {
  name: 'compliance-scan',
  description: 'Adds a compliance scan stage after tests',
  hooks: {
    beforeGenerate(pipeline) {
      return {
        ...pipeline,
        stages: [
          ...pipeline.stages,
          {
            name: 'compliance',
            dependsOn: [pipeline.stages.at(-1)?.name].filter(Boolean),
            jobs: [{ name: 'scan', runsOn: 'ubuntu-latest', steps: [/*...*/] }],
          },
        ],
      };
    },
  },
};
```

Hooks run in the order plugins are listed. Each receives the output of the previous.

| Hook | Receives | Use for |
|---|---|---|
| `afterAnalyze` | `ProjectManifest` | Enriching manifest data before generation |
| `beforeGenerate` | `Pipeline` | Adding or rearranging stages |
| `afterGenerate` | `Pipeline` | Final touch-ups (notifications, etc.) |

---

## Web UI

Paste any GitHub URL and get a live preview without installing anything.

The web app (`apps/web/`) uses the same `@pipeline-gen/core` package as the CLI — there is no separate code path. The `GitHubFileSystem` adapter replaces local disk access with GitHub Contents API calls, fetching the repo tree once and resolving files on demand.

---

## Architecture

```
pipeline-gen/
  packages/
    core/               @pipeline-gen/core — all business logic
      analyzers/        Repo detection (Node, Python, Go, Docker, Deployment, VCS)
      generators/       Manifest → Pipeline (per language; security defaults baked in)
      renderers/        Pipeline → YAML (GitHub Actions, GitLab CI)
      builder/          Fluent PipelineBuilder DSL
      plugins/          Plugin system + 4 built-in plugins + .pipelinegenrc.json loader
      linter/           6 lint rules + YAML runner
      types/            ProjectManifest, Pipeline (platform-agnostic internal model)
      utils/            FileSystem adapters (Local + GitHub API), logger, diff, display
  apps/
    cli/                pipeline-gen CLI  (Commander.js, Inquirer.js, chalk)
    web/                Next.js 14 web UI (App Router, Tailwind CSS, Shiki)
```

The key design is the **three-layer separation**:

```
Repo on disk / GitHub API
    → Analyzer(s)  →  ProjectManifest   (what is this repo?)
    → Generator    →  Pipeline          (platform-agnostic DSL)
    → Renderer     →  YAML              (platform-specific config)
```

Adding a new platform requires only a new renderer. Adding a new language requires only a new analyzer + generator. Neither layer touches the others.

**Architecture Decision Records:**

- [ADR 001](docs/adr/001-internal-dsl.md) — Why an internal DSL instead of direct YAML templates
- [ADR 002](docs/adr/002-plugin-hooks.md) — Why named hooks instead of a middleware chain
- [ADR 003](docs/adr/003-sha-pinning.md) — Why all actions are pinned by SHA
- [ADR 004](docs/adr/004-monorepo-strategy.md) — Monorepo path-filter strategy
- [ADR 005](docs/adr/005-zod-runtime-validation.md) — Why Zod for runtime validation

---

## Development

**Prerequisites:** Node.js 20+, pnpm 10+

```bash
# Install dependencies
pnpm install

# Run tests (core library)
pnpm test

# Run tests in watch mode
pnpm --filter @pipeline-gen/core test:watch

# Build all packages
pnpm build

# Run the CLI from source
pnpm --filter pipeline-gen dev -- analyze ./packages/core/tests/fixtures/node-basic

# Run the web app locally
pnpm --filter @pipeline-gen/web dev
# → http://localhost:3000
# Set GITHUB_TOKEN in apps/web/.env.local for higher API rate limits
```

**Keeping SHA pins current:** All generated actions are SHA-pinned. Enable Dependabot to update them automatically:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

---

## Philosophy

**Opinionated defaults, transparent decisions.** Security best practices are baked in — not opt-in. `--dry-run` shows exactly what was detected and why, so nothing is a black box.

**Security-first by construction.** The internal `Step` model has no `actionVersion: "v4"` — that field holds a SHA or nothing. The `unpinned-actions` lint rule catches anything that drifts back.

**No surprises at runtime.** All external data (repo files, API responses, CLI flags) passes through Zod schemas before use. TypeScript types disappear at runtime; Zod validation does not.

**Open for extension, closed for modification.** New platforms, languages, and integrations plug in without changing existing code. The plugin hook order is explicit and composable.

**Dogfooding.** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) in this repo is the workflow pipeline-gen runs against itself — including a job that lints the CI workflow using `pipeline-gen lint`.
