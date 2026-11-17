import { safeText } from "./safety.js";
import { TOOL_VERSION } from "./version.js";

function markdownText(value) {
  return safeText(value)
    .replace(/\r?\n/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_{}\[\]()#+.!|]/g, "\\$&");
}

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
  if (result.scan.notes?.length) {
    lines.push("", "Non-UTF-8 hygiene files skipped:");
    for (const note of result.scan.notes) lines.push(`- ${safeText(note.path)} (${note.code})`);
  }
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
    notes: result.scan.notes ?? [],
    manifest_only: result.manifestOnly, blocking: result.blocking, warnings: result.scan.warnings
  };
}

export function handoffMarkdown(result) {
  const status = result.status === "error" ? "ERROR" : result.status.toUpperCase();
  const lines = [
    "# Ops Drift Gate — Operational Handoff Brief",
    "",
    `**Gate status:** ${status}`,
    `**Scan completeness:** ${result.complete ? "Complete" : "Incomplete"}`,
    `**Scanner version:** ${markdownText(TOOL_VERSION)}`,
    `**Files scanned:** ${result.scan.scannedFiles}`,
    `**Manifest:** ${result.manifestPath ? "Found" : "Not found"}`,
    "",
    "> This brief summarizes known repository signals. It is not an exhaustive inventory; confirm production use, ownership, billing, transfer access, and recovery with the responsible people.",
    "",
    "## Service review",
    ""
  ];

  if (!result.items.length) lines.push("No provider findings were included in this report.", "");
  for (const item of result.items) {
    const instances = item.instances.map(instance => markdownText(instance.id));
    const missingCustody = item.instances.flatMap(instance => instance.custodyUnknowns);
    lines.push(`### ${markdownText(item.finding.name)}`);
    lines.push(`- Evidence confidence: ${markdownText(item.finding.confidence)}`);
    const reviewStatus = item.ignored ? "Ignored by manifest" : item.informationalOnly ? "Informational signal" : missingCustody.length ? "Custody incomplete" : item.documented ? "Documented" : "Undocumented";
    lines.push(`- Review status: ${reviewStatus}`);
    lines.push(`- Manifest instances: ${instances.length ? instances.join(", ") : "None recorded"}`);
    if (missingCustody.length) {
      const labels = [...new Set(missingCustody)].map(field => ({
        owner: "owner",
        billing_owner: "billing owner",
        transferable: "transferability",
        recovery_procedure: "recovery procedure"
      })[field] ?? field);
      lines.push(`- Missing custody fields: ${labels.map(markdownText).join(", ")}`);
    } else if (instances.length) {
      lines.push("- Required custody fields are recorded; values are not included in this brief.");
    }

    const evidence = item.finding.evidence.slice(0, 3);
    if (evidence.length) {
      const paths = evidence.map(entry => `${markdownText(entry.path)}${entry.line ? `:${entry.line}` : ""}`);
      if (item.finding.evidence.length > evidence.length) paths.push(`+${item.finding.evidence.length - evidence.length} more`);
      lines.push(`- Evidence paths: ${paths.join(", ")}`);
    }
    if (item.ignored) lines.push("- Follow-up: review the manifest ignore rationale with the service owner.");
    else if (item.informationalOnly) lines.push("- Follow-up: corroborate this weak signal before treating it as a dependency.");
    else if (!item.documented || missingCustody.length) lines.push("- Follow-up: confirm the service instance and assign an owner for unresolved custody fields.");
    lines.push("");
  }

  if (result.manifestOnly.length) {
    lines.push("## Manifest-only inventory", "");
    const entries = result.manifestOnly.slice(0, 200);
    for (const entry of entries) lines.push(`- ${markdownText(entry.id)} (${markdownText(entry.provider)}): not detected in this scan`);
    if (result.manifestOnly.length > entries.length) lines.push(`- ${result.manifestOnly.length - entries.length} more manifest-only entries omitted`);
    lines.push("");
  }

  if (!result.complete && result.scan.warnings.length) {
    lines.push("## Scan warnings", "");
    for (const warning of result.scan.warnings) lines.push(`- ${markdownText(warning.code)}`);
    lines.push("");
  }

  if (result.hygieneEnabled) {
    lines.push("## Hygiene checks", "", `- Findings: ${result.scan.hygiene?.length ?? 0}`);
    for (const finding of result.scan.hygiene ?? []) {
      const label = finding.check === "secret" ? `secret pattern ${finding.rule}` : finding.check === "personal-email" ? "personal email address" : "absolute local path";
      lines.push(`- ${markdownText(label)} — ${markdownText(finding.path)}${finding.line ? `:${finding.line}` : ""}`);
    }
    lines.push("");
  }

  lines.push(
    "## Handoff checklist",
    "",
    "- [ ] Confirm each detected service is used in production or intentionally ignored.",
    "- [ ] Name an accountable owner and billing contact for each production instance.",
    "- [ ] Confirm access can transfer and reference a protected recovery procedure.",
    "- [ ] Assign an owner and due date to every unresolved item.",
    "",
    "_Generated locally by Ops Drift Gate. Custody values and evidence contents are intentionally excluded._",
    ""
  );
  return lines.join("\n");
}

export function summaryMarkdown(result) {
  const status = result.status === "error" ? "ERROR" : result.status.toUpperCase();
  const count = value => Number.isSafeInteger(value) && value >= 0 ? String(value) : "—";
  const undocumentedLabel = result.failOnUndocumented
    ? "Undocumented providers (blocking)"
    : "Undocumented providers (non-blocking)";
  const custodyResult = result.requireCustody ? count(result.unknownCustody.length) : "Not enforced";
  const nextStep = status === "ERROR"
    ? "The scan was incomplete and must not be treated as a pass. Review the error details in the job log."
    : status === "FAIL"
      ? "Review blocking findings in the job log and confirm each provider and custody requirement with its owner."
      : "No blocking drift was found within the declared scan scope; this is not an exhaustive dependency inventory.";
  return [
    `## Ops Drift Gate · ${status}`,
    "",
    `**Gate status: ${status}**`,
    "",
    "| Check | Result |",
    "| --- | ---: |",
    `| Scan completeness | ${result.complete ? "Complete" : "Incomplete"} |`,
    `| Files scanned | ${count(result.scan.scannedFiles)} |`,
    `| Services detected | ${count(result.items.length)} |`,
    `| ${undocumentedLabel} | ${count(result.undocumented.length)} |`,
    `| Incomplete custody records | ${custodyResult} |`,
    `| Manifest | ${result.manifestPath ? "Found" : "Not found"} |`,
    "",
    nextStep,
    "",
    "_This summary contains counts only. The scanner does not execute repository code or transmit scan contents._",
    ""
  ].join("\n");
}
