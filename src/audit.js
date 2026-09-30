import { loadManifest } from "./manifest.js";
import { scanRepository } from "./scanner.js";
import { LIMITS, fail, repositoryRoot, safeText, safeError, snapshotGuard } from "./safety.js";

function custodyUnknowns(record) {
  const missing = [];
  if (!record?.custody?.owner) missing.push("owner");
  if (!record?.custody?.billing_owner) missing.push("billing_owner");
  if (record?.custody?.transferable == null || record.custody.transferable === "unknown") missing.push("transferable");
  if (!record?.custody?.recovery_procedure) missing.push("recovery_procedure");
  return missing;
}

export function auditRepository(root, manifestPath, options = {}) {
  const resolvedRoot = repositoryRoot(root);
  const guard = snapshotGuard(resolvedRoot);
  const loaded = loadManifest(resolvedRoot, manifestPath, guard);
  const scan = scanRepository(resolvedRoot, options, guard);
  const services = loaded?.manifest.services ?? {};
  const ignores = loaded?.manifest.ignores ?? {};
  const entries = Object.entries(services);
  const requireCustody = Boolean(options.requireCustody);
  const ignoreByProvider = new Map();
  for (const [id, rule] of Object.entries(ignores)) {
    const rules = ignoreByProvider.get(rule.provider) ?? [];
    rules.push({ id, ...rule }); ignoreByProvider.set(rule.provider, rules);
  }
  let ignoreChecks = 0, ignoreMatches = 0;
  const ignoredBy = (provider, evidence) => {
    const matches = [];
    for (const rule of ignoreByProvider.get(provider) ?? []) {
      if (++ignoreChecks > LIMITS.ignoreChecks) fail("IGNORE_COMPARISON_LIMIT");
      if (rule.scope === "all" || evidence.path === safeText(rule.path_prefix) || evidence.path.startsWith(`${safeText(rule.path_prefix)}/`)) {
        if (++ignoreMatches > LIMITS.ignoreMatches) fail("IGNORE_MATCH_COUNT_LIMIT");
        matches.push(rule);
      }
    }
    return matches;
  };

  const items = scan.services.map(finding => {
    const evidence = finding.evidence.map(e => ({ ...e, ignores: ignoredBy(finding.id, e) }));
    const active = evidence.filter(e => !e.ignores.length);
    const confidence = active.some(e => e.strength === "strong") ? "strong" : new Set(active.map(e => `${e.kind}:${e.path}`)).size >= 2 ? "corroborated" : "weak";
    const ignored = active.length === 0;
    const instances = entries
      .filter(([, record]) => record.provider === finding.id)
      .map(([id, record]) => ({ id, record, custodyUnknowns: custodyUnknowns(record) }));
    const documented = instances.length > 0;
    const informationalOnly = confidence === "weak";
    return {
      finding: { ...finding, evidence, activeConfidence: confidence },
      ignored,
      ignoreReason: ignored ? [...new Set(evidence.flatMap(e => e.ignores.map(rule => rule.reason)))].join("; ") : null,
      documented,
      informationalOnly,
      instances
    };
  });

  const undocumented = items
    .filter(item => !item.ignored && !item.documented && !item.informationalOnly)
    .map(item => item.finding.id);

  const unknownCustody = requireCustody
    ? entries.filter(([, record]) => record.required_for_production !== false && custodyUnknowns(record).length).map(([id, record]) => ({ id, provider: record.provider, missing: custodyUnknowns(record) }))
    : [];

  if (scan.complete) try { guard.verify(); } catch (error) {
    scan.complete = false; scan.warnings.push({ code: safeError(error), path: "." });
  }
  return {
    scan,
    manifestPath: loaded ? safeText(loaded.path) : null,
    manifestVersion: loaded?.manifest.version ?? null,
    manifestOnly: entries.filter(([, record]) => !items.some(item => item.finding.id === record.provider)).map(([id, record]) => ({ id, provider: record.provider })),
    complete: scan.complete,
    status: !scan.complete ? "error" : (options.failOnUndocumented !== false && undocumented.length || unknownCustody.length) ? "fail" : "pass",
    failOnUndocumented: options.failOnUndocumented !== false,
    requireCustody,
    items,
    undocumented,
    unknownCustody,
    blocking: [...(options.failOnUndocumented !== false ? undocumented.map(provider => ({ type: "undocumented", provider })) : []), ...unknownCustody.map(item => ({ type: "custody", ...item }))]
  };
}
