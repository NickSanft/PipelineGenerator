# ADR 004: Monorepo Strategy — Path-Filtered Jobs in a Single Workflow

**Status:** Accepted
**Date:** 2026-03-24

## Context

When a repository contains multiple independent projects (a typical monorepo), there are three
meaningful strategies for generating CI pipelines:

1. **Single workflow, path-filtered jobs** — one workflow file where each project's jobs are
   triggered only when files under that project's directory change.
2. **Per-project workflows** — one workflow file per project, each completely independent.
3. **Fan-out / matrix** — a single "orchestrator" workflow that dispatches to per-project
   reusable workflows.

Each strategy has real costs in three dimensions:

| | Path-filtered single | Per-project | Fan-out |
|---|---|---|---|
| Blast radius | Narrowest — only changed projects run | Narrowest | Broadest (orchestrator runs for all pushes) |
| CI minute cost | Lowest | Low | Higher (orchestrator + sub-workflows) |
| Cross-project visibility | Best — one status check per PR | Poor — N status checks | Good |
| Complexity | Medium | Low | High |

## Decision

The **default strategy is `single` with path-filtered jobs**, generated as one workflow file that
includes all projects. Each project's jobs carry a `paths` trigger filter so only affected
projects rebuild.

Users can override this with `--monorepo-strategy per-project` or `--monorepo-strategy fan-out`,
but the defaults strongly favour the single-file path-filter approach for most teams.

### Rationale

Most CI platforms have native support for path filters (`on.push.paths` in GitHub Actions,
`changes:` rules in GitLab CI). They are well-understood, easy to review in a single file, and
avoid the orchestrator complexity of fan-out. The single file also means one PR check, which
keeps the GitHub/GitLab PR UI uncluttered.

Per-project files become attractive only when projects have radically different runner requirements
or need independent secrets scoping. The CLI supports this via the `per-project` strategy flag,
but does not make it the default because it creates N separate files that drift independently.

## Consequences

- `analyzeRepo` discovers sub-project roots and produces a `ProjectManifest` with multiple
  `ProjectDescriptor` entries.
- Generators produce one `Pipeline` object with stages and jobs tagged by project path.
- GitHub Actions renderer emits `on.push.paths` per job or per workflow trigger block.
- GitLab CI renderer emits `changes:` rules per job.
- The `per-project` strategy requires the renderer to split the `Pipeline` into N independent
  `Pipeline` objects and write N output files — a planned enhancement, not currently implemented
  in the base renderer.
