import fs from "node:fs";
import path from "node:path";
import { loadManifest, parseSimpleYaml, validateManifest } from "./manifest.js";
import { scanRepository } from "./scanner.js";
import { fail, repositoryRoot, snapshotGuard } from "./safety.js";

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function render(providers, weak) {
  const lines = ["# Test and fixture paths are skipped unless scan.include_tests is true."];
  if (weak.length) lines.push(`# Informational signals were not added: ${weak.join(", ")}`);
  lines.push("version: 1", "services:");
  for (const service of providers) {
    lines.push(
      `  ${service.id}:`,
      `    provider: ${service.id}`,
      `    purpose: ${JSON.stringify(`Fill in why this repository uses ${service.name}`)}`,
      "    required_for_production: null",
      "    custody:",
      "      owner: null",
      "      billing_owner: null",
      "      transferable: null",
      "      recovery_procedure: null"
    );
  }
  return `${lines.join("\n")}\n`;
}

export function writeStarterManifest(rootInput, options = {}) {
  const root = repositoryRoot(rootInput, options.workspace);
  const guard = snapshotGuard(root);
  if (loadManifest(root, undefined, guard)) fail("MANIFEST_ALREADY_EXISTS");
  const scan = scanRepository(root, { ...options, hygiene: false }, guard);
  if (!scan.complete) fail(scan.warnings[0]?.code ?? "INCOMPLETE_SCAN");
  const providers = scan.services
    .filter(service => service.confidence === "strong" || service.confidence === "corroborated")
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const service of providers) if (!ID.test(service.id)) fail("INVALID_MANIFEST_KEY");
  const weak = scan.services.filter(service => service.confidence === "weak").map(service => service.id).sort();
  const text = render(providers, weak);
  validateManifest(parseSimpleYaml(text));
  const target = path.join(root, "ops.yaml");
  try { fs.writeFileSync(target, text, { encoding: "utf8", flag: "wx" }); }
  catch (error) { if (error.code === "EEXIST") fail("MANIFEST_ALREADY_EXISTS"); throw error; }
  return { path: "ops.yaml", providers: providers.map(service => service.id), weak };
}
