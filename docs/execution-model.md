# Supported execution model

Ops Drift Gate scans a **stable working tree in an isolated job**. Repository content and names are untrusted; the host, scanner code, filesystem and job configuration must be trusted. No process may edit the scan root or its ancestors during the audit.

## Supported deployment

For GitHub Actions, use a fresh GitHub-hosted Linux or Windows job. Checkout the target with credential persistence disabled, then invoke a pinned Ops Drift Gate Action **before** installing dependencies or running target scripts, tests, build tools, background servers or other target code. Do not share the checkout with another job or writable container mount. Normal scanning requires only checkout read permission and no repository secrets.

GitHub-hosted jobs provide fresh virtual machines. That job isolation does not separate steps or processes inside one job. A self-hosted runner must provide equivalent per-job isolation and a quiescent checkout; an ordinary reused shared runner is outside this model.

For the CLI/library, stop writers and use a dedicated checkout or externally enforced read-only snapshot. The tool does not establish isolation, discover every writer, or freeze the filesystem for the caller.

## Checks and limits

The scanner checks path components, rejects links and candidate hardlinks, compares file identity around bounded descriptor reads, and verifies observed directory/file versions at the end. The manifest shares this audit-wide version guard. Observed replacement, content change, permission denial, invalid input or resource exhaustion cannot produce a complete pass.

These are mutation detectors, not atomic confinement. Transient changes, mount/reparse tricks or an active writer may race pathname checks. The host must enforce the deployment assumption. No stronger guarantee is made by a complete result.

Copying an untrusted live tree would still race during collection; making a destination read-only would not confine those source reads. Portable Node 24 path/descriptor APIs do not provide directory-relative atomic confinement on both Linux and Windows. Adding a native sandbox or handle helper would create a new security boundary and is intentionally outside v0.1.

## Git checkout representation

Normal Git checkouts must have a genuine `.git` directory at the scan root or an ancestor within the allowed workspace, and a valid, bounded index. Nested scan roots use the nearest such ancestor. Index versions 2/3/4 with SHA-1 or SHA-256 checksums are supported. Metadata is read directly under the same path/version guard; Git config, hooks, object content and link targets are never read or executed by the scanner. Ordinary non-Git directories remain supported.

Tracked symbolic-link mode `120000` is rejected before source reads on every platform, whether the working tree contains a real link, a Windows junction, or a Windows placeholder text file. Ordinary mode-`100644`/`100755` files containing path-like text are accepted. There is no content heuristic. Untracked actual links are also rejected by traversal.

Tracked submodules, unmerged entries, skip-worktree/sparse or split indexes, missing/corrupt indexes, linked-worktree `.git` pointer files, unsupported mandatory extensions and invalid path encodings fail closed. Use a fresh full ordinary clone for this input contract. The index limit is 32 MiB and 100,000 entries; it is separate bounded metadata, not a scanned source candidate.

This checks tracked link representation; it does not verify that a working tree matches a particular commit or is clean.

## References

- [Node.js 24 filesystem APIs](https://nodejs.org/docs/latest-v24.x/api/fs.html)
- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Git index format](https://git-scm.com/docs/index-format)
