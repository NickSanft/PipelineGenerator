# pipeline-gen: Design Overview

## Architecture

pipeline-gen is structured as a four-layer pipeline:

```
┌──────────────────────────────────────────────────────────────┐
│  CLI (Commander.js)                                          │
│  src/cli/index.ts + commands/{analyze,generate,diff}.ts      │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│  Analyzers                                                   │
│  Walk the repo, produce a ProjectManifest                    │
│  src/analyzers/{node,python,go,docker,deployment,vcs}.ts     │
└────────────────────────┬─────────────────────────────────────┘
                         │ ProjectManifest
┌────────────────────────▼─────────────────────────────────────┐
│  Generators                                                  │
│  Map manifest to internal Pipeline model                     │
│  src/generators/{node,python,go,docker}.ts                   │
└────────────────────────┬─────────────────────────────────────┘
                         │ Pipeline (internal DSL)
┌────────────────────────▼─────────────────────────────────────┐
│  Renderers                                                   │
│  Serialize Pipeline to platform-specific YAML                │
│  src/renderers/{github-actions,gitlab-ci}.ts                 │
└──────────────────────────────────────────────────────────────┘
```

Plugins can hook into the flow at three named points:
- `afterAnalyze` — enrich the manifest
- `beforeGenerate` — modify the pipeline before generation completes
- `afterGenerate` — add cross-cutting steps (security scans, notifications)

## Key Design Decisions

See the ADRs in `docs/adr/` for the full reasoning behind:

- [ADR 001](adr/001-internal-dsl.md) — Why an internal DSL instead of YAML templating
- [ADR 002](adr/002-plugin-hooks.md) — Why named hooks instead of middleware
- [ADR 003](adr/003-sha-pinning.md) — Why we pin actions and images by SHA

## Data Flow

```
repo/
 ├── package.json         ─┐
 ├── pyproject.toml        │  Analyzers read these
 ├── go.mod                │  and produce ProjectDescriptors
 ├── Dockerfile           ─┘
 └── k8s/                 → DeployTarget detection

ProjectManifest {
  root, projects[], vcs, raw
}

  ↓ Generator (per-language)

Pipeline {
  name, triggers[], env{}, stages[
    Stage { name, dependsOn?, jobs[
      Job { runsOn, steps[], cache?, matrix? }
    ]}
  ]
}

  ↓ Renderer (per-platform)

.github/workflows/ci.yml   (GitHub Actions)
.gitlab-ci.yml             (GitLab CI)
```

## Security Defaults

All generated pipelines include these by default, regardless of language or platform:

| Default | Rationale |
|---------|-----------|
| SHA-pinned actions | Tags are mutable and can be compromised |
| `permissions: read-all` | Least privilege — jobs opt in to write access |
| `--frozen-lockfile` / `npm ci` | Reproducible installs, no surprise upgrades |
| Secret scanning step | Catch leaked credentials before they reach remote |
| No secret echoing | Steps never log environment variables |
