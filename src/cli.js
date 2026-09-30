#!/usr/bin/env node
import { auditRepository } from "./audit.js";
import { formatReport, machineReport } from "./report.js";
import { safeError } from "./safety.js";

function usage() {
  return `ops-drift [path] [--ci] [--json] [--manifest ops.yaml] [--require-custody]\n\nScans a repository for external operational dependencies and checks them against a human-maintained custody manifest.\n\n  --ci                exit 2 when the gate has blocking findings\n  --json              emit machine-readable JSON\n  --manifest <path>   use a specific manifest path\n  --require-custody   also fail for incomplete custody on production-required instances\n  --help              show this help\n  --version           show version\n`;
}

function parseArgs(argv) {
  let root = ".", rootSet = false, ci = false, json = false, manifest, requireCustody = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return "help";
    if (arg === "--version" || arg === "-v") return "version";
    if (arg === "--ci") ci = true;
    else if (arg === "--json") json = true;
    else if (arg === "--require-custody") requireCustody = true;
    else if (arg === "--manifest") { manifest = argv[++i]; if (!manifest) throw new Error("--manifest requires a path"); }
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (!rootSet) { root = arg; rootSet = true; }
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return { root, ci, json, manifest, requireCustody };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args === "help") console.log(usage());
  else if (args === "version") console.log("0.1.0");
  else {
    const result = auditRepository(args.root, args.manifest, { requireCustody: args.requireCustody });
    console.log(args.json ? JSON.stringify(machineReport(result), null, 2) : formatReport(result));
    if (!result.complete) process.exitCode = 1;
    else if (args.ci && result.blocking.length) process.exitCode = 2;
  }
} catch (error) {
  if (process.argv.includes("--json")) console.log(JSON.stringify({ schema_version: 1, tool: { name: "ops-drift-gate", version: "0.1.0" }, execution_model: "stable-working-tree", status: "error", complete: false, manifest: { path: null, version: null, require_custody: process.argv.includes("--require-custody") }, summary: {}, findings: [], manifest_only: [], blocking: [], warnings: [{ code: safeError(error) }] }));
  else console.error(`ops-drift: ${safeError(error)}`);
  process.exitCode = 1;
}
