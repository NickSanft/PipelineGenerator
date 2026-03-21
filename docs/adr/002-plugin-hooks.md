# ADR 002: Plugin System Uses Named Hooks Instead of Middleware

**Status:** Accepted
**Date:** 2026-03-21

## Context

There are two common patterns for making a pipeline extensible:

1. **Middleware chains** — each plugin wraps the next, like Express middleware or Redux middleware. Powerful, but order-dependent and hard to reason about when plugins interact.
2. **Named lifecycle hooks** — plugins register callbacks at specific, well-defined points in the pipeline. The host calls them in registration order.

## Decision

Plugins implement a `PluginHooks` interface with named hooks:

```typescript
interface PluginHooks {
  afterAnalyze(manifest: ProjectManifest): ProjectManifest;
  beforeGenerate(pipeline: Pipeline): Pipeline;
  afterGenerate(pipeline: Pipeline): Pipeline;
}
```

Plugins only implement the hooks they care about (`Partial<PluginHooks>`).

## Consequences

**Benefits:**
- Hook names are self-documenting: `afterAnalyze` makes it clear the manifest is complete before the plugin runs.
- Security matters here. A plugin that adds a secret-scanning step needs to run *after* the pipeline is generated, not intercept the generation process. Named hooks enforce this.
- Easier to test: call `plugin.hooks.afterGenerate(pipeline)` directly without constructing an entire middleware chain.
- Debugging is simpler — you know exactly which hook fired and when.

**Drawbacks:**
- Less flexible than middleware for complex cross-cutting concerns. A plugin cannot, for example, both enrich the manifest *and* react to what another plugin added to the manifest in the same pass.
- If two plugins both use `afterGenerate`, the second one receives the output of the first. This is predictable but means plugin ordering still matters. We document this and expose it in the config.
