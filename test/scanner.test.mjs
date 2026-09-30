import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditRepository, scanRepository, parseSimpleYaml, validateManifest } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => path.join(here, "fixtures", name);
function tempCopy(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ops-drift-"));
  fs.cpSync(fixture(name), dir, { recursive: true });
  return dir;
}

test("detects external services with evidence and never reads .env values", () => {
  const dir = tempCopy("undocumented");
  fs.writeFileSync(path.join(dir, ".env"), "STRIPE_SECRET_KEY=THIS_VALUE_MUST_NEVER_APPEAR\n");
  try {
    const result = scanRepository(dir);
    const ids = result.services.map(service => service.id);
    for (const id of ["stripe","resend","github-actions","scheduled-jobs","openai","aws","sentry","supabase"]) assert.ok(ids.includes(id));
    assert.ok(result.skippedSensitiveFiles.includes(".env"));
    assert.equal(result.root, ".");
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("THIS_VALUE_MUST_NEVER_APPEAR"), false);
    assert.equal(serialized.includes(dir), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("only exact environment template names are exempt from sensitive-file handling", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ops-drift-env-template-"));
  const templates = [".env.example", ".env.sample", ".env.template", "nested/.env.example"];
  const sensitive = [
    ".env", ".env.local", ".env.production", ".env.development.local",
    ".env.production.example.json", ".env.staging.sample.json", ".env.notexample.json",
    "nested/.env", "nested/.env.production", "nested/.env.development.local",
    "nested/credentials.json", "nested/secrets/key.pem"
  ];
  try {
    for (const name of [...templates, ...sensitive]) {
      const file = path.join(dir, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "OPENAI_API_KEY=TEST_ONLY_FAKE_VALUE\n");
    }
    const result = scanRepository(dir);
    assert.deepEqual(result.skippedSensitiveFiles, sensitive.sort());
    assert.equal(result.scannedFiles, templates.length);
    assert.equal(result.envVars.some(item => sensitive.includes(item.path)), false);
    assert.equal(JSON.stringify(result).includes("TEST_ONLY_FAKE_VALUE"), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("rejects prototype-shaped keys in YAML and JSON manifests", () => {
  const maliciousYaml = [
    "__proto__:\n  polluted: true",
    "version: 1\nservices:\n  constructor:\n    provider: stripe",
    "version: 1\nservices:\n  stripe-production:\n    provider: stripe\n    custody:\n      prototype: value"
  ];
  for (const text of maliciousYaml) assert.throws(() => parseSimpleYaml(text), /reserved key/);

  const rawJson = JSON.parse('{"version":1,"services":{"__proto__":{"provider":"stripe"}}}');
  assert.throws(() => validateManifest(rawJson), /reserved key/);

  const inherited = Object.create({ version: 1, services: {} });
  assert.throws(() => validateManifest(inherited), /version must be 1/);
});

test("supports named instances for the same provider", () => {
  const manifest = validateManifest(parseSimpleYaml(`version: 1\nservices:\n  stripe-production:\n    provider: stripe\n    required_for_production: true\n  stripe-test:\n    provider: stripe\n    required_for_production: false\n`));
  assert.equal(manifest.services["stripe-production"].provider, "stripe");
  assert.equal(manifest.services["stripe-test"].provider, "stripe");
});

test("complete custody passes strict mode", () => {
  const result = auditRepository(fixture("clean"), undefined, { requireCustody: true });
  assert.deepEqual(result.undocumented, []);
  assert.deepEqual(result.unknownCustody, []);
  assert.equal(result.items[0].instances[0].id, "stripe-production");
});

test("strict custody reports missing production custody fields", () => {
  const dir = tempCopy("clean");
  fs.writeFileSync(path.join(dir, "ops.yaml"), `version: 1\nservices:\n  stripe-production:\n    provider: stripe\n    required_for_production: true\n    custody:\n      owner: Test Owner\n      billing_owner: null\n      transferable: unknown\n      recovery_procedure: null\n`);
  try {
    const result = auditRepository(dir, undefined, { requireCustody: true });
    assert.equal(result.unknownCustody.length, 1);
    assert.deepEqual(result.unknownCustody[0].missing, ["billing_owner", "transferable", "recovery_procedure"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("weak content-only signals are informational and do not block", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ops-drift-weak-"));
  fs.writeFileSync(path.join(dir, "app.js"), `fetch("https://api.resend.com/emails")`);
  try {
    const result = auditRepository(dir);
    const resend = result.items.find(item => item.finding.id === "resend");
    assert.equal(resend.finding.confidence, "weak");
    assert.equal(resend.informationalOnly, true);
    assert.equal(result.undocumented.includes("resend"), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Action report reflects fail_on_undocumented=false", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ops-drift-action-policy-"));
  const summary = path.join(dir, "summary.md");
  const output = path.join(dir, "output.txt");
  fs.writeFileSync(path.join(dir, "package.json"), '{"dependencies":{"resend":"^6.0.0"}}');
  try {
    const result = spawnSync(process.execPath, [path.join(here, "..", "src", "action.js")], {
      encoding: "utf8",
      env: {
        ...process.env,
        INPUT_PATH: dir,
        GITHUB_WORKSPACE: dir,
        INPUT_FAIL_ON_UNDOCUMENTED: "false",
        INPUT_REQUIRE_CUSTODY: "false",
        GITHUB_STEP_SUMMARY: summary,
        GITHUB_OUTPUT: output
      }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /undocumented; gate disabled/);
    assert.match(result.stdout, /Gate status: PASS/);
    assert.match(fs.readFileSync(summary, "utf8"), /Gate status: PASS/);
    assert.match(fs.readFileSync(output, "utf8"), /status=pass/);
    assert.match(fs.readFileSync(output, "utf8"), /undocumented_count=1/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("reasoned ignores suppress a blocking provider", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ops-drift-ignore-"));
  fs.writeFileSync(path.join(dir, "package.json"), `{"dependencies":{"resend":"^6.0.0"}}`);
  fs.writeFileSync(path.join(dir, "ops.yaml"), `version: 1\nservices:\nignores:\n  resend:\n    provider: resend\n    scope: all\n    reason: test fixture only\n`);
  try {
    const result = auditRepository(dir);
    assert.equal(result.undocumented.includes("resend"), false);
    assert.equal(result.items.find(item => item.finding.id === "resend").ignored, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
