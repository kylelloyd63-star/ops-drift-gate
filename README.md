# Ops Drift Gate

**Git tracks code. Ops Drift Gate tracks the operational dependencies that code alone does not transfer.**

AI-assisted apps can accumulate hosting, databases, payments, email, DNS, OAuth, scheduled jobs, CI/CD, API accounts, environment variables, and billing relationships faster than anyone documents them. A repository can be perfectly clonable and still be impossible to take over safely.

Ops Drift Gate is a deterministic scanner that answers:

1. **What external operational dependencies does this repository appear to use?**
2. **Which detected providers have human-maintained service instances in the custody manifest (`ops.yaml`, `ops.yml`, or `ops.json`)?**
3. **Optionally: are production-required instances missing critical custody information?**

It never guesses account ownership. Machine-detected evidence and human-confirmed custody facts remain separate.

## Status

**Source version 0.1.2.** The npm package `ops-drift-gate@0.1.1` remains the published `latest` release. This repository bump does not publish to npm and does not create a `v0.1.2` tag. A maintainer still approves each release with 2FA.

v0.1.2 skips test and fixture paths by default, adds `ops-drift init`, and detects form backends, static hosting, custom domains, and package registries. `--json` reports `tool.version` from `package.json`. Optional `--hygiene` checks look for secret-shaped tokens, personal email providers, and absolute local paths without copying the matched text into the report.

**Upgrading from 0.1.1.** Version 0.1.2 adds blocking detectors. A form action, a form script source, a hosting file, a package-registry publish step, or a custom-domain key in a known hosting config can fail a repository that previously passed, until that provider is recorded in `ops.yaml`. A bare hostname in `.js`, `.html`, or `.py` stays informational and does not fail the gate by itself.

The core has zero runtime dependencies and requires Node 24+.

Run in an isolated stable checkout, before executing target code and with no concurrent writer. See [supported execution and limits](docs/execution-model.md). A complete result does not establish filesystem isolation.

Provider detection includes Vercel, Netlify, GitHub Pages, Cloudflare, Cloudflare Pages, custom domains, Supabase, Stripe, Resend, Twilio, Firebase, AWS, Sentry, OpenAI API, GitHub Actions, scheduled jobs, FormSubmit, Formspree, Netlify Forms, Getform, Web3Forms, the npm registry, and PyPI.

## Quick start

From a source checkout:

```bash
node src/cli.js .
```

The published npm package is still `ops-drift-gate@0.1.1`. From any machine with Node 24+:

```bash
npx --yes ops-drift-gate@0.1.1 .
```

Write a starter custody manifest from what the scanner found. `init` refuses to overwrite `ops.yaml`, `ops.yml`, or `ops.json`:

```bash
node src/cli.js init .
```

Future automated publishes use OIDC trusted publishing plus npm staged publishing so a maintainer still approves each release with 2FA.

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

Test and fixture paths are skipped unless the manifest opts in:

```yaml
scan:
  include_tests: true
```

`scan.include_tests` accepts only a boolean. The CLI flag `--include-tests` forces those paths on for one run. Omitted, the default is to skip directories named `test`, `tests`, `__tests__`, or `fixtures`, and files named `*.test.*` or `*.spec.*`.

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

- **strong** — package dependency, environment-variable name, known operational file, workflow file, or an explicit integration signature such as a form action, a script source, a `fetch` or HTTP call whose URL argument or top-level object `url` is a form endpoint, a package-registry publish step, or a hosting configuration key. A publish command that names another registry, a `publishConfig.registry` value for the package being published, or a plain publish while that registry is the one in effect is not the public npm Registry. A private registry on one package does not change a publish of a different package. A later registry setting does not change an earlier publish.
- **corroborated** — multiple non-strong signals agree.
- **weak** — one content signature only, including a bare hostname.

Weak findings are reported but do **not** fail the undocumented-provider gate until corroborated. A stray hostname or class name does not break CI by itself.

## GitHub Action

The published tag `v0.1.1` accepts only the inputs that release implements: `path`, `manifest`, `fail_on_undocumented`, and `require_custody`.

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

Source version 0.1.2 is not a published release and has no tag. From a checkout of this source, the Action also accepts `hygiene` and `include_tests`:

```yaml
      - uses: ./
        with:
          path: .
          manifest: ops.yaml
          fail_on_undocumented: true
          require_custody: true
          hygiene: false
          include_tests: ""
```

Inputs:

- `path` — repository path confined to `GITHUB_WORKSPACE`; links and junctions are rejected. Present in v0.1.1 and in this source.
- `manifest` — optional path confined to the scan root. Blank discovers `ops.yaml`, `ops.yml`, or `ops.json`. Present in v0.1.1 and in this source.
- `fail_on_undocumented` — fail for strong/corroborated providers with no manifest instance. Present in v0.1.1 and in this source.
- `require_custody` — also fail when production-required documented instances lack owner, billing owner, transferability, or a recovery-procedure reference. Present in v0.1.1 and in this source.
- `hygiene` — source 0.1.2 only. Also run the optional secret-pattern, personal-email, and absolute-local-path checks. Default `false`.
- `include_tests` — source 0.1.2 only. Set to `true` or `false` to override the manifest. Leave it blank to use `scan.include_tests`.

The Action uses the Node 24 JavaScript Action runtime.

Action booleans accept exactly `true` or `false`. Outputs are fixed numeric counts, `complete`, and `status` (`pass`, `fail`, or `error`). Incomplete scanning is an error even when the undocumented-provider gate is disabled. The scanner needs no write permissions, provider credentials, or outbound network.

## Evidence model

A provider can be detected from evidence such as:

- a package dependency (`stripe`, `@supabase/supabase-js`)
- a known operational file (`vercel.json`, `wrangler.toml`, GitHub workflows)
- an environment-variable **name** (`STRIPE_SECRET_KEY`, `SUPABASE_URL`)
- a provider-specific hostname, form action, script source, or API signature
- a package registry publish signal (`publishConfig`, an npm publish workflow, or a PyPI upload workflow)
- a hosting or custom-domain file (`vercel.json`, `netlify.toml`, `wrangler.toml`, GitHub Pages `CNAME`)
- scheduled-job configuration

Each finding records repository-relative evidence and, when possible, a line number.

All four Node dependency groups (runtime, development, peer, optional) remain strong evidence of repository use. This does not assert production use or account ownership. Documentation `.md`/`.txt` files do not supply signals; dependency `requirements*.txt` files remain candidates.

## Completion, limits, and machine output

Exit codes: `0` for a complete scan with enabled policies passing; `1` for path, manifest, I/O, encoding, resource, or incomplete-scan errors; `2` for a complete scan with blocking policy findings under `--ci`. Without `--ci`, policy findings remain visible and do not change the CLI exit code. `--json` emits schema v1 with `status`, `complete`, relative paths, findings, hygiene results, manifest-only inventory, active blocking findings, and warning codes. `tool.version` is the `version` field of this package's `package.json`. A finding's `confidence` is recalculated after scoped ignores; `activeConfidence` remains as a deprecated compatibility alias with the same value. Custody values and raw source lines are not echoed. Diagnostics do not include raw exceptions or stack traces.

Default limits: 100,000 visited entries; 10,000 candidate files; 1 MiB per candidate; 256 MiB total candidate bytes; 64 path components; 20,000 evidence/variable-name records; one million ignore comparisons and 20,000 matched-ignore annotations; 30 seconds of scan traversal; manifest 256 KiB, 10,000 keys, depth 16, text fields 2,048 characters; path input 4,096 characters. Limits cause an explicit incomplete error, never a pass. The scan-time budget is checked between files and between pattern checks inside a file. It is cooperative and cannot preempt a blocking filesystem call or a single pattern match. Node API callers may lower traversal limits but cannot raise them.

Excluded directory names: `.git`, `node_modules`, `dist`, `build`, `.next`, `.cache`, `coverage`, `vendor`, plus test and fixture directories (`test`, `tests`, `__tests__`, `fixtures`) unless inclusion is requested. Sensitive files and documentation are outside the declared detection scope. Links, junctions, hardlinked candidates, relevant unreadable/malformed inputs, and invalid UTF-8 or NUL bytes in a provider candidate produce errors. With `--hygiene`, a documentation or extra config file that is not valid UTF-8 is skipped and noted, and that file does not fail the scan. Resource bounds count included entries before content reads. Traversal is iterative and streams directory entries.

Run on a stable checkout with no concurrent writer. Audit-wide metadata checks include files read earlier and the manifest; Linux also verifies opened descriptors through `/proc/self/fd`. Portable Node APIs are not an atomic sandbox. Active-writer inputs are outside the supported deployment contract. See SECURITY.md and docs/execution-model.md.

Git index metadata is checked before source reads. Tracked symlinks are rejected even when Windows materializes them as ordinary text placeholders. Normal index versions 2/3/4 and SHA-1/SHA-256 are supported. Linked worktrees, split/sparse indexes, unmerged entries and submodules are explicitly unsupported and error. The metadata limit is 32 MiB / 100,000 entries; no Git configuration, hooks, target code or link target content is read. Ordinary non-Git directories are supported.

## Secret and privacy handling

Ops Drift Gate is intentionally conservative, but it is **not a secrets scanner**.

- Known secret-bearing files are skipped without reading their contents. This includes real `.env*` files except the three exact example templates, exact or dot-suffixed `secret` / `secrets` / `credential` / `credentials` path components, hyphen/underscore-prefixed secret/credential data files, private-key/container formats, Docker auth config, common service-account JSON, `auth.json`, `.npmrc`, `.pypirc`, `.netrc`, and common SSH private-key filenames. Secret-like source names such as `secretsManager.js` are scanned normally.
- `.env.example`, `.env.sample`, and `.env.template` may be scanned for variable names.
- The scanner does not intentionally extract or report secret values.
- Ordinary source/config files are read for signatures. A secret hardcoded in ordinary source is therefore still in a file the scanner reads.
- JSON/report output uses repository-relative evidence paths and does not include the local absolute repository root.
- Do not put passwords, recovery codes, private keys, or sensitive billing details in `ops.yaml`. Reference protected runbooks instead.

### Optional hygiene checks

`--hygiene` is off by default. When enabled, provider candidates are checked, and so are documentation (`.md` and `.txt`, other than `requirements*.txt`) plus `.cfg`, `.ini`, and `.xml` files. Those extra files do not supply provider evidence. The checks look for:

- secret-shaped tokens (cloud access-key prefixes, GitHub and Slack token prefixes, live Stripe secret prefixes, private-key headers, and quoted assignments to common secret names). A value that is only a GitHub Actions secret or variable expression is not treated as a hardcoded secret. A literal fallback inside that expression, including a quoted string, still counts. An empty string, or a secrets, vars, or github.token reference, does not. A hardcoded value beside an expression still counts.
- personal email providers such as Gmail, Outlook, iCloud, Yahoo, AOL, and Proton, only when the domain ends there
- absolute local paths: a Windows drive path with either slash when the first folder is at least two characters, a Unix or macOS home directory, and the root user's home directory, including an assignment with no space before the path. The Emscripten placeholder home directory and the GitHub-hosted runner home directory are ignored. A shell tilde is not treated as an absolute path. A root-relative `href` or `action`, and a Markdown link to a home or root route, are left out of this check. Lockfiles are not checked for these paths.

These checks report the rule, repository-relative path, and line number. They do not copy the matched secret, address, or path into text or JSON output. They are not a secrets scanner and do not read files the sensitive-path policy already skips. With `--ci`, hygiene findings are blocking.

## CLI

```text
ops-drift [path] [--ci] [--json] [--manifest ops.yaml] [--require-custody] [--hygiene] [--include-tests]
ops-drift init [path] [--include-tests]

--ci                exit 2 when the gate has blocking findings
--json              emit machine-readable JSON
--manifest <path>   use a specific manifest path
--require-custody   fail for incomplete custody on production-required instances
--hygiene           check for secret patterns, personal emails, and absolute local paths
--include-tests     scan test and fixture paths that are skipped by default
--help              show help
--version           show version

init                write a starter ops.yaml; refuses to overwrite an existing manifest
```

## What this is not

Ops Drift Gate is not a vulnerability scanner, SBOM replacement, cloud inventory platform, or AI code reviewer. Optional `--hygiene` checks are narrow pattern checks, not a secrets scanner.

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
- additional ecosystems/providers
- JSON Schema/editor assistance
- measured public-repository accuracy benchmark

### Later: Takeover

A possible paid layer could add private-repository dashboards, organization-wide operational inventories, provider integrations, historical drift, employee/offboarding checks, handoff packets, disaster-recovery reports, and acquisition due-diligence exports.

The open-source scanner should remain independently useful even if that hosted product never exists.

## License

MIT.
