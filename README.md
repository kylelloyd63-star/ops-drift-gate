# Ops Drift Gate

**Git tracks code. Ops Drift Gate tracks the operational dependencies that code alone does not transfer.**

AI-assisted apps can accumulate hosting, databases, payments, email, DNS, OAuth, scheduled jobs, CI/CD, API accounts, environment variables, and billing relationships faster than anyone documents them. A repository can be perfectly clonable and still be impossible to take over safely.

Ops Drift Gate is a deterministic scanner that answers:

1. **What external operational dependencies does this repository appear to use?**
2. **Which detected providers have human-maintained service instances in the custody manifest (`ops.yaml`, `ops.yml`, or `ops.json`)?**
3. **Optionally: are production-required instances missing critical custody information?**

It never guesses account ownership. Machine-detected evidence and human-confirmed custody facts remain separate.

## Status

**Repository version 0.1.2.** It is not published to npm and there is no `v0.1.2` release tag. The published package and the tagged Action remain `ops-drift-gate@0.1.1` / `v0.1.1`.

This source tree skips test and fixture paths by default, writes a starter manifest with `ops-drift init`, and detects form backends, static hosting, custom domains, and npm publishing in addition to the v0.1 providers. `--json` reads `tool.version` from `package.json`. The published 0.1.1 package still reports `tool.version` as `0.1.0`.

The core has zero runtime dependencies and requires Node 24+.

Run in an isolated stable checkout, before executing target code and with no concurrent writer. See [supported execution and limits](docs/execution-model.md). A complete result does not establish filesystem isolation.

Provider detection includes Vercel, Netlify, GitHub Pages, Cloudflare, Cloudflare Pages, custom domains, Supabase, Stripe, Resend, Twilio, Firebase, AWS, Sentry, OpenAI API, GitHub Actions, the npm registry, FormSubmit, Formspree, Netlify Forms, and scheduled jobs.

## Quick start

From a source checkout:

```bash
node src/cli.js .
```

Write a starter manifest from what the scanner found:

```bash
node src/cli.js init .
```

The published npm package is still `ops-drift-gate@0.1.1` and does not include the 0.1.2 commands or detectors. From any machine with Node 24+:

```bash
npx --yes ops-drift-gate@0.1.1 .
```

Future automated publishes use OIDC trusted publishing plus npm staged publishing so a maintainer still approves each release with 2FA. Publishing 0.1.2 is a separate maintainer step; this repository does not tag or publish it by itself.

This repository ships an `ops.yaml` for GitHub Actions and the npm registry. A scan of the repository, with test paths excluded, passes `--ci --require-custody`.

Gate undocumented providers in CI:

```bash
node src/cli.js . --ci
```

Also require complete custody for production-required service instances:

```bash
node src/cli.js . --ci --require-custody
```

## The custody manifest

Service keys are **instance IDs**, not provider names. That means one repository can document multiple Stripe accounts, AWS accounts, Vercel projects, environments, or other instances without changing the schema later.

```yaml
version: 1
services:
  stripe-production:
    provider: stripe
    purpose: production payments
    required_for_production: true
    custody:
      owner: Payments team
      billing_owner: Finance
      transferable: true
      recovery_procedure: Protected runbook: PAYMENTS-01

  stripe-test:
    provider: stripe
    purpose: payment testing
    required_for_production: false
    custody:
      owner: Engineering
      billing_owner: Engineering
      transferable: true
      recovery_procedure: Protected runbook: PAYMENTS-TEST
```

The v0.1 parser deliberately supports a small mapping-only YAML subset: nested key/value mappings, strings, booleans, numbers, and nulls. No arrays, anchors, tags, or executable YAML features.

Optional root fields:

```yaml
scan:
  include_tests: false
checks:
  hygiene: false
```

`scan.include_tests` defaults to false. `checks.hygiene` defaults to false. `ops-drift init` writes one service per strong or corroborated provider, with custody fields left null and hygiene left off. It refuses to overwrite an existing manifest unless `--force` is passed, and `--force` only replaces `ops.yaml`. `ops.yml` or `ops.json` must be removed by hand. `--force` does not keep previous custody text or ignore rules.

### Reasoned ignores

A detected provider can be explicitly acknowledged as a false positive or intentionally irrelevant, but an ignore must carry a reason:

```yaml
ignores:
  legacy-sentry-fixture:
    provider: sentry
    path_prefix: test/fixtures/legacy/
    reason: SDK appears only in a dead migration fixture
```

The prefix matches a complete path component, not similarly named siblings. Ignored evidence remains visible; confidence and enforcement are recalculated from the remaining evidence. A provider-wide ignore requires `provider`, `reason`, and the explicit acknowledgement `scope: all`. Legacy provider-keyed ignores must be migrated; implicit broad ignores are errors.

Unknown ordinary fields are errors at the root, service, custody, and ignore levels. `x-*` fields accept bounded inert scalar/mapping metadata; they never alter policy and are not echoed in machine reports. Arrays are unsupported. IDs are 1–128 ASCII letters, digits, dots, underscores, or hyphens, starting with a letter or digit. Duplicate YAML or JSON keys and prototype-shaped keys are errors. Multiple default manifests are ambiguous and fail. An explicitly selected missing manifest fails. Custody text must be a nonempty string or null. Strict custody checks every declared production-required or unknown-production instance, including manifest-only inventory; only `required_for_production: false` exempts an instance.

## Confidence model

Evidence is classified deterministically.

- **strong** — package dependency, environment-variable name, known operational file, workflow file, or an HTML/JSX/Vue/Svelte/PHP form or script endpoint.
- **corroborated** — multiple non-strong signals agree.
- **weak** — one content signature only.

Weak findings are reported but do **not** fail the undocumented-provider gate until corroborated. This keeps a stray hostname or class name from breaking CI by itself.

## GitHub Action

Use the published v0.1.1 GitHub Action. `v0.1.2` is not tagged.

```yaml
name: Operational custody check
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  ops-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          persist-credentials: false
      - uses: kylelloyd63-star/ops-drift-gate@v0.1.1
        with:
          path: .
          manifest: ops.yaml
          fail_on_undocumented: true
          require_custody: true
```

For maximum immutability, pin the reviewed release commit SHA instead of the version tag.

Inputs:

- `path` — repository path confined to `GITHUB_WORKSPACE`; links and junctions are rejected.
- `manifest` — optional path confined to the scan root. Blank discovers `ops.yaml`, `ops.yml`, or `ops.json`.
- `fail_on_undocumented` — fail for strong/corroborated providers with no manifest instance.
- `require_custody` — also fail when production-required documented instances lack owner, billing owner, transferability, or a recovery-procedure reference.
- `include_tests` — set `true` or `false` to override the manifest. Blank uses `scan.include_tests`.
- `hygiene` — set `true` or `false` to override the manifest. Blank uses `checks.hygiene`.

The Action uses the Node 24 JavaScript Action runtime.

Action booleans accept exactly `true` or `false`. Outputs are fixed numeric counts, `complete`, and `status` (`pass`, `fail`, or `error`). Incomplete scanning is an error even when the undocumented-provider gate is disabled. The scanner needs no write permissions, provider credentials, or outbound network.

## Evidence model

A provider can be detected from evidence such as:

- a package dependency (`stripe`, `@supabase/supabase-js`)
- a known operational file (`vercel.json`, `wrangler.toml`, GitHub workflows)
- an environment-variable **name** (`STRIPE_SECRET_KEY`, `SUPABASE_URL`)
- a provider-specific hostname, form action, script source, or API signature
- a static-hosting workflow, `CNAME` file, or npm publish workflow / `publishConfig`
- scheduled-job configuration

Each finding records repository-relative evidence and, when possible, a line number.

All four Node dependency groups (runtime, development, peer, optional) remain strong evidence of repository use. This does not assert production use or account ownership. Documentation `.md`/`.txt` files do not supply signals; dependency `requirements*.txt` files remain candidates.

## Completion, limits, and machine output

Exit codes: `0` for a complete scan with enabled policies passing; `1` for path, manifest, I/O, encoding, resource, or incomplete-scan errors; `2` for a complete scan with blocking policy findings under `--ci`. Without `--ci`, policy findings remain visible and do not change the CLI exit code. `--json` emits schema v1 with `status`, `complete`, relative paths, findings, manifest-only inventory, active blocking findings, and warning codes. A finding's `confidence` is recalculated after scoped ignores; `activeConfidence` remains as a deprecated compatibility alias with the same value. Custody values and raw source lines are not echoed. Diagnostics do not include raw exceptions or stack traces.

Default limits: 100,000 visited entries; 10,000 candidate files; 1 MiB per candidate; 256 MiB total candidate bytes; 64 path components; 20,000 evidence/variable-name records; one million ignore comparisons and 20,000 matched-ignore annotations; 30 seconds of scan traversal; manifest 256 KiB, 10,000 keys, depth 16, text fields 2,048 characters; path input 4,096 characters. Limits cause an explicit incomplete error, never a pass. The scan-time budget is cooperative; it cannot preempt a blocking filesystem call. Node API callers may lower traversal limits but cannot raise them.

Excluded directory names: `.git`, `node_modules`, `dist`, `build`, `.next`, `.cache`, `coverage`, `vendor`. By default the scanner also does not descend into `test`, `tests`, `__tests__`, or `fixtures`, and it skips `*.test.*` files. Those names are case-sensitive. `scan.include_tests: true` or `--include-tests` scans them again. The exclusion count in the report is the number of skipped directories and test files, not every nested file. Sensitive files and documentation are outside the declared detection scope. Documentation is read only when hygiene checks are enabled, and then only for those checks. Links, junctions, hardlinked candidates, relevant unreadable/malformed inputs, invalid UTF-8 and NUL-containing candidates produce errors. Resource bounds count included entries before content reads. Traversal is iterative and streams directory entries.

Run on a stable checkout with no concurrent writer. Audit-wide metadata checks include files read earlier and the manifest; Linux also verifies opened descriptors through `/proc/self/fd`. Portable Node APIs are not an atomic sandbox. Active-writer inputs are outside the supported deployment contract. See SECURITY.md and docs/execution-model.md.

Git index metadata is checked before source reads. Tracked symlinks are rejected even when Windows materializes them as ordinary text placeholders. Normal index versions 2/3/4 and SHA-1/SHA-256 are supported. Linked worktrees, split/sparse indexes, unmerged entries and submodules are explicitly unsupported and error. The metadata limit is 32 MiB / 100,000 entries; no Git configuration, hooks, target code or link target content is read. Ordinary non-Git directories are supported.

## Secret and privacy handling

Ops Drift Gate is intentionally conservative, but it is **not a secrets scanner**. Optional hygiene checks are a narrow add-on for secret-shaped patterns, personal webmail addresses, and local absolute paths. They are off unless `--hygiene` is set or `checks.hygiene` is true. A finding names the rule and the file location. It does not repeat the matched secret, address, or path.

- Known secret-bearing files are skipped without reading their contents. This includes real `.env*` files except the three exact example templates, exact or dot-suffixed `secret` / `secrets` / `credential` / `credentials` path components, hyphen/underscore-prefixed secret/credential data files, private-key/container formats, Docker auth config, common service-account JSON, `auth.json`, `.npmrc`, `.pypirc`, `.netrc`, and common SSH private-key filenames. Secret-like source names such as `secretsManager.js` are scanned normally.
- `.env.example`, `.env.sample`, and `.env.template` may be scanned for variable names.
- The scanner does not intentionally extract or report secret values.
- Ordinary source/config files are read for signatures. A secret hardcoded in ordinary source is therefore still in a file the scanner reads.
- JSON/report output uses repository-relative evidence paths and does not include the local absolute repository root.
- Do not put passwords, recovery codes, private keys, or sensitive billing details in `ops.yaml`. Reference protected runbooks instead.

## CLI

```text
ops-drift [path] [--ci] [--json] [--manifest ops.yaml] [--require-custody] [--include-tests] [--hygiene]
ops-drift init [path] [--force] [--json] [--include-tests]

--ci                exit 2 when the gate has blocking findings
--json              emit machine-readable JSON
--manifest <path>   use a specific manifest path
--require-custody   fail for incomplete custody on production-required instances
--include-tests     scan test and fixture paths
--hygiene           enable secret, personal-email, and local-path checks
init                write a starter ops.yaml
--force             replace an existing ops.yaml
--help              show help
--version           show version
```

`--json` reports `tool.version` from `package.json`. Exit codes are unchanged: `0` when a complete scan passes its enabled policies, `1` for usage or scan errors, and `2` under `--ci` when blocking findings remain. Without `--ci`, policy findings stay visible and the exit code stays `0`.

## What this is not

Ops Drift Gate is not a vulnerability scanner, SBOM replacement, secrets scanner, cloud inventory platform, or AI code reviewer.

It focuses on **operational custody drift**: a codebase gains a production dependency, but the durable record of who controls it, pays for it, transfers it, or recovers it does not keep up.

## Design principles

- deterministic core
- evidence before inference
- human confirmation for custody facts
- no intentional secret-value collection
- small attack surface
- multiple real-world service instances supported from v0.1
- weak evidence does not break builds by itself
- useful locally before any hosted service exists
- CI catches operational drift at the PR boundary

## Development

```bash
npm run check
```

CI runs the full syntax/test check **and** exercises the repository as an actual local GitHub Action with `uses: ./`.

## Roadmap

### v0.1

- deterministic local scanner
- instance-aware `ops.yaml`
- evidence/confidence reporting
- reasoned ignores
- strict optional custody gate
- GitHub Action
- initial service rule set

### v0.2

- baseline/diff mode for PRs
- baseline comparison of acknowledgements
- additional ecosystems/providers beyond the 0.1.2 hosting, form, and npm checks
- JSON Schema/editor assistance
- measured public-repository accuracy benchmark

### Later: Takeover

A possible paid layer could add private-repository dashboards, organization-wide operational inventories, provider integrations, historical drift, employee/offboarding checks, handoff packets, disaster-recovery reports, and acquisition due-diligence exports.

The open-source scanner should remain independently useful even if that hosted product never exists.

## License

MIT.
