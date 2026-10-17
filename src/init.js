import fs from "node:fs";
import path from "node:path";
import { auditRepository } from "./audit.js";
import { parseSimpleYaml, validateManifest } from "./manifest.js";
import { fail, repositoryRoot } from "./safety.js";

const MANIFEST_NAMES = ["ops.yaml", "ops.yml", "ops.json"];

function existingManifests(root) {
  const found = [];
  for (const name of MANIFEST_NAMES) {
    const full = path.join(root, name);
    let stat;
    try { stat = fs.lstatSync(full); }
    catch (error) { if (error.code !== "ENOENT") throw error; continue; }
    if (stat.isSymbolicLink()) fail("SYMLINK_OR_JUNCTION");
    if (!stat.isFile() || stat.nlink !== 1) fail("UNSAFE_FILE_TYPE_OR_HARDLINK");
    found.push(name);
  }
  return found;
}

export function renderStarterManifest(providerIds) {
  const lines = [
    "# Starter custody manifest written by ops-drift init.",
    "# Fill in owner, billing_owner, transferable, and recovery_procedure.",
    "# Do not store passwords, keys, or billing secrets in this file.",
    "version: 1",
    "services:"
  ];
  if (providerIds.length === 0) lines.push("  # none detected");
  for (const id of providerIds) {
    lines.push(
      `  ${id}:`,
      `    provider: ${id}`,
      `    purpose: null`,
      `    required_for_production: null`,
      `    custody:`,
      `      owner: null`,
      `      billing_owner: null`,
      `      transferable: unknown`,
      `      recovery_procedure: null`
    );
  }
  lines.push("checks:", "  hygiene: false", "");
  return lines.join("\n");
}

export function initRepository(rootInput, options = {}) {
  const root = repositoryRoot(rootInput, options.workspace);
  const existing = existingManifests(root);
  if (existing.length > 1) fail("MULTIPLE_MANIFESTS");
  if (existing.length === 1 && (existing[0] !== "ops.yaml" || !options.force)) fail("MANIFEST_EXISTS");
  const result = auditRepository(root, undefined, {
    workspace: options.workspace,
    includeTests: options.includeTests,
    failOnUndocumented: false,
    hygiene: false
  });
  if (!result.complete) fail(result.scan.warnings[0]?.code ?? "SCAN_OR_CONFIGURATION_ERROR");
  const providers = result.items.filter(item => !item.informationalOnly).map(item => item.finding.id).sort();
  const weak = result.items.filter(item => item.informationalOnly).map(item => item.finding.id).sort();
  const text = renderStarterManifest(providers);
  validateManifest(parseSimpleYaml(text));
  const target = path.join(root, "ops.yaml");
  const temporary = path.join(root, `.ops.yaml.${process.pid}.tmp`);
  fs.writeFileSync(temporary, text, { encoding: "utf8", flag: "wx" });
  try {
    if (existing.length === 1) fs.rmSync(target);
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
  return { path: "ops.yaml", providers, weak, replaced: existing.length === 1 };
}
