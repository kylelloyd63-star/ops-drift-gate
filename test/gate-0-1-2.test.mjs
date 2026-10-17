import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditRepository, initRepository, machineReport, parseSimpleYaml, renderStarterManifest, validateManifest } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");
const cli = path.join(repo, "src", "cli.js");
const action = path.join(repo, "src", "action.js");
const fixture = name => path.join(here, "fixtures", name);
const packageVersion = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")).version;

function temp(prefix = "ops-drift-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function write(root, name, data) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}
function ids(result) {
  return result.items.map(item => item.finding.id);
}
function provider(result, id) {
  return result.items.find(item => item.finding.id === id);
}

test("starter manifest parses and leaves custody empty", () => {
  const text = renderStarterManifest(["github-actions", "npm"]);
  const manifest = validateManifest(parseSimpleYaml(text));
  assert.equal(manifest.services["github-actions"].provider, "github-actions");
  assert.equal(manifest.services.npm.custody.owner, null);
  assert.equal(manifest.services.npm.custody.transferable, "unknown");
  assert.equal(manifest.checks.hygiene, false);
  assert.equal(manifest.scan.include_tests, false);
  assert.equal(validateManifest(parseSimpleYaml(renderStarterManifest([]))).services && true, true);
});

test("default scan skips test directories, fixture directories, and *.test.* files", () => {
  const root = temp();
  try {
    write(root, "src/app.js", "console.log('ok');\n");
    write(root, "src/billing.js", "process.env.STRIPE_SECRET_KEY;\n");
    write(root, "test/fixtures/package.json", '{"dependencies":{"stripe":"*"}}');
    write(root, "tests/app.js", "process.env.OPENAI_API_KEY;\n");
    write(root, "__tests__/app.js", "process.env.RESEND_API_KEY;\n");
    write(root, "fixtures/requirements.txt", "boto3==1.0.0\n");
    write(root, "src/app.test.js", "process.env.SENTRY_DSN;\n");
    write(root, "test-utils/package.json", '{"dependencies":{"resend":"*"}}');
    const skipped = auditRepository(root);
    assert.equal(skipped.status, "fail");
    assert.deepEqual(ids(skipped), ["resend", "stripe"]);
    assert.equal(provider(skipped, "stripe").finding.evidence.some(item => item.path === "src/billing.js"), true);
    assert.equal(provider(skipped, "stripe").finding.evidence.some(item => item.path.startsWith("test/")), false);
    assert.ok(skipped.scan.excludedTestPaths >= 4);
    if (process.platform !== "win32") {
      write(root, "Test/probe.js", "process.env.TWILIO_ACCOUNT_SID;\n");
      assert.ok(ids(auditRepository(root)).includes("twilio"));
    }
    const included = auditRepository(root, undefined, { includeTests: true });
    for (const id of ["stripe", "openai", "resend", "aws", "sentry"]) assert.ok(ids(included).includes(id), id);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("manifest scan.include_tests overrides the default exclusion", () => {
  const root = temp();
  try {
    write(root, "fixtures/package.json", '{"dependencies":{"stripe":"*"}}');
    write(root, "ops.yaml", "version: 1\nservices:\nscan:\n  include_tests: true\n");
    const result = auditRepository(root);
    assert.deepEqual(result.undocumented, ["stripe"]);
    assert.throws(() => validateManifest(parseSimpleYaml("version: 1\nservices:\nscan:\n  include_tests: yes\n")), /INVALID_SCAN_OPTION/);
    assert.throws(() => validateManifest(parseSimpleYaml("version: 1\nservices:\nchecks:\n  hygiene: yes\n")), /INVALID_CHECK_OPTION/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("form backends, hosting, custom domains, and npm publishing are detected", () => {
  const root = temp();
  try {
    write(root, "index.html", '<form action="https://formsubmit.co/example"></form>\n<form data-netlify="true"></form>\n<script src="https://formspree.io/js/form.js"></script>\n');
    write(root, "note.js", 'const host = "https://formsubmit.co/example";\n');
    write(root, "CNAME", "example.com\n");
    write(root, "cname.txt", "example.com\n");
    write(root, "netlify.toml", '[build]\ncommand = "echo ok"\n');
    write(root, "wrangler.toml", 'name = "pages"\npages_build_output_dir = "dist"\n');
    write(root, ".github/workflows/pages.yml", "name: pages\non: push\njobs:\n  d:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/deploy-pages@v4\n");
    write(root, ".github/workflows/publish.yml", "name: publish\non: workflow_dispatch\njobs:\n  p:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm stage publish\n");
    write(root, "package.json", '{"name":"example","publishConfig":{"access":"public"}}\n');
    const result = auditRepository(root);
    assert.equal(result.complete, true, JSON.stringify(result.scan.warnings));
    const formsubmit = provider(result, "formsubmit");
    assert.equal(formsubmit.finding.confidence, "strong");
    assert.equal(formsubmit.finding.evidence.some(item => item.kind === "endpoint" && item.path === "index.html"), true);
    assert.equal(formsubmit.finding.evidence.some(item => item.kind === "content" && item.path === "note.js"), true);
    assert.equal(provider(result, "netlify-forms").finding.confidence, "strong");
    assert.equal(provider(result, "formspree").finding.confidence, "strong");
    assert.equal(provider(result, "custom-domain").finding.confidence, "strong");
    assert.equal(provider(result, "custom-domain").finding.evidence.some(item => item.path === "cname.txt"), false);
    assert.equal(provider(result, "netlify").finding.confidence, "strong");
    assert.equal(provider(result, "cloudflare").finding.confidence, "strong");
    assert.equal(provider(result, "cloudflare-pages").finding.confidence, "strong");
    assert.equal(provider(result, "github-pages").finding.confidence, "strong");
    assert.equal(provider(result, "npm").finding.confidence, "strong");
    assert.ok(result.undocumented.includes("formsubmit"));
    assert.match(machineReport(result).hint, /ops-drift init/);
    assert.match(machineReport(result).hint, /FormSubmit/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("one form or hosting mention stays weak, and ordinary npm scripts are not publishing", () => {
  const root = temp();
  try {
    write(root, "app.js", 'fetch("https://formsubmit.co/example");\nfetch("https://example.pages.dev");\n');
    write(root, "other.js", 'fetch("https://formsubmit.com");\nfetch("https://myformsubmit.co");\n');
    write(root, ".github/workflows/ci.yml", "name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n      - run: npm test\n      - uses: actions/checkout@v4\n");
    const result = auditRepository(root);
    assert.equal(provider(result, "formsubmit").informationalOnly, true);
    assert.equal(provider(result, "cloudflare-pages").informationalOnly, true);
    assert.equal(result.undocumented.includes("formsubmit"), false);
    assert.equal(result.undocumented.includes("cloudflare-pages"), false);
    assert.equal(provider(result, "npm"), undefined);
    assert.equal(provider(result, "github-pages"), undefined);
    assert.ok(ids(result).includes("github-actions"));
    write(root, "a.js", 'fetch("https://demo.pages.dev/index");\n');
    write(root, "b.js", 'fetch("https://demo.pages.dev/app");\n');
    const corroborated = auditRepository(root);
    assert.equal(provider(corroborated, "cloudflare-pages").finding.confidence, "corroborated");
    assert.ok(corroborated.undocumented.includes("cloudflare-pages"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("vercel deploy workflow and formspree package are strong", () => {
  const root = temp();
  try {
    write(root, ".github/workflows/deploy.yml", "name: d\non: push\njobs:\n  d:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx vercel deploy\n");
    write(root, "package.json", '{"dependencies":{"@formspree/react":"1.0.0"}}\n');
    const result = auditRepository(root);
    assert.equal(provider(result, "vercel").finding.confidence, "strong");
    assert.equal(provider(result, "formspree").finding.confidence, "strong");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("sample fixture repositories report the expected providers", () => {
  const site = auditRepository(fixture("business-site"));
  assert.equal(site.complete, true, JSON.stringify(site.scan.warnings));
  assert.deepEqual(ids(site), ["custom-domain", "formsubmit", "github-actions", "github-pages"]);
  assert.deepEqual(site.undocumented, ["custom-domain", "formsubmit", "github-actions", "github-pages"]);
  const registry = auditRepository(fixture("registry-publish"));
  assert.equal(registry.complete, true, JSON.stringify(registry.scan.warnings));
  assert.deepEqual(ids(registry), ["github-actions", "npm"]);
  assert.equal(provider(registry, "npm").finding.evidence.some(item => item.kind === "package"), true);
  assert.equal(provider(registry, "npm").finding.evidence.some(item => item.kind === "workflow"), true);
});

test("init writes a starter and refuses to clobber another manifest", () => {
  const root = temp();
  try {
    write(root, "package.json", '{"dependencies":{"stripe":"*"}}\n');
    write(root, "app.js", 'fetch("https://api.resend.com");\n');
    write(root, "test/package.json", '{"dependencies":{"openai":"*"}}\n');
    const written = initRepository(root);
    assert.deepEqual(written.providers, ["stripe"]);
    assert.deepEqual(written.weak, ["resend"]);
    assert.equal(written.replaced, false);
    const parsed = validateManifest(parseSimpleYaml(fs.readFileSync(path.join(root, "ops.yaml"), "utf8")));
    assert.equal(parsed.services.stripe.provider, "stripe");
    assert.equal(parsed.services.openai, undefined);
    assert.throws(() => initRepository(root), /MANIFEST_EXISTS/);
    fs.writeFileSync(path.join(root, "ops.yaml"), "version: 1\nservices:\n  stripe:\n    provider: stripe\n    custody:\n      owner: Kept Owner\n      billing_owner: Kept Owner\n      transferable: true\n      recovery_procedure: Kept\n");
    const replaced = initRepository(root, { force: true });
    assert.equal(replaced.replaced, true);
    assert.equal(fs.readFileSync(path.join(root, "ops.yaml"), "utf8").includes("Kept Owner"), false);
    fs.rmSync(path.join(root, "ops.yaml"));
    write(root, "ops.yml", "version: 1\nservices:\n");
    assert.throws(() => initRepository(root, { force: true }), /MANIFEST_EXISTS/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("init CLI json reports package version and no absolute root", () => {
  const root = temp();
  try {
    write(root, "package.json", '{"publishConfig":{"access":"public"}}\n');
    const result = spawnSync(process.execPath, [cli, "init", root, "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.tool.version, packageVersion);
    assert.deepEqual(body.providers, ["npm"]);
    assert.equal(result.stdout.includes(root), false);
    const again = spawnSync(process.execPath, [cli, "init", root], { encoding: "utf8" });
    assert.equal(again.status, 1);
    assert.match(again.stderr, /MANIFEST_EXISTS/);
    const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
    assert.match(help.stdout, /ops-drift init/);
    const forced = spawnSync(process.execPath, [cli, "--force"], { encoding: "utf8" });
    assert.equal(forced.status, 1);
    assert.match(forced.stderr, /SCAN_OR_CONFIGURATION_ERROR/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("documented manifest hint differs from the missing-manifest hint", () => {
  const root = temp();
  try {
    write(root, "package.json", '{"dependencies":{"stripe":"*"}}\n');
    const missing = auditRepository(root);
    assert.match(machineReport(missing).hint, /No custody manifest found/);
    write(root, "ops.yaml", "version: 1\nservices:\n");
    const present = auditRepository(root);
    assert.match(machineReport(present).hint, /Add them to the custody manifest/);
    assert.equal(machineReport(present).hint.includes("No custody manifest found"), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("hygiene is off by default and reports rules without matched secrets, emails, or paths", () => {
  const root = temp();
  const secret = "AKIA" + "ZZZZZZZZZZZZZZZZ";
  const local = "zzsecretlocal";
  const user = "zzsecretuser";
  const email = local + "@" + "gmail.com";
  const studio = "hello@" + "dripstaticstudios.com";
  const home = "/" + "home/" + user + "/project";
  const windows = "C:" + "\\Users\\" + user + "\\project";
  const mac = "/" + "Users/" + user + "/project";
  const forward = "C:" + "/Users/" + user + "/project";
  try {
    write(root, "app.js", `const key = "${secret}";\nconst mail = "${email}";\nconst studio = "${studio}";\nconst a = "${home}";\nconst b = "${windows}";\nconst c = "${mac}";\nconst d = "${forward}";\nconst fine = "person@example.com";\n`);
    write(root, ".env", secret + "\n");
    const off = auditRepository(root);
    assert.equal(off.hygiene.enabled, false);
    assert.deepEqual(off.hygiene.findings, []);
    assert.equal(off.status, "pass");
    assert.equal(JSON.stringify(machineReport(off)).includes(secret), false);
    const on = auditRepository(root, undefined, { hygiene: true });
    assert.equal(on.status, "fail");
    const rules = on.hygiene.findings.map(item => `${item.kind}:${item.rule}`);
    for (const rule of ["secret:aws-access-key-id", "personal-email:gmail.com", "local-path:unix-home", "local-path:windows-drive", "local-path:macos-users", "local-path:windows-drive-forward", "sensitive-file:sensitive-path"]) {
      assert.ok(rules.includes(rule), rules.join(","));
    }
    assert.equal(rules.includes("personal-email:dripstaticstudios.com"), false);
    const serialized = JSON.stringify(machineReport(on));
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes(local), false);
    assert.equal(serialized.includes(user), false);
    assert.equal(serialized.includes(email), false);
    const cliRun = spawnSync(process.execPath, [cli, root, "--hygiene", "--ci", "--json"], { encoding: "utf8" });
    assert.equal(cliRun.status, 2, cliRun.stdout);
    assert.equal(cliRun.stdout.includes(secret), false);
    let reads = 0;
    const envFile = path.join(root, ".env");
    const original = fs.openSync;
    fs.openSync = function (file, ...args) {
      if (String(file) === envFile) reads++;
      return original.call(this, file, ...args);
    };
    try {
      const reread = auditRepository(root, undefined, { hygiene: true });
      assert.equal(reread.hygiene.findings.some(item => item.kind === "sensitive-file"), true);
      assert.equal(reads, 0);
    } finally { fs.openSync = original; }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("manifest hygiene can be forced off", () => {
  const root = temp();
  const email = "zzsecretlocal@" + "gmail.com";
  try {
    write(root, "app.js", `const mail = "${email}";\n`);
    write(root, "ops.yaml", "version: 1\nservices:\nchecks:\n  hygiene: true\n");
    assert.equal(auditRepository(root).status, "fail");
    assert.equal(auditRepository(root, undefined, { hygiene: false }).status, "pass");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("action hygiene and include_tests inputs override the manifest", () => {
  const root = temp();
  const summary = path.join(root, "summary.md");
  const output = path.join(root, "output.txt");
  const email = "zzsecretlocal@" + "gmail.com";
  try {
    write(root, "app.js", "console.log('ok');\n");
    write(root, "test/package.json", '{"dependencies":{"resend":"*"}}\n');
    write(root, "ops.yaml", "version: 1\nservices:\nscan:\n  include_tests: true\nchecks:\n  hygiene: true\n");
    const baseEnv = { ...process.env, GITHUB_WORKSPACE: root, INPUT_PATH: ".", INPUT_MANIFEST: "", INPUT_FAIL_ON_UNDOCUMENTED: "true", INPUT_REQUIRE_CUSTODY: "false", GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output };
    const forcedOff = spawnSync(process.execPath, [action], { encoding: "utf8", env: { ...baseEnv, INPUT_HYGIENE: "false", INPUT_INCLUDE_TESTS: "false" } });
    assert.equal(forcedOff.status, 0, forcedOff.stderr);
    assert.match(forcedOff.stdout, /Gate status: PASS/);
    write(root, "app.js", `const mail = "${email}";\n`);
    const forcedOn = spawnSync(process.execPath, [action], { encoding: "utf8", env: { ...baseEnv, INPUT_HYGIENE: "true", INPUT_INCLUDE_TESTS: "false" } });
    assert.equal(forcedOn.status, 2, forcedOn.stdout);
    assert.equal(forcedOn.stdout.includes(email), false);
    assert.match(forcedOn.stdout, /personal-email gmail.com/);
    const invalid = spawnSync(process.execPath, [action], { encoding: "utf8", env: { ...baseEnv, INPUT_HYGIENE: "yes" } });
    assert.equal(invalid.status, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("this repository passes its own custody gate and hygiene check", () => {
  const result = auditRepository(repo, undefined, { requireCustody: true });
  assert.equal(result.complete, true, JSON.stringify(result.scan.warnings));
  assert.equal(result.status, "pass");
  assert.deepEqual(result.undocumented, []);
  assert.deepEqual(result.unknownCustody, []);
  assert.deepEqual(result.blocking, []);
  assert.deepEqual(ids(result), ["github-actions", "npm"]);
  assert.ok(result.scan.excludedTestPaths >= 1);
  const hygiene = auditRepository(repo, undefined, { hygiene: true, requireCustody: true });
  assert.equal(hygiene.complete, true, JSON.stringify(hygiene.scan.warnings));
  assert.deepEqual(hygiene.hygiene.findings, []);
  assert.equal(hygiene.status, "pass");
});

test("package metadata names the studio and source files have no personal gmail address", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
  assert.equal(manifest.author, "Dripstatic Studios <hello@dripstaticstudios.com>");
  assert.equal(manifest.version, "0.1.2");
  const pending = [repo];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) {
        const text = fs.readFileSync(full, "utf8");
        assert.equal(text.includes("@" + "gmail.com"), false, full);
        assert.equal(text.includes("kylelloyd63@" + "gmail.com"), false, full);
      }
    }
  }
});
