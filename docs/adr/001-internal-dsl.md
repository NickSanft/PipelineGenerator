# ADR 001: Internal DSL Instead of Direct YAML Templating

**Status:** Accepted
**Date:** 2026-03-21

## Context

The first instinct when building a CI/CD generator is to use string templates or YAML anchors directly — you have your target format, so just template it. Several popular tools (like `cookiecutter` for project scaffolding, or naive Jinja-based CI generators) follow this approach.

The problem is that this tightly couples the *structure of the pipeline logic* to the *syntax of one platform's config format*. When you want to support GitHub Actions **and** GitLab CI, you either:

1. Write two separate template systems (code duplication, divergence over time), or
2. Force-fit a lowest-common-denominator template that can't fully express either platform's capabilities.

## Decision

We introduce a **platform-agnostic internal pipeline representation** (`src/types/pipeline.ts`) and a **fluent builder API** (`src/builder/pipeline-builder.ts`) that sits between the analyzers/generators and the platform renderers.

The flow is:

```
Repo on disk
    → Analyzer(s) → ProjectManifest
    → Generator   → Pipeline (internal DSL)
    → Renderer    → platform YAML
```

## Consequences

**Benefits:**
- Generators only need to know about pipeline concepts (stages, jobs, steps, caching, matrices) — not GitHub YAML syntax.
- Renderers are pure transformation functions, easy to test with snapshot tests.
- Adding a new platform (CircleCI, Buildkite) requires only a new renderer, not touching generator logic.
- The internal Pipeline model is strongly typed and can be validated at build time, catching errors before any YAML is written.
- Unit-testing generation logic is dramatically simpler: assert on a Pipeline object, not on YAML strings.

**Drawbacks:**
- The internal model must remain expressive enough to cover all target platforms. Some platform-specific features (e.g., GitHub's `environment` protection rules, GitLab's `needs: artifacts`) may require escape hatches.
- There is more code to write upfront. This pays off quickly once a second renderer is added.
