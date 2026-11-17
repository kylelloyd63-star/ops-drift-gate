import { parseScanReport } from "./report.js";

const services = [
  {
    id: "cloudflare",
    name: "Cloudflare Pages",
    instance: "cloudflare-production",
    mark: "C",
    markClass: "provider-cloudflare",
    confidence: "Strong",
    signalLevel: 3,
    manifest: "Not documented",
    manifestClass: "is-missing",
    purpose: "Static hosting and DNS",
    description: "A hosting configuration is present, but this service has no matching entry in the example manifest.",
    evidence: ["wrangler.toml"],
    signal: "Known hosting configuration",
    status: "attention",
    starter: `  cloudflare-production:
    provider: cloudflare
    purpose: static hosting and DNS
    required_for_production: true
    custody:
      owner: null
      billing_owner: null
      transferable: null
      recovery_procedure: null`,
    owner: null,
    billing: null,
    transfer: null,
    recovery: null
  },
  {
    id: "supabase",
    name: "Supabase",
    instance: "supabase-production",
    mark: "S",
    markClass: "provider-supabase",
    confidence: "Corroborated",
    signalLevel: 2,
    manifest: "Not documented",
    manifestClass: "is-missing",
    purpose: "Application database",
    description: "Multiple independent signals suggest this repository depends on Supabase; the example manifest does not record it.",
    evidence: [".env.example", "src/lib/database.js"],
    signal: "Environment and code signals",
    status: "attention",
    starter: `  supabase-production:
    provider: supabase
    purpose: application database
    required_for_production: true
    custody:
      owner: null
      billing_owner: null
      transferable: null
      recovery_procedure: null`,
    owner: null,
    billing: null,
    transfer: null,
    recovery: null
  },
  {
    id: "stripe",
    name: "Stripe",
    instance: "stripe-production",
    mark: "S",
    markClass: "provider-stripe",
    confidence: "Strong",
    signalLevel: 3,
    manifest: "Custody incomplete",
    manifestClass: "is-incomplete",
    purpose: "Production payments",
    description: "This provider is recorded, but one or more required custody details are missing in the example manifest.",
    evidence: ["package.json", "src/billing/checkout.js"],
    signal: "Package and integration signals",
    status: "attention",
    starter: `  stripe-production:
    provider: stripe
    purpose: production payments
    required_for_production: true
    custody:
      owner: Payments team
      billing_owner: Finance
      transferable: true
      recovery_procedure: null`,
    owner: "Payments team",
    billing: "Finance",
    transfer: "Yes",
    recovery: null
  },
  {
    id: "github-actions",
    name: "GitHub Actions",
    instance: "github-actions",
    mark: "GH",
    markClass: "provider-github",
    confidence: "Strong",
    signalLevel: 3,
    manifest: "Documented",
    manifestClass: "is-recorded",
    purpose: "CI and release workflows",
    description: "A matching service entry and complete custody details are present in this illustrative manifest.",
    evidence: [".github/workflows/ci.yml"],
    signal: "Workflow configuration",
    status: "documented",
    starter: `  github-actions:
    provider: github-actions
    purpose: CI and release workflows
    required_for_production: true
    custody:
      owner: Engineering
      billing_owner: Engineering
      transferable: true
      recovery_procedure: Protected runbook: RELEASE-01`,
    owner: "Engineering",
    billing: "Engineering",
    transfer: "Yes",
    recovery: "RELEASE-01"
  }
];

const findingList = document.querySelector("#finding-list");
const detailPanel = document.querySelector("#detail-panel");
const emptyFindings = document.querySelector("#empty-findings");
const visibleCount = document.querySelector("#visible-count");
const searchInput = document.querySelector("#finding-search");
const toast = document.querySelector("#toast");
const previewMessage = document.querySelector("#preview-message");
const overviewView = document.querySelector("#overview-view");
const manifestView = document.querySelector("#manifest-view");
const manifestRows = document.querySelector("#manifest-rows");
const reportInput = document.querySelector("#scan-report-file");
const copyManifestButton = document.querySelector("#copy-manifest");
const exportBriefButton = document.querySelector("#export-brief");
let activeServices = services;
let activeReport = null;
const visualMode = document.querySelector("#visual-mode");
const visualModeStatus = document.querySelector("#visual-mode-status");
const reducedMotion = window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : { matches: false };
const finePointer = window.matchMedia
  ? window.matchMedia("(pointer: fine)")
  : { matches: false };
const hardwareCanHandleEffects =
  (navigator.hardwareConcurrency === undefined || navigator.hardwareConcurrency >= 4) &&
  (navigator.deviceMemory === undefined || navigator.deviceMemory >= 2);
let selectedId = services[0].id;
let activeFilter = "all";
let toastTimer;
const impactTimers = new WeakMap();

function watchMediaQuery(query, callback) {
  if (typeof query.addEventListener === "function") query.addEventListener("change", callback);
  else if (typeof query.addListener === "function") query.addListener(callback);
}

function iconForState(service) {
  if (service.status === "documented") {
    return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>`;
  }
  if (service.status === "attention" && service.manifestClass === "is-incomplete") {
    return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v7m0 3v.1M3 17h14L10 3 3 17Z"/></svg>`;
  }
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>`;
}

function signalMeter(service) {
  const level = Math.max(0, Math.min(3, service.signalLevel || 0));
  const bars = [1, 2, 3].map((bar) => `<i${bar <= level ? ' class="is-on"' : ""}></i>`).join("");
  return `<span class="signal-meter is-level-${level}" aria-hidden="true">${bars}</span>`;
}

function applyVisualMode() {
  const mode = visualMode.value;
  const automaticEffectsAvailable = finePointer.matches && !reducedMotion.matches && hardwareCanHandleEffects;
  const effectsEnabled = !reducedMotion.matches && (mode === "signal" || (mode === "auto" && automaticEffectsAvailable));
  document.documentElement.classList.toggle("signal-effects", effectsEnabled);
  if (mode === "auto") {
    visualModeStatus.textContent = `Auto · ${effectsEnabled ? "Signal" : "Standard"}`;
  } else if (mode === "signal" && reducedMotion.matches) {
    visualModeStatus.textContent = "Signal paused · reduced motion";
  } else {
    visualModeStatus.textContent = `${mode[0].toUpperCase()}${mode.slice(1)} mode`;
  }
}

function pulseSignal(row) {
  if (!document.documentElement.classList.contains("signal-effects") || reducedMotion.matches) return;
  window.clearTimeout(impactTimers.get(row));
  row.classList.remove("is-impacted");
  void row.offsetWidth;
  row.classList.add("is-impacted");
  impactTimers.set(row, window.setTimeout(() => row.classList.remove("is-impacted"), 620));
}

function filteredServices() {
  const query = searchInput.value.trim().toLowerCase();
  return activeServices.filter((service) => {
    const matchesFilter = activeFilter === "all" ||
      (activeFilter === "documented" ? service.status === "documented" : service.status === "attention");
    const searchable = `${service.name} ${service.instance} ${service.purpose} ${service.confidence} ${service.manifest} ${service.signal} ${service.evidence.join(" ")}`.toLowerCase();
    return matchesFilter && searchable.includes(query);
  });
}

function renderList() {
  const visible = filteredServices();
  if (!visible.some((service) => service.id === selectedId) && visible.length) selectedId = visible[0].id;
  findingList.innerHTML = visible.map((service) => {
    const attentionClass = service.status === "attention" ? " has-attention" : "";
    return `
      <button class="finding-row${attentionClass}${service.id === selectedId ? " is-selected" : ""}" type="button" data-service="${escapeHtml(service.id)}" aria-label="${escapeHtml(`Service ${service.name}, instance ${service.instance}. Confidence: ${service.confidence}. Manifest: ${service.manifest}.`)}" aria-pressed="${service.id === selectedId}">
        <span class="service-cell">
          <span class="provider-mark ${service.markClass}" aria-hidden="true">${escapeHtml(service.mark)}</span>
          <span class="service-text"><strong>${escapeHtml(service.name)}</strong><small>${escapeHtml(service.instance)}</small></span>
        </span>
        <span class="confidence" aria-label="Evidence signal: ${escapeHtml(service.confidence)}">${signalMeter(service)}<span>${escapeHtml(service.confidence)}</span></span>
        <span class="manifest-state ${service.manifestClass}">${iconForState(service)}<span>${escapeHtml(service.manifest)}</span></span>
      </button>
    `;
  }).join("");
  emptyFindings.hidden = visible.length > 0;
  visibleCount.textContent = `${visible.length} ${visible.length === 1 ? "service" : "services"}`;
  if (visible.length) renderDetails(activeServices.find((service) => service.id === selectedId));
  else detailPanel.innerHTML = `<p class="empty-detail">No matching service to inspect.</p>`;
}

function renderManifest() {
  const rows = activeReport
    ? activeServices.flatMap(service => service.instances.map(instance => ({
      id: instance.id,
      name: service.name,
      purpose: service.purpose,
      mark: service.mark,
      markClass: service.markClass,
      missingCustody: instance.missingCustody,
      custodyKnown: true
    }))).concat(activeReport.manifestOnly.map(instance => {
      const service = activeServices.find(item => item.id === instance.provider);
      return {
        id: instance.id,
        name: service?.name ?? instance.provider,
        purpose: "Manifest-only inventory",
        mark: service?.mark ?? instance.provider.slice(0, 2).toUpperCase(),
        markClass: service?.markClass ?? "provider-generic",
        missingCustody: instance.missingCustody,
        custodyKnown: instance.missingCustody !== null
      };
    }))
    : activeServices.filter(service => service.manifestClass !== "is-missing").map(service => ({
      id: service.instance,
      name: service.name,
      purpose: service.purpose,
      mark: service.mark,
      markClass: service.markClass,
      owner: service.owner,
      billing: service.billing,
      transfer: service.transfer,
      recovery: service.recovery,
      custodyKnown: true,
      missingCustody: [
        service.owner ? null : "owner",
        service.billing ? null : "billing_owner",
        service.transfer ? null : "transferable",
        service.recovery ? null : "recovery_procedure"
      ].filter(Boolean)
    }));

  const fieldValue = (row, field, sampleValue) => {
    if (!activeReport) return sampleValue ?? "Not recorded";
    if (!row.custodyKnown) return "Not included in report";
    return row.missingCustody.includes(field) ? "Not recorded" : "Recorded";
  };
  manifestRows.innerHTML = rows.length ? rows.map(row => {
    const complete = row.custodyKnown && row.missingCustody.length === 0;
    const unknown = !row.custodyKnown;
    const custodyClass = unknown ? "is-unknown" : complete ? "is-complete" : "is-incomplete";
    const custodyLabel = unknown ? "Not in report" : complete ? "Complete" : "Incomplete";
    const fields = [
      ["owner", "Owner", row.owner],
      ["billing_owner", "Billing", row.billing],
      ["transferable", "Transferable", row.transfer],
      ["recovery_procedure", "Recovery", row.recovery]
    ];
    const fieldCells = fields.map(([field, label, sampleValue]) => {
      const value = fieldValue(row, field, sampleValue);
      const missing = value === "Not recorded";
      return `<span class="manifest-field-cell${missing ? " missing-value" : ""}" role="cell"><span class="manifest-mobile-label" aria-hidden="true">${label}</span>${escapeHtml(value)}</span>`;
    }).join("");
    return `
      <div class="manifest-row" role="row">
        <div class="manifest-service" role="rowheader">
          <span class="provider-mark ${row.markClass}" aria-hidden="true">${escapeHtml(row.mark)}</span>
          <div><strong>${escapeHtml(row.id)}</strong><small>${escapeHtml(row.name)} · ${escapeHtml(row.purpose)}</small></div>
        </div>
        ${fieldCells}
        <span class="custody-status ${custodyClass}" role="cell"><i></i>${custodyLabel}</span>
      </div>
    `;
  }).join("") : `<p class="empty-state">No manifest entries were reported.</p>`;

  document.querySelector("#manifest-caption").textContent = activeReport
    ? activeReport.manifest.exists ? "Local scan report · manifest found" : "Local scan report · no manifest"
    : "Example manifest · ops.yaml";
  document.querySelector("#manifest-description").textContent = activeReport
    ? "Custody values are omitted from scanner JSON; this view shows only whether fields were recorded."
    : "Illustrative records only. Nothing here was read from your files.";
  document.querySelector("#manifest-version").textContent = activeReport && activeReport.manifest.version
    ? `VERSION ${activeReport.manifest.version}`
    : activeReport ? "NO MANIFEST" : "VERSION 1";
  document.querySelector("#manifest-table").setAttribute("aria-label", activeReport
    ? "Custody field presence from local scan report"
    : "Example service custody manifest");
  document.querySelector("#manifest-footnote").innerHTML = activeReport
    ? `<span class="status-dot"></span> The report exposes custody completeness, not owner names, billing details, or recovery references.`
    : `<span class="status-dot"></span> Custody completeness is evaluated only for production-required services when that check is enabled.`;
  copyManifestButton.disabled = Boolean(activeReport);
  document.querySelector("#copy-manifest-label").textContent = activeReport ? "Values omitted from report" : "Copy example YAML";
  exportBriefButton.disabled = !activeReport;
}

function renderDetails(service) {
  const evidence = service.evidence.map((path) => `<li><code>${escapeHtml(path)}</code></li>`).join("");
  const custodyValue = (field, sampleValue) => {
    if (!activeReport) return sampleValue ?? "Not recorded";
    if (!service.instances.length) return "No manifest record";
    return service.instances.some(instance => instance.missingCustody.includes(field))
      ? "Not recorded"
      : "Recorded · value omitted";
  };
  const custodyRows = [
    ["Owner", "owner", service.owner],
    ["Billing owner", "billing_owner", service.billing],
    ["Transferable", "transferable", service.transfer],
    ["Recovery procedure", "recovery_procedure", service.recovery]
  ].map(([label, field, sampleValue]) => {
    const value = custodyValue(field, sampleValue);
    return `<div class="custody-row"><span>${label}</span><strong class="${value === "Not recorded" || value === "No manifest record" ? "is-missing" : ""}">${escapeHtml(value)}</strong></div>`;
  }).join("");
  const guidance = activeReport && service.ignored
    ? `<div class="next-step is-recorded"><span class="next-step-mark">i</span><div><strong>Evidence acknowledged</strong><p>A reasoned ignore rule is present in the report.</p></div></div>`
    : activeReport && service.informational
      ? `<div class="next-step is-recorded"><span class="next-step-mark">i</span><div><strong>Informational signal</strong><p>Weak evidence does not block the gate by itself.</p></div></div>`
      : service.status === "documented"
    ? `<div class="next-step is-recorded"><span class="next-step-mark">✓</span><div><strong>Recorded in the manifest</strong><p>Review the owner and recovery reference periodically as the service changes.</p></div></div>`
    : service.status === "attention" && service.manifestClass === "is-incomplete"
      ? `<div class="next-step is-incomplete"><span class="next-step-mark">!</span><div><strong>Complete the custody record</strong><p>Add the missing owner, billing, transfer, or recovery details to the service entry.</p></div></div>`
      : `<div class="next-step is-missing"><span class="next-step-mark">+</span><div><strong>Add a manifest entry</strong><p>Confirm this dependency with the team, then record its owner and recovery path.</p></div></div>`;

  detailPanel.innerHTML = `
    <div class="detail-kicker"><span>SELECTED SERVICE</span><span><i></i>${activeReport ? "LOCAL REPORT" : "ILLUSTRATIVE"}</span></div>
    <div class="detail-title-row">
      <span class="provider-mark ${service.markClass}" aria-hidden="true">${escapeHtml(service.mark)}</span>
      <div><h3>${escapeHtml(service.name)}</h3><p>${escapeHtml(service.purpose)}</p></div>
    </div>
    <p class="detail-copy">${escapeHtml(service.description)}</p>
    <div class="detail-section">
      <div class="section-label"><svg class="evidence-mark" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 3h8l6 6-8 8-6-6V3Z" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>DETECTION EVIDENCE</div>
      <ul class="evidence-list">${evidence}</ul>
      <p class="confidence-note">${escapeHtml(service.confidence)} signal · ${escapeHtml(service.signal)}</p>
    </div>
    <div class="detail-section">
      <div class="section-label">CUSTODY RECORD</div>
      <div class="custody-list">${custodyRows}</div>
    </div>
    <div class="detail-section">${guidance}</div>
    ${activeReport
      ? `<div class="detail-actions"><span class="yaml-label">CUSTODY VALUES OMITTED FROM JSON REPORT</span></div>`
      : `<div class="detail-actions">
          <button class="copy-entry" type="button" data-copy-service="${escapeHtml(service.id)}">
            <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="6" width="9" height="11" rx="1"/><path d="M13 6V3H4v11h3"/></svg>
            ${service.status === "documented" ? "Copy manifest entry" : "Copy starter entry"}
          </button>
          <span class="yaml-label">${service.status === "documented" ? "YAML · EXAMPLE ENTRY" : "YAML · FILL IN CUSTODY"}</span>
        </div>
        <pre class="yaml-preview"><code>${escapeHtml(service.starter)}</code></pre>`}
  `;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function updateReportSummary(report) {
  const gateSummary = document.querySelector(".gate-summary");
  const gateTitle = document.querySelector("#gate-title");
  const signalCount = document.querySelector("#signal-count");
  const attentionCount = document.querySelector("#attention-count");
  const documentedCount = document.querySelector("#documented-count");
  const undocumentedCount = document.querySelector("#undocumented-count");
  const custodyGapCount = document.querySelector("#custody-gap-count");

  gateSummary.classList.remove("is-pass", "is-fail", "is-error");
  if (!report) {
    gateSummary.classList.add("is-fail");
    document.querySelector("#gate-label").textContent = "EXAMPLE GATE RESULT";
    gateTitle.textContent = "Action needed";
    signalCount.textContent = "4";
    attentionCount.textContent = "3";
    documentedCount.textContent = "1";
    undocumentedCount.textContent = "2 undocumented";
    custodyGapCount.textContent = "1 custody gap";
    document.querySelector("#summary-metrics").setAttribute("aria-label", "Illustrative result counts");
    document.querySelector("#result-context").textContent = "Signals found in this illustrative run";
    document.querySelector("#result-source").textContent = "SAMPLE RESULTS";
    document.querySelector("#data-mode-label").textContent = "ILLUSTRATIVE DATA";
    previewMessage.textContent = "Preview only. This sample is illustrative. Open an Ops Drift Gate JSON report to review a real scan locally; the file stays in this browser.";
    document.querySelector(".nav-count").textContent = "3";
    return;
  }

  const state = report.status;
  gateSummary.classList.add(`is-${state}`);
  document.querySelector("#gate-label").textContent = "LOCAL SCAN RESULT";
  gateTitle.textContent = state === "pass" ? "Pass" : state === "fail" ? "Action needed" : "Incomplete scan";
  signalCount.textContent = String(activeServices.length);
  attentionCount.textContent = String(activeServices.filter(service => service.status === "attention").length);
  documentedCount.textContent = String(activeServices.filter(service => service.status === "documented").length);
  undocumentedCount.textContent = `${report.summary.undocumented} undocumented${report.blocking.some(item => item.type === "undocumented") || !report.summary.undocumented ? "" : " · non-blocking"}`;
  custodyGapCount.textContent = report.manifest.requireCustody
    ? `${report.summary.custodyGaps} custody ${report.summary.custodyGaps === 1 ? "gap" : "gaps"}`
    : "custody gate off";
  document.querySelector("#summary-metrics").setAttribute("aria-label", "Local scan result counts");
  document.querySelector("#result-context").textContent = `Ops Drift Gate v${report.version} · ${report.complete ? "complete scan" : "incomplete scan"}`;
  document.querySelector("#result-source").textContent = "LOCAL SCAN REPORT";
  document.querySelector("#data-mode-label").textContent = "LOCAL SCAN REPORT";
  previewMessage.textContent = "Local report loaded. The JSON file stays in this browser; it is not uploaded.";
  document.querySelector(".nav-count").textContent = String(activeServices.filter(service => service.status === "attention").length);
}

function markdownText(value) {
  return String(value)
    .replace(/\r?\n/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_{}\[\]()#+.!|]/g, "\\$&");
}

function handoffBrief(report) {
  const status = report.status.toUpperCase();
  const lines = [
    "# Ops Drift Gate — Operational Handoff Brief",
    "",
    `**Gate status:** ${status}`,
    `**Scan completeness:** ${report.complete ? "Complete" : "Incomplete"}`,
    `**Scanner version:** ${markdownText(report.version)}`,
    `**Files scanned:** ${report.summary.scannedFiles}`,
    `**Manifest:** ${report.manifest.exists ? `Version ${report.manifest.version ?? "unknown"}` : "Not found"}`,
    "",
    "> This brief summarizes known repository signals. It is not an exhaustive inventory; confirm production use, ownership, billing, transfer access, and recovery with the responsible people.",
    "",
    "## Service review",
    ""
  ];

  if (!activeServices.length) lines.push("No provider findings were included in this report.", "");
  for (const service of activeServices) {
    lines.push(`### ${markdownText(service.name)} — ${markdownText(service.manifest)}`);
    lines.push(`- Evidence confidence: ${markdownText(service.confidence)}`);
    lines.push(`- Manifest instances: ${service.instances.length ? service.instances.map(instance => markdownText(instance.id)).join(", ") : "None recorded"}`);
    if (service.evidence.length) lines.push(`- Evidence paths: ${service.evidence.map(markdownText).join(", ")}`);
    if (service.missingCustody.length) {
      const labels = service.missingCustody.map(field => ({
        owner: "owner",
        billing_owner: "billing owner",
        transferable: "transferability",
        recovery_procedure: "recovery procedure"
      })[field]);
      lines.push(`- Missing custody fields: ${labels.map(markdownText).join(", ")}`);
    } else if (service.instances.length) {
      lines.push("- Required custody fields are recorded; values are not included in the scanner report.");
    }
    if (service.ignored) lines.push("- Follow-up: review the manifest ignore rationale with the service owner.");
    else if (service.informational) lines.push("- Follow-up: corroborate this weak signal before treating it as a dependency.");
    else if (service.status === "attention") lines.push("- Follow-up: confirm the service instance and assign an owner for unresolved custody fields.");
    lines.push("");
  }

  if (report.manifestOnly.length) {
    lines.push("## Manifest-only inventory", "");
    for (const entry of report.manifestOnly) {
      const missing = entry.missingCustody?.length
        ? `; missing ${entry.missingCustody.map(markdownText).join(", ")}`
        : "";
      lines.push(`- ${markdownText(entry.id)} (${markdownText(entry.provider)}): not detected in this scan${missing}`);
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
    "_Generated locally from an Ops Drift Gate JSON report. Custody values are intentionally excluded._",
    ""
  );
  return lines.join("\n");
}

async function readReportFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
}

function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll(".summary-filter").forEach((button) => {
    const selected = button.dataset.filter === filter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderList();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3300);
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
  } catch {
    showToast("Clipboard access is unavailable here. The YAML remains visible to copy manually.");
  }
}

document.querySelector(".nav-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  const showOverview = button.dataset.view === "overview";
  overviewView.hidden = !showOverview;
  manifestView.hidden = showOverview;
  overviewView.classList.toggle("is-visible", showOverview);
  manifestView.classList.toggle("is-visible", !showOverview);
  document.querySelectorAll(".nav-button").forEach((navButton) => {
    const active = navButton === button;
    navButton.classList.toggle("is-current", active);
    if (active) navButton.setAttribute("aria-current", "page");
    else navButton.removeAttribute("aria-current");
  });
});

document.querySelector(".summary-metrics").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (button) setFilter(button.dataset.filter);
});

findingList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-service]");
  if (!row) return;
  pulseSignal(row);
  selectedId = row.dataset.service;
  findingList.querySelectorAll("[data-service]").forEach((item) => {
    const selected = item.dataset.service === selectedId;
    item.classList.toggle("is-selected", selected);
    item.setAttribute("aria-pressed", String(selected));
  });
  renderDetails(activeServices.find((service) => service.id === selectedId));
});

findingList.addEventListener("pointermove", (event) => {
  if (!document.documentElement.classList.contains("signal-effects") || event.pointerType === "touch") return;
  const row = event.target.closest("[data-service]");
  if (!row) return;
  const bounds = row.getBoundingClientRect();
  row.style.setProperty("--signal-x", `${event.clientX - bounds.left}px`);
  row.style.setProperty("--signal-y", `${event.clientY - bounds.top}px`);
});

detailPanel.addEventListener("pointermove", (event) => {
  if (!document.documentElement.classList.contains("signal-effects") || event.pointerType === "touch") return;
  const bounds = detailPanel.getBoundingClientRect();
  detailPanel.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
  detailPanel.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
});

detailPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy-service]");
  if (!button) return;
  const service = activeServices.find((item) => item.id === button.dataset.copyService);
  copyText(service.starter, `Starter entry for ${service.name} copied.`);
});

searchInput.addEventListener("input", renderList);
document.querySelector(".notice-dismiss").addEventListener("click", (event) => {
  event.currentTarget.closest(".preview-notice").remove();
});

document.querySelector("#reset-sample").addEventListener("click", () => {
  activeReport = null;
  activeServices = services;
  searchInput.value = "";
  selectedId = services[0].id;
  updateReportSummary(null);
  setFilter("all");
  renderManifest();
  showToast("Sample view reset. No repository was scanned.");
});

copyManifestButton.addEventListener("click", () => {
  const manifestServices = activeServices.filter(service => service.manifestClass !== "is-missing");
  const yaml = `version: 1\nservices:\n${manifestServices.map((service) => service.starter).join("\n\n")}`;
  copyText(yaml, "Example manifest YAML copied.");
});

exportBriefButton.addEventListener("click", () => {
  if (!activeReport) return;
  const blob = new Blob([handoffBrief(activeReport)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ops-drift-handoff-brief.md";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast("Handoff brief downloaded. It includes evidence and gaps, not custody values.");
});

reportInput.addEventListener("change", async () => {
  const file = reportInput.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("REPORT_TOO_LARGE");
    const report = parseScanReport(JSON.parse(await readReportFile(file)));
    activeReport = report;
    activeServices = report.items.map(service => {
      const sample = services.find(item => item.id === service.id);
      return {
        ...service,
        mark: sample?.mark ?? service.mark,
        markClass: sample?.markClass ?? service.markClass,
        signal: service.purpose
      };
    });
    activeFilter = "all";
    searchInput.value = "";
    selectedId = activeServices[0]?.id ?? "";
    updateReportSummary(report);
    renderManifest();
    document.querySelectorAll(".summary-filter").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.filter === "all")));
    renderList();
    showToast(`Loaded ${activeServices.length} finding(s) from a local scan report.`);
  } catch {
    showToast("Could not load that file. Choose an Ops Drift Gate schema v1 JSON report (maximum 5 MB).");
  } finally {
    reportInput.value = "";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.activeElement === searchInput && searchInput.value) {
    event.preventDefault();
    searchInput.value = "";
    renderList();
    return;
  }
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) return;
  event.preventDefault();
  searchInput.focus();
});

document.querySelector("#empty-findings").addEventListener("click", (event) => {
  if (!event.target.closest(".empty-reset")) return;
  searchInput.value = "";
  setFilter("all");
});

visualMode.addEventListener("change", applyVisualMode);
const refreshVisualMode = () => applyVisualMode();
watchMediaQuery(finePointer, refreshVisualMode);
watchMediaQuery(reducedMotion, refreshVisualMode);

applyVisualMode();
renderManifest();
document.querySelectorAll(".summary-filter").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === activeFilter)));
renderList();
