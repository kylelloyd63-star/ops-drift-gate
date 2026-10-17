#!/usr/bin/env node
import { auditRepository } from "./audit.js";
import { initRepository } from "./init.js";
import { formatReport, machineReport } from "./report.js";
import { safeError } from "./safety.js";
import { TOOL_VERSION } from "./version.js";

function usage() {
  return `ops-drift [path] [--ci] [--json] [--manifest ops.yaml] [--require-custody] [--include-tests] [--hygiene]
ops-drift init [path] [--force] [--json] [--include-tests]

Scans a repository for external operational dependencies and checks them against a human-maintained custody manifest.

  --ci                exit 2 when the gate has blocking findings
  --json              emit machine-readable JSON
  --manifest <path>   use a specific manifest path
  --require-custody   also fail for incomplete custody on production-required instances
  --include-tests     scan test/, tests/, __tests__/, fixtures/, and *.test.* files
  --hygiene           check ordinary files for secret patterns, personal emails, and local absolute paths
  init                write a starter ops.yaml from strong or corroborated providers
  --force             replace an existing ops.yaml; custody notes and ignores are not kept
  --help              show this help
  --version           show version
`;
}

function parseArgs(argv) {
  let command = "scan";
  const args = [...argv];
  if (args[0] === "init") { command = "init"; args.shift(); }
  let root = ".", rootSet = false, ci = false, json = false, manifest, requireCustody = false, force = false, includeTests, hygiene;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") return "help";
    if (arg === "--version" || arg === "-v") return "version";
    if (arg === "--ci") {
      if (command === "init") throw new Error("--ci cannot be used with init");
      ci = true;
    } else if (arg === "--json") json = true;
    else if (arg === "--require-custody") {
      if (command === "init") throw new Error("--require-custody cannot be used with init");
      requireCustody = true;
    } else if (arg === "--include-tests") includeTests = true;
    else if (arg === "--hygiene") {
      if (command === "init") throw new Error("--hygiene cannot be used with init");
      hygiene = true;
    } else if (arg === "--force") {
      if (command !== "init") throw new Error("--force requires init");
      force = true;
    } else if (arg === "--manifest") {
      if (command === "init") throw new Error("--manifest cannot be used with init");
      manifest = args[++i];
      if (!manifest) throw new Error("--manifest requires a path");
    } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (!rootSet) { root = arg; rootSet = true; }
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return { command, root, ci, json, manifest, requireCustody, force, includeTests, hygiene };
}

function errorReport(error) {
  return { schema_version: 1, tool: { name: "ops-drift-gate", version: TOOL_VERSION }, execution_model: "stable-working-tree", status: "error", complete: false, manifest: { path: null, version: null, require_custody: process.argv.includes("--require-custody") }, summary: {}, findings: [], manifest_only: [], blocking: [], warnings: [{ code: safeError(error) }], hint: null };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args === "help") console.log(usage());
  else if (args === "version") console.log(TOOL_VERSION);
  else if (args.command === "init") {
    const written = initRepository(args.root, { force: args.force, includeTests: args.includeTests });
    if (args.json) console.log(JSON.stringify({ schema_version: 1, tool: { name: "ops-drift-gate", version: TOOL_VERSION }, status: "ok", manifest: written.path, providers: written.providers, weak: written.weak, replaced: written.replaced }, null, 2));
    else {
      console.log(`Wrote ${written.path}`);
      console.log(`Providers: ${written.providers.join(", ") || "(none)"}`);
      if (written.weak.length) console.log(`Weak signals left out: ${written.weak.join(", ")}`);
      if (written.replaced) console.log("Replaced the existing ops.yaml. Custody notes and ignores in that file were not kept.");
      console.log("Fill in owner, billing owner, transferability, and a recovery procedure. Do not store secrets in the manifest.");
    }
  } else {
    const result = auditRepository(args.root, args.manifest, { requireCustody: args.requireCustody, includeTests: args.includeTests, hygiene: args.hygiene });
    console.log(args.json ? JSON.stringify(machineReport(result), null, 2) : formatReport(result));
    if (!result.complete) process.exitCode = 1;
    else if (args.ci && result.blocking.length) process.exitCode = 2;
  }
} catch (error) {
  if (process.argv.includes("--json")) console.log(JSON.stringify(errorReport(error), null, 2));
  else console.error(`ops-drift: ${safeError(error)}`);
  process.exitCode = 1;
}
