# Changelog

## 0.1.0 — release candidate

- Deterministic repository scanner for operational dependency and custody drift.
- Instance-aware `ops.yaml` with strict schema validation and optional custody enforcement.
- Exact environment-template exemptions and protected handling for known secret-bearing files.
- Confined Action paths, rejection of links/junctions and candidate hardlinks, bounded iterative traversal, and explicit incomplete errors.
- Direct Git index validation to reject tracked symlink representations consistently across Linux and Windows.
- Audit-wide mutation detection and an explicit stable-working-tree execution contract.
- Scoped ignore records with reasons and explicit broad acknowledgements.
- Duplicate JSON/YAML declaration rejection, encoding/parser/resource bounds, and prototype-shaped key rejection.
- Safe terminal, summary, JSON, and GitHub Action output rendering.
- Linux/Windows CI with read-only permissions, immutable external Action references, no persisted checkout credentials, and packed-artifact validation.
