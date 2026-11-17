import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditRepository } from "../src/audit.js";
import { machineReport } from "../src/report.js";
import { parseScanReport } from "../web/report.js";

const report = overrides => ({
  schema_version: 1,
  tool: { name: "ops-drift-gate", version: "0.1.2" },
  status: "fail",
  complete: true,
  manifest: { path: "ops.yaml", version: 1, require_custody: true },
  summary: { scanned_files: 12, undocumented_count: 1, unknown_custody_count: 1 },
  findings: [
    {
      id: "stripe",
      name: "Stripe",
      category: "payments",
      confidence: "strong",
      evidence: [{ path: "src/billing.js" }],
      documented: true,
      ignored: false,
      informational_only: false,
      instances: [{ id: "stripe-production", missing_custody: ["billing_owner", "transferable"] }]
    },
    {
      id: "resend",
      name: "Resend",
      category: "email",
      confidence: "weak",
      evidence: [{ path: "src/mail.js" }],
      documented: false,
      ignored: false,
      informational_only: true,
      instances: []
    }
  ],
  manifest_only: [{ id: "legacy-storage", provider: "aws" }],
  blocking: [{ type: "undocumented", provider: "resend" }, { type: "custody", id: "stripe-production", provider: "stripe", missing: ["billing_owner"] }],
  ...overrides
});

test("maps versioned scanner reports into safe review states", () => {
  const parsed = parseScanReport(report());
  assert.equal(parsed.status, "fail");
  assert.equal(parsed.items[0].status, "attention");
  assert.equal(parsed.items[0].manifest, "Custody incomplete");
  assert.deepEqual(parsed.items[0].missingCustody, ["billing_owner", "transferable"]);
  assert.equal(parsed.items[1].status, "informational");
  assert.equal(parsed.manifestOnly[0].id, "legacy-storage");
  assert.equal(parsed.manifestOnly[0].missingCustody, null);
  assert.equal(JSON.stringify(parsed).includes("Test Owner"), false);
});

test("rejects unsupported, malformed, and unsafe report shapes", () => {
  assert.throws(() => parseScanReport(report({ schema_version: 2 })), /UNSUPPORTED_REPORT/);
  assert.throws(() => parseScanReport(report({ findings: [{ ...report().findings[0], id: "<img>" }] })), /INVALID_FINDING/);
  assert.throws(() => parseScanReport(report({
    findings: [{ ...report().findings[0], instances: [{ id: "stripe-production", missing_custody: ["constructor"] }] }]
  })), /INVALID_CUSTODY_FIELD/);
});

test("accepts machine output from a real local repository scan", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opsgate-report-integration-"));
  try {
    fs.writeFileSync(path.join(root, "package.json"), '{"dependencies":{"stripe":"*","resend":"*"}}');
    fs.writeFileSync(path.join(root, "ops.yaml"), [
      "version: 1",
      "services:",
      "  stripe-production:",
      "    provider: stripe",
      "    required_for_production: true",
      "    custody:",
      "      owner: Payments",
      "      billing_owner: Finance",
      "      transferable: true",
      "      recovery_procedure: Protected runbook",
      ""
    ].join("\n"));
    const report = parseScanReport(machineReport(auditRepository(root, undefined, { requireCustody: true })));
    assert.equal(report.status, "fail");
    assert.equal(report.items.length, 2);
    assert.equal(report.items.find(item => item.id === "stripe").status, "documented");
    assert.equal(report.items.find(item => item.id === "resend").manifest, "Not documented");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
