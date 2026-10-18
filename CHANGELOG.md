# Changelog

## 0.1.2

- Read `tool.version` from `package.json` for `--version` and `--json`. This fixes the published 0.1.1 report, which printed `0.1.0`.
- Skip `test/`, `tests/`, `__tests__/`, and `fixtures/` directories, plus `*.test.*` and `*.spec.*` files, unless `scan.include_tests` is true or `--include-tests` is set.
- Add `ops-drift init`, which writes a starter `ops.yaml` and does not overwrite an existing manifest. A missing-manifest failure names that command.
- Detect form backends (FormSubmit, Formspree, Netlify Forms, Getform, and Web3Forms), GitHub Pages, Netlify, Cloudflare Pages, custom domains, npm publish configuration, and PyPI.
- Add optional `--hygiene` checks for secret-shaped tokens, personal email providers, and absolute local paths. Matched text is not copied into the report.
- Report `confidence` after scoped ignores are applied; retain `activeConfidence` as a deprecated compatibility alias with the same value.
- Upgrading from 0.1.1 can turn a previous pass into a failure. Form actions, form script sources, hosting files, package-registry publish steps, and custom-domain keys in known hosting configs are blocking evidence. A bare hostname stays informational.
- Keep hostname, form, email, and registry patterns bounded, and check the scan time limit between pattern checks inside a file.
- Scheduled-job matching uses horizontal whitespace only. A private `publishConfig.registry` or `npm publish --registry` target is not the public npm Registry. Netlify form attributes count only on a form tag. A fetch to a form endpoint counts as integration evidence. Cloudflare Pages workflow matching stays inside one step. Hygiene skips non-UTF-8 documentation instead of failing the scan, still flags a hardcoded secret next to an Actions expression, and recognizes more absolute-path shapes without reading lockfiles.
- Actions expression checks are linear and bounded. A shell tilde is not an absolute path. A form host counts only as a string argument of a call, including a JSX attribute after a braced value. A setup-node `registry-url` for another registry keeps a plain npm publish in that job off the public npm Registry. Cloudflare Pages workflow matching stays inside one step of one job. Hygiene recognizes the root user's home directory and ignores the hosted-runner home directory and a one-character drive segment.
- Workflow lines are searched only within the line. Quoted strings end at a newline, regex literals are skipped, and HTML, Vue, and Svelte calls are read from script blocks. A package registry and the registry in effect at each publish decide whether a plain publish is the public npm Registry. Object `url` arguments count. Cloudflare Pages uses the action command, not a comment or step name. An Actions expression with a literal fallback is still a secret. A root-relative web link is not a local path. A JSX regex does not hide a later form attribute.
- A private registry suppresses only the package or workspace that publish actually targets. Only the top-level `url` of an HTTP call config counts. Cloudflare Pages ignores an inline comment and still reads a step that starts with `with:`. Hygiene keeps image sources, CSS urls, and `*url` assignments, and still ignores a root-relative href, action, or Markdown link. A quoted string fallback in an Actions expression still counts.

## 0.1.1

- Skip Docker auth config, common service-account JSON, `auth.json`, `.npmrc`, `.pypirc`, `.netrc`, and common SSH private-key filenames without reading their contents.
- Enforce canonical LF line endings in packaged files and normalize repository text to LF for reproducible cross-platform packages.
- Publish to npm through OIDC trusted publishing with staged releases that require maintainer 2FA approval.
- Known issue: `--json` output reports `tool.version` as `0.1.0`; `--version` correctly prints `0.1.1`. Fixed in 0.1.2.

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
