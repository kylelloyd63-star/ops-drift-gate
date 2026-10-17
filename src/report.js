import { safeText } from "./safety.js";
import { TOOL_VERSION } from "./version.js";
export function formatReport(result) {
  const failOnUndocumented = result.failOnUndocumented;
  const lines = [
    "Ops Drift Gate",
    "==============",
    "Execution model: isolated stable working tree; concurrent writers unsupported",
    `Scanned files: ${result.scan.scannedFiles}`,
    `Test and fixture paths: ${result.includeTests ? "included" : "skipped"}`,
    `External operational dependencies detected: ${result.items.length}`,
    `Manifest: ${result.manifestPath ?? "not found"}`,
    ""
  ];

  if (result.items.length === 0) lines.push("No known external operational dependencies detected.");
  else for (const item of result.items) {
    let mark = "!";
    let suffix = "undocumented";
    if (item.ignored) { mark = "-"; suffix = `ignored: ${safeText(item.ignoreReason)}`; }
    else if (item.informationalOnly && !item.documented) { mark = "~"; suffix = "weak signal; informational only"; }
    else if (!failOnUndocumented && !item.documented) { mark = "~"; suffix = "undocumented; gate disabled"; }
    else if (item.documented) {
      const unknowns = item.instances.flatMap(instance => instance.custodyUnknowns.map(field => `${instance.id}.${field}`));
      mark = unknowns.length ? "?" : "✓";
      suffix = unknowns.length ? `documented; custody unknown: ${unknowns.join(", ")}` : `documented (${item.instances.map(instance => instance.id).join(", ")})`;
    }
    lines.push(`${mark} ${item.finding.name} [${item.finding.category}] (${item.finding.confidence}) — ${suffix}`);
    for (const evidence of item.finding.evidence.slice(0, 3)) lines.push(`    ${safeText(evidence.path)}${evidence.line ? `:${evidence.line}` : ""} — ${safeText(evidence.detail)}${evidence.ignores.length ? ` [ignored: ${evidence.ignores.map(x => x.id).join(", ")}]` : ""}`);
    if (item.finding.evidence.length > 3) lines.push(`    +${item.finding.evidence.length - 3} more evidence item(s)`);
  }

  lines.push("", `Environment variable names referenced: ${result.scan.envVars.length}`, `Sensitive files skipped without reading contents: ${result.scan.skippedSensitiveFiles.length}`);
  if (result.hygieneEnabled) {
    lines.push("", "Hygiene checks: on");
    if (!result.scan.hygiene?.length) lines.push("No hygiene findings.");
    for (const item of result.scan.hygiene ?? []) {
      const label = item.check === "secret" ? `secret pattern ${item.rule}` : item.check === "personal-email" ? "personal email address" : "absolute local path";
      lines.push(`! ${label} — ${safeText(item.path)}${item.line ? `:${item.line}` : ""}`);
    }
  }
  if (!result.complete) lines.push(`Gate status: ERROR — incomplete scan (${result.scan.warnings.map(w => w.code).join(", ")})`);
  else if (result.blocking.length) {
    lines.push(`Gate status: FAIL — ${result.blocking.length} blocking issue(s)`);
    if (!result.manifestPath && result.undocumented.length) lines.push("No custody manifest found. Run `ops-drift init` to write a starter ops.yaml.");
  }
  else lines.push("Gate status: PASS");
  return lines.join("\n");
}

export function machineReport(result) {
  return {
    schema_version: 1, tool: { name: "ops-drift-gate", version: TOOL_VERSION }, execution_model: "stable-working-tree", status: result.status, complete: result.complete,
    manifest: { path: result.manifestPath, version: result.manifestVersion, require_custody: result.requireCustody },
    summary: { scanned_files: result.scan.scannedFiles, candidate_bytes: result.scan.candidateBytes, undocumented_count: result.undocumented.length, unknown_custody_count: result.unknownCustody.length, skipped_sensitive_files: result.scan.skippedSensitiveFiles.length, include_tests: Boolean(result.includeTests), hygiene_enabled: Boolean(result.hygieneEnabled), hygiene_count: result.scan.hygiene?.length ?? 0 },
    findings: result.items.map(item => ({ ...item.finding, documented: item.documented, ignored: item.ignored, informational_only: item.informationalOnly, instances: item.instances.map(x => ({ id: x.id, missing_custody: x.custodyUnknowns })) })),
    hygiene: result.scan.hygiene ?? [],
    manifest_only: result.manifestOnly, blocking: result.blocking, warnings: result.scan.warnings
  };
}
export function summaryMarkdown(report) {
  const encoded = report.replace(/[&<>"'`]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" })[ch]);
  return `## Ops Drift Gate\n\n<pre>${encoded}</pre>\n`;
}
