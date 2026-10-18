#!/usr/bin/env node
import { auditRepository } from "./audit.js";
import { writeStarterManifest } from "./init.js";
import { formatReport, machineReport } from "./report.js";
import { SafetyError, safeError } from "./safety.js";
import { TOOL_VERSION } from "./version.js";

function usage() {
  return `ops-drift [path] [--ci] [--json] [--manifest ops.yaml] [--require-custody] [--hygiene] [--include-tests]
ops-drift init [path] [--include-tests]

Scans a repository for external operational dependencies and checks them against a human-maintained custody manifest.

  --ci                exit 2 when the gate has blocking findings
  --json              emit machine-readable JSON
  --manifest <path>   use a specific manifest path
  --require-custody   also fail for incomplete custody on production-required instances
  --hygiene           also check for secret patterns, personal emails, and absolute local paths
  --include-tests     scan test and fixture paths that are skipped by default
  --help              show this help
  --version           show version

init                write a starter ops.yaml from detected providers; refuses to overwrite
`;
}

function parseArgs(argv) {
  if (argv[0] === "init") return parseInitArgs(argv.slice(1));
  let root = ".", rootSet = false, ci = false, json = false, manifest, requireCustody = false, hygiene = false, includeTests = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return "help";
    if (arg === "--version" || arg === "-v") return "version";
    if (arg === "--ci") ci = true;
    else if (arg === "--json") json = true;
    else if (arg === "--require-custody") requireCustody = true;
    else if (arg === "--hygiene") hygiene = true;
    else if (arg === "--include-tests") includeTests = true;
    else if (arg === "--manifest") { manifest = argv[++i]; if (!manifest) throw new Error("--manifest requires a path"); }
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (!rootSet) { root = arg; rootSet = true; }
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return { root, ci, json, manifest, requireCustody, hygiene, includeTests };
}

function parseInitArgs(argv) {
  let root = ".", rootSet = false, includeTests = false;
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return "help";
    if (arg === "--include-tests") includeTests = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (!rootSet) { root = arg; rootSet = true; }
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return { command: "init", root, includeTests };
}

function writtenPath(root) {
  const normalized = String(root).replaceAll("\\", "/").replace(/\/+$/, "");
  if (normalized === "" || normalized === ".") return "ops.yaml";
  return `${normalized}/ops.yaml`;
}

function initError(error) {
  if (error instanceof SafetyError && error.code === "MANIFEST_ALREADY_EXISTS") return "a custody manifest already exists; init will not overwrite it";
  return safeError(error);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args === "help") console.log(usage());
  else if (args === "version") console.log(TOOL_VERSION);
  else if (args.command === "init") {
    try {
      const written = writeStarterManifest(args.root, { includeTests: args.includeTests });
      const listed = written.providers.length ? `: ${written.providers.join(", ")}` : "";
      console.log(`Wrote ${writtenPath(args.root)} with ${written.providers.length} service(s)${listed}.`);
      if (written.weak.length) console.log(`Informational signals were not added: ${written.weak.join(", ")}.`);
      console.log("Fill in owner, billing owner, transferability, and recovery procedure.");
    } catch (error) {
      console.error(`ops-drift: ${initError(error)}`);
      process.exitCode = 1;
    }
  }
  else {
    const result = auditRepository(args.root, args.manifest, { requireCustody: args.requireCustody, hygiene: args.hygiene, ...(args.includeTests ? { includeTests: true } : {}) });
    console.log(args.json ? JSON.stringify(machineReport(result), null, 2) : formatReport(result));
    if (!result.complete) process.exitCode = 1;
    else if (args.ci && result.blocking.length) process.exitCode = 2;
  }
} catch (error) {
  if (process.argv.includes("--json")) console.log(JSON.stringify({ schema_version: 1, tool: { name: "ops-drift-gate", version: TOOL_VERSION }, execution_model: "stable-working-tree", status: "error", complete: false, manifest: { path: null, version: null, require_custody: process.argv.includes("--require-custody") }, summary: {}, findings: [], manifest_only: [], blocking: [], warnings: [{ code: safeError(error) }] }));
  else console.error(`ops-drift: ${safeError(error)}`);
  process.exitCode = 1;
}
