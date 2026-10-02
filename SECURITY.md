# Security

Ops Drift Gate is designed to inspect repositories while minimizing exposure to secrets.

## Secret-handling contract

- Known secret-bearing files are skipped without reading their contents. This includes real `.env*` files except the three exact example templates, `secret*` / `credential*` paths, private-key/container formats, Docker auth config, common service-account JSON, `auth.json`, `.npmrc`, `.pypirc`, `.netrc`, and common SSH private-key filenames.
- Example/template env files may be scanned for variable **names**.
- The scanner does not intentionally extract or report secret values.
- Source and configuration files that are not classified as sensitive are read for signatures. If a secret is hardcoded in ordinary source code, Ops Drift Gate may read that file; this tool is not a secrets scanner and should not be treated as one.
- Reports should contain variable names, provider evidence, and repository-relative locations—not local absolute filesystem paths.

Do not put passwords, recovery codes, private keys, or sensitive billing details in `ops.yaml`. Store references to protected runbooks instead.

If you find a path that causes known secret files to be read, secret material to be emitted, or local absolute paths to leak into JSON/report output, treat it as a security bug.

## Reporting

Until GitHub private vulnerability reporting is enabled, open a GitHub issue that only says you need a private security contact. Do **not** include vulnerability details, reproduction steps, secret values, or sensitive paths in a public issue. Once private vulnerability reporting is enabled, use the repository's **Security → Advisories → Report a vulnerability** flow.

## Filesystem boundary and supported execution

The GitHub Action requires `GITHUB_WORKSPACE`; scan roots and manifests are confined to that boundary and to the scan root respectively. Static symlinks and Windows junctions are rejected. Candidate hardlinks are rejected before content reads. Tracked Git symlink representations are rejected before source reads on supported platforms.

The tool never imports, installs, shells out to, or executes scanned repository code. Reports retain signature metadata, not matched source lines. Terminal controls are escaped; summaries use encoded HTML text; workflow outputs contain only counts, fixed status strings, and booleans.

**Supported execution requires an isolated stable working tree.** Invoke the scanner in a fresh job before running target code, with no concurrent writer or shared writable checkout. Paths, manifests and repository contents remain hostile data. Audit-wide metadata checks include the manifest and observed files/directories; observed mutation fails closed.

These checks are mutation detection, not an atomic filesystem sandbox. They do not prove the absence of writers or guarantee confinement against a hostile process actively racing filesystem operations. Active concurrent writers are outside the supported execution model. See [the supported execution model](docs/execution-model.md).

The scan-time budget is cooperative and cannot interrupt a stalled system call. No result should be interpreted as a complete cloud inventory, verified custody, universal precision/recall, or proof that no external dependencies exist.
