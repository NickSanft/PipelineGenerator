# ADR 003: All Actions and Images Pinned by SHA

**Status:** Accepted
**Date:** 2026-03-21

## Context

GitHub Actions and container images are commonly referenced by mutable tags:

```yaml
- uses: actions/checkout@v4
- image: node:20
```

Tags are **mutable**. A tag can be moved to point at a different commit or image layer at any time — including by a supply chain attacker who compromises the upstream repo or registry.

The [tj-actions/changed-files incident (2025)](https://github.com/advisories/GHSA-mrrh-fwg8-r2hp) demonstrated this concretely: a compromised action tag silently exfiltrated repository secrets from thousands of workflows.

## Decision

pipeline-gen pins **all** generated action references by SHA, not tag:

```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

The human-readable tag is preserved as a comment for auditability.

For container images, we pin by digest:

```yaml
image: node@sha256:abc123...
```

## Consequences

**Benefits:**
- The generated pipeline is reproducible and tamper-evident. If an upstream tag is compromised, the SHA-pinned workflow is unaffected.
- Pinning by SHA is the recommendation of GitHub's own security hardening guide, CISA, and the OpenSSF Scorecard.

**Drawbacks:**
- SHA references must be updated manually or with a tool like Dependabot or Renovate. We document this and recommend enabling Dependabot for Actions in the generated README.
- The generated YAML is less immediately human-readable. The comment mitigates this.

**Implementation note:** pipeline-gen ships with a curated list of well-known action SHAs and keeps them up to date. The `actionVersion` field in the internal Step model holds the SHA; the `action` field holds the human-readable name.
