const custodyFields = new Set(["owner", "billing_owner", "transferable", "recovery_procedure"]);
const validId = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const validConfidence = new Set(["strong", "corroborated", "weak"]);
const validStatus = new Set(["pass", "fail", "error"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function parseInstance(value) {
  if (!isRecord(value) || typeof value.id !== "string" || !validId.test(value.id) || !Array.isArray(value.missing_custody)) {
    throw new Error("INVALID_INSTANCE");
  }
  const missingCustody = value.missing_custody.filter(field => custodyFields.has(field));
  if (missingCustody.length !== value.missing_custody.length) throw new Error("INVALID_CUSTODY_FIELD");
  return { id: value.id, missingCustody };
}

export function parseScanReport(value) {
  if (!isRecord(value) || value.schema_version !== 1 || value.tool?.name !== "ops-drift-gate") {
    throw new Error("UNSUPPORTED_REPORT");
  }
  if (!validStatus.has(value.status) || typeof value.complete !== "boolean" ||
      !isRecord(value.summary) || !isRecord(value.manifest) ||
      !Array.isArray(value.findings) || !Array.isArray(value.manifest_only) || !Array.isArray(value.blocking)) {
    throw new Error("INVALID_REPORT");
  }
  if (value.complete !== (value.status !== "error")) throw new Error("INVALID_STATUS");
  if (value.findings.length > 2000 || value.manifest_only.length > 2000 || value.blocking.length > 20000) {
    throw new Error("REPORT_LIMIT_EXCEEDED");
  }
  for (const key of ["scanned_files", "undocumented_count", "unknown_custody_count"]) {
    if (value.status === "error" && !Object.hasOwn(value.summary, key)) continue;
    if (!safeCount(value.summary[key])) throw new Error("INVALID_SUMMARY");
  }

  const blocking = value.blocking.map(item => {
    if (!isRecord(item) || typeof item.type !== "string") throw new Error("INVALID_BLOCKING_ITEM");
    if (item.type === "custody" && (typeof item.id !== "string" || !validId.test(item.id) || !Array.isArray(item.missing))) {
      throw new Error("INVALID_CUSTODY_ITEM");
    }
    if (item.type !== "custody") return { type: item.type };
    const missingCustody = item.missing.filter(field => custodyFields.has(field));
    if (missingCustody.length !== item.missing.length) throw new Error("INVALID_CUSTODY_FIELD");
    return { type: item.type, id: item.id, missingCustody };
  });

  const items = value.findings.map(finding => {
    if (!isRecord(finding) || typeof finding.id !== "string" || !validId.test(finding.id) ||
        typeof finding.name !== "string" || !validConfidence.has(finding.confidence) ||
        !Array.isArray(finding.instances) || !Array.isArray(finding.evidence)) {
      throw new Error("INVALID_FINDING");
    }
    if (finding.instances.length > 2000 || finding.evidence.length > 20000) throw new Error("REPORT_LIMIT_EXCEEDED");
    const instances = finding.instances.map(parseInstance);
    const missingCustody = [...new Set(instances.flatMap(instance => instance.missingCustody))];
    const documented = instances.length > 0;
    const ignored = finding.ignored === true;
    const informational = finding.informational_only === true;
    const status = ignored ? "ignored" : !documented ? (informational ? "informational" : "attention") : missingCustody.length ? "attention" : "documented";
    const manifest = ignored ? "Ignored" : !documented ? "Not documented" : missingCustody.length ? "Custody incomplete" : "Documented";
    const manifestClass = ignored ? "is-ignored" : !documented ? "is-missing" : missingCustody.length ? "is-incomplete" : "is-recorded";
    return {
      id: finding.id,
      name: finding.name.slice(0, 120),
      mark: finding.id.slice(0, 2).toUpperCase(),
      markClass: "provider-generic",
      confidence: finding.confidence[0].toUpperCase() + finding.confidence.slice(1),
      signalLevel: finding.confidence === "strong" ? 3 : finding.confidence === "corroborated" ? 2 : 1,
      manifest,
      manifestClass,
      status,
      purpose: typeof finding.category === "string" ? finding.category.slice(0, 120) : "External operational dependency",
      description: ignored
        ? "A manifest ignore rule acknowledges this signal."
        : informational
          ? "This weak signal is informational and does not block the gate by itself."
          : !documented
            ? "Repository evidence has no matching service instance in the manifest."
            : missingCustody.length
              ? "A manifest instance is present, but some required custody fields are missing."
              : "A manifest instance is present. The JSON report omits its custody values.",
      evidence: finding.evidence.slice(0, 20).map(item => {
        if (!isRecord(item) || typeof item.path !== "string") throw new Error("INVALID_EVIDENCE");
        return item.path.slice(0, 2048);
      }),
      instances,
      instance: `${instances.slice(0, 3).map(item => item.id).join(", ")}${instances.length > 3 ? ` +${instances.length - 3} more` : ""}` || "No manifest instance",
      missingCustody,
      ignored,
      informational
    };
  });

  const manifestOnly = value.manifest_only.map(item => {
    if (!isRecord(item) || typeof item.id !== "string" || !validId.test(item.id) ||
        typeof item.provider !== "string" || !validId.test(item.provider)) {
      throw new Error("INVALID_MANIFEST_ENTRY");
    }
    const custody = blocking.find(entry => entry.type === "custody" && entry.id === item.id);
    return { id: item.id, provider: item.provider, missingCustody: custody?.missingCustody ?? null };
  });

  return {
    status: value.status,
    complete: value.complete,
    version: typeof value.tool?.version === "string" ? value.tool.version.slice(0, 40) : "unknown",
    summary: {
      scannedFiles: value.summary.scanned_files ?? null,
      undocumented: value.summary.undocumented_count ?? null,
      custodyGaps: value.summary.unknown_custody_count ?? null
    },
    manifest: {
      exists: typeof value.manifest.path === "string",
      version: value.manifest.version === 1 ? 1 : null,
      requireCustody: value.manifest.require_custody === true
    },
    items,
    manifestOnly,
    blocking
  };
}
