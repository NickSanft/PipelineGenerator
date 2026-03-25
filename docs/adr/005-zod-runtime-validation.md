# ADR 005: Zod for Runtime Validation

**Status:** Accepted
**Date:** 2026-03-24

## Context

pipeline-gen reads data from several untrusted sources at runtime:

- `package.json`, `pyproject.toml`, `go.mod` — repo files that may be malformed or missing fields.
- `.pipelinegenrc.json` — user configuration, which may have typos or wrong types.
- GitHub API responses — even well-behaved APIs return `unknown` from `fetch().json()`.
- CLI flags — Commander parses everything as `string`; conversion to numbers or enums needs
  validation.

TypeScript's type system disappears at runtime. A `as ProjectDescriptor` cast is a promise, not a
guarantee. If we only use TypeScript types, a malformed `package.json` (e.g., `"dependencies"` is
an array instead of an object) silently produces undefined behaviour downstream.

## Decision

Use **Zod** for all runtime validation of external data.

Zod gives us:
1. **Type inference** — `z.infer<typeof Schema>` produces the TypeScript type automatically, so
   the schema and the type stay in sync by construction.
2. **Safe parsing** — `schema.safeParse(data)` returns `{ success: true, data }` or
   `{ success: false, error }` without throwing, making error handling ergonomic.
3. **Descriptive errors** — `error.issues` maps cleanly to user-facing error messages.
4. **Small bundle** — Zod tree-shakes well; the parts used by `@pipeline-gen/core` add ~12 KB
   gzipped, acceptable for both CLI and web use.

### Where we use it

| Location | What is validated |
|---|---|
| `src/plugins/loader.ts` | `.pipelinegenrc.json` schema |
| `apps/web/src/types/api.ts` | `POST /api/analyze` request body |
| Analyzer helpers (implicitly) | Thin wrappers use TypeScript types after JSON.parse, tolerated because the output is validated by snapshot tests |

## Alternatives Considered

- **`io-ts`** — similar capability, but its FP-style API has a steep learning curve and less
  readable error output. Zod's schema syntax reads closer to TypeScript itself.
- **`ajv` + JSON Schema** — excellent for schema sharing with OpenAPI, but JSON Schema is verbose
  and the types must be maintained separately. Not worth the overhead for an internal tool.
- **Manual validation** — feasible for one or two fields, but does not scale as the config schema
  grows, and provides no automatic type inference.

## Consequences

- `zod` is a runtime dependency of `@pipeline-gen/core`, not just a devDependency.
- All code paths that parse external data must route through a Zod schema. TypeScript casts (`as T`)
  on data from external sources are treated as a code smell in PR review.
- Adding a new config field requires updating both the Zod schema and any documentation — one place
  instead of two because `z.infer` keeps the TypeScript type derived automatically.
