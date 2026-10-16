# Changelog

## 0.1.1

- Skip Docker auth config, common service-account JSON, `auth.json`, `.npmrc`, `.pypirc`, `.netrc`, and common SSH private-key filenames without reading their contents.
- Enforce canonical LF line endings in packaged files and normalize repository text to LF for reproducible cross-platform packages.
- Publish to npm through OIDC trusted publishing with staged releases that require maintainer 2FA approval.
- Known issue: `--json` output reports `tool.version` as `0.1.0`; `--version` correctly prints `0.1.1`.

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
