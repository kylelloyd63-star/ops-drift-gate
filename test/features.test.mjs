import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditRepository, formatReport, machineReport, parseManifestJson, parseSimpleYaml, scanRepository, validateManifest, writeStarterManifest } from "../src/index.js";

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repo, "src", "cli.js");
const dot = parts => parts.join(".");
const host = parts => "https://" + dot(parts);

function temp(run) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "ops-features-")));
  const write = (name, data) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    return file;
  };
  try { return run(root, write); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function provider(result, id) {
  return (result.services ?? result.items.map(item => item.finding)).find(item => item.id === id);
}

test("test and fixture paths are skipped unless inclusion is requested", () => temp((root, write) => {
  write("tests/package.json", '{"dependencies":{"stripe":"*"}}');
  write("test/app.js", "process.env.STRIPE_SECRET_KEY\n");
  write("__tests__/app.js", "process.env.OPENAI_API_KEY\n");
  write("fixtures/package.json", '{"dependencies":{"resend":"*"}}');
  write("src/fixtures/package.json", '{"dependencies":{"@sentry/node":"*"}}');
  write("src/app.test.js", "process.env.OPENAI_API_KEY\n");
  write("src/app.spec.ts", `fetch(${JSON.stringify(host(["api.resend", "com"]))})\n`);
  write("fixtures-sibling/package.json", '{"dependencies":{"twilio":"*"}}');
  write("src/app.js", "console.log('ok');\n");
  const skipped = scanRepository(root);
  assert.deepEqual(skipped.services.map(item => item.id), ["twilio"]);
  const included = scanRepository(root, { includeTests: true });
  for (const id of ["openai", "resend", "sentry", "stripe", "twilio"]) assert.ok(included.services.some(item => item.id === id), id);
}));

test("manifest scan.include_tests overrides the default skip", () => temp((root, write) => {
  write("fixtures/package.json", '{"dependencies":{"resend":"*"}}');
  write("ops.yaml", "version: 1\nscan:\n  include_tests: true\nservices:\n");
  const result = auditRepository(root);
  assert.equal(result.includeTests, true);
  assert.deepEqual(result.undocumented, ["resend"]);
  assert.throws(() => validateManifest(parseSimpleYaml("version: 1\nservices:\nscan:\n  include_tests: yes\n")), /INVALID_SCAN_OPTION/);
  assert.throws(() => validateManifest(parseSimpleYaml("version: 1\nservices:\nscan:\n  extra: true\n")), /UNKNOWN_MANIFEST_FIELD/);
  assert.equal(validateManifest(parseManifestJson('{"version":1,"services":{},"scan":{"include_tests":false}}')).scan.include_tests, false);
}));

test("init writes a starter manifest and will not overwrite one", () => temp((root, write) => {
  write("package.json", '{"dependencies":{"stripe":"*"}}');
  write("app.js", `fetch(${JSON.stringify(host(["api.resend", "com"]))})\n`);
  const written = writeStarterManifest(root);
  assert.deepEqual(written.providers, ["stripe"]);
  assert.deepEqual(written.weak, ["resend"]);
  const text = fs.readFileSync(path.join(root, "ops.yaml"), "utf8");
  assert.match(text, /Informational signals were not added: resend/);
  assert.equal(validateManifest(parseSimpleYaml(text)).services.stripe.provider, "stripe");
  const audited = auditRepository(root);
  assert.deepEqual(audited.undocumented, []);
  assert.equal(audited.status, "pass");
  assert.equal(auditRepository(root, undefined, { requireCustody: true }).status, "fail");
  assert.throws(() => writeStarterManifest(root), /MANIFEST_ALREADY_EXISTS/);
  const cliRun = spawnSync(process.execPath, [cli, "init", root], { encoding: "utf8" });
  assert.equal(cliRun.status, 1, cliRun.stdout);
  assert.match(cliRun.stderr, /will not overwrite/);
}));

test("init ignores skipped tests and refuses an incomplete scan", () => temp((root, write) => {
  write("tests/package.json", '{"dependencies":{"stripe":"*"}}');
  const empty = writeStarterManifest(root);
  assert.deepEqual(empty.providers, []);
  fs.unlinkSync(path.join(root, "ops.yaml"));
  const included = writeStarterManifest(root, { includeTests: true });
  assert.deepEqual(included.providers, ["stripe"]);
  const text = fs.readFileSync(path.join(root, "ops.yaml"), "utf8");
  assert.match(text, /include_tests: true/);
  const audited = auditRepository(root);
  assert.equal(audited.includeTests, true);
  assert.equal(audited.status, "pass");
  assert.deepEqual(audited.manifestOnly, []);
  assert.ok(audited.scan.services.some(item => item.id === "stripe"));
}));

test("init does not create a manifest when scanning fails", () => temp((root, write) => {
  write("package.json", "{");
  assert.throws(() => writeStarterManifest(root), /INVALID_PACKAGE_JSON/);
  assert.equal(fs.existsSync(path.join(root, "ops.yaml")), false);
  write("ops.json", '{"version":1,"services":{}}');
  write("package.json", '{"dependencies":{"resend":"*"}}');
  assert.throws(() => writeStarterManifest(root), /MANIFEST_ALREADY_EXISTS/);
}));

test("a missing manifest tells the operator to run init", () => temp((root, write) => {
  write("package.json", '{"dependencies":{"resend":"*"}}');
  assert.match(formatReport(auditRepository(root)), /No custody manifest found\. Run `ops-drift init`/);
  const quiet = fs.mkdtempSync(path.join(os.tmpdir(), "ops-empty-"));
  try { assert.equal(formatReport(auditRepository(quiet)).includes("ops-drift init"), false); }
  finally { fs.rmSync(quiet, { recursive: true, force: true }); }
}));

test("form backends and hosting providers are detected from HTML and config", () => temp((root, write) => {
  write("index.html", [
    `<form action="${host(["formsubmit", "co"])}/ajax/token" method="POST"></form>`,
    `<script src="${host(["formspree", "io"])}/js/formbutton.js"></script>`,
    `<form name="contact" ${"data-" + "netlify"}="true"></form>`,
    `<form action="${host(["getform", "io"])}/abcdef"></form>`,
    `<form action="${host(["api.web3forms", "com"])}/submit"></form>`
  ].join("\n"));
  const result = scanRepository(root);
  for (const id of ["formsubmit", "formspree", "netlify-forms", "getform", "web3forms"]) {
    assert.equal(provider(result, id)?.confidence, "strong", id);
  }
  assert.equal(provider(result, "netlify"), undefined);
}));

test("documentation and ordinary forms are negative controls", () => temp((root, write) => {
  write("README.md", `Contact form at ${host(["formsubmit", "co"])}\n`);
  write("index.html", '<form action="/contact" method="POST"></form>\n<p>No external form backend.</p>\n');
  assert.deepEqual(scanRepository(root).services, []);
}));

test("Netlify hosting is strong from netlify.toml and weak from one hostname", () => temp((root, write) => {
  write("page.html", `<a href="${host(["demo.netlify", "app"])}">site</a>\n`);
  assert.equal(provider(scanRepository(root), "netlify").confidence, "weak");
  write("netlify.toml", 'custom_domain = "example.com"\n');
  const result = scanRepository(root);
  assert.equal(provider(result, "netlify").confidence, "strong");
  assert.equal(provider(result, "custom-domain").confidence, "strong");
  assert.equal(provider(result, "github-pages"), undefined);
}));

test("GitHub Pages CNAME is also a custom domain, and Pages can exist without one", () => temp((root, write) => {
  write("public/CNAME", "example.com\n");
  const named = scanRepository(root);
  assert.equal(provider(named, "github-pages").confidence, "strong");
  assert.equal(provider(named, "custom-domain").confidence, "strong");
  fs.rmSync(path.join(root, "public"), { recursive: true });
  write(".nojekyll", "");
  write(".github/workflows/pages.yml", "jobs:\n  deploy:\n    steps:\n      - uses: actions/deploy-pages@v4\n");
  const pages = scanRepository(root);
  assert.equal(provider(pages, "github-pages").confidence, "strong");
  assert.equal(provider(pages, "github-actions").confidence, "strong");
  assert.equal(provider(pages, "custom-domain"), undefined);
}));

test("Cloudflare Pages is distinct from a plain wrangler file, and Vercel still matches", () => temp((root, write) => {
  write("wrangler.toml", 'name = "x"\n');
  assert.equal(provider(scanRepository(root), "cloudflare").confidence, "strong");
  assert.equal(provider(scanRepository(root), "cloudflare-pages"), undefined);
  write("wrangler.toml", 'name = "x"\npages_build_output_dir = "dist"\n');
  write("site.html", `<a href="${host(["demo.pages", "dev"])}">pages</a>\n`);
  write("vercel.json", "{}\n");
  const result = scanRepository(root);
  assert.equal(provider(result, "cloudflare").confidence, "strong");
  assert.equal(provider(result, "cloudflare-pages").confidence, "strong");
  assert.equal(provider(result, "vercel").confidence, "strong");
}));

test("npm publish config and workflows are strong and a source mention can stay weak", () => temp((root, write) => {
  write("package.json", JSON.stringify({ name: "example", publishConfig: { access: "public" } }));
  assert.equal(provider(scanRepository(root), "npm").confidence, "strong");
  fs.unlinkSync(path.join(root, "package.json"));
  write("tool.js", "const note = 'registry-url: https://example.test';\n");
  assert.equal(provider(scanRepository(root), "npm"), undefined);
  write("tool.js", `const registry = ${JSON.stringify(host(["registry.npmjs", "org"]) + "/example")};\n`);
  assert.equal(provider(scanRepository(root), "npm").confidence, "weak");
  write(".github/workflows/publish.yml", "jobs:\n  publish:\n    steps:\n      - run: npm publish\n");
  assert.equal(provider(scanRepository(root), "npm").confidence, "strong");
}));

test("PyPI publish signals are detected and an ordinary requirements file is not", () => temp((root, write) => {
  write("requirements.txt", "requests==2.32.0\n");
  assert.equal(provider(scanRepository(root), "pypi"), undefined);
  write("requirements.txt", "twine==5.0.1\n");
  assert.equal(provider(scanRepository(root), "pypi").confidence, "strong");
  write("publish.py", `url = ${JSON.stringify(host(["pypi", "org"]) + "/project/example")}\n`);
  assert.equal(provider(scanRepository(root), "pypi").confidence, "strong");
  fs.unlinkSync(path.join(root, "requirements.txt"));
  assert.equal(provider(scanRepository(root), "pypi").confidence, "weak");
  write("upload.py", `url = ${JSON.stringify(host(["upload.pypi", "org"]) + "/legacy/")}\n`);
  write(".github/workflows/pypi.yml", "jobs:\n  publish:\n    steps:\n      - run: twine upload dist/*\n");
  assert.equal(provider(scanRepository(root), "pypi").confidence, "strong");
}));

test("hygiene checks are off by default and do not echo matched text", () => temp((root, write) => {
  const secret = "AKIA" + "IOSFODNN7EXAMPLE";
  const email = ["dev", dot(["gmail", "com"])].join("@");
  const studio = ["hello", dot(["dripstaticstudios", "com"])].join("@");
  const noreply = ["bot", dot(["users.noreply.github", "com"])].join("@");
  const windows = ["C:", "Users", "dev"].join("\\");
  const home = ["", "home", "dev"].join("/");
  const url = host(["example", "com"]) + ["", "home", "docs"].join("/");
  const header = "-----BEGIN " + "PRIVATE KEY-----";
  write("app.js", [
    `const key = ${JSON.stringify(secret)};`,
    `const email = ${JSON.stringify(email)};`,
    `const studio = ${JSON.stringify(studio)};`,
    `const noreply = ${JSON.stringify(noreply)};`,
    `const win = ${JSON.stringify(windows)};`,
    `const home = ${JSON.stringify(home)};`,
    `const url = ${JSON.stringify(url)};`,
    `const header = ${JSON.stringify(header)};`,
    'const api_key = "your-api-key-value";'
  ].join("\n"));
  const quiet = auditRepository(root);
  assert.equal(quiet.status, "pass");
  assert.deepEqual(quiet.blocking, []);
  assert.equal(JSON.stringify(machineReport(quiet)).includes(secret), false);
  const noisy = auditRepository(root, undefined, { hygiene: true });
  assert.equal(noisy.status, "fail");
  assert.equal(noisy.blocking.filter(item => item.check === "personal-email").length, 1);
  assert.equal(noisy.blocking.filter(item => item.check === "local-path").length, 2);
  assert.ok(noisy.blocking.some(item => item.rule === "aws-access-key"));
  assert.ok(noisy.blocking.some(item => item.rule === "private-key"));
  assert.equal(noisy.blocking.some(item => item.rule === "assigned-secret"), false);
  const rendered = formatReport(noisy);
  const machine = JSON.stringify(machineReport(noisy));
  for (const hidden of [secret, email, studio, windows, home, header, "PRIVATE KEY"]) {
    assert.equal(rendered.includes(hidden), false, hidden);
    assert.equal(machine.includes(hidden), false, hidden);
  }
  const gated = spawnSync(process.execPath, [cli, root, "--hygiene", "--ci", "--json"], { encoding: "utf8" });
  assert.equal(gated.status, 2, gated.stdout);
  assert.equal(gated.stdout.includes(secret), false);
  assert.equal(JSON.parse(gated.stdout).summary.hygiene_enabled, true);
  const ignored = spawnSync(process.execPath, [cli, root, "--ci", "--json"], { encoding: "utf8" });
  assert.equal(ignored.status, 0, ignored.stdout);
  assert.equal(JSON.parse(ignored.stdout).status, "pass");
}));

test("hygiene does not read skipped secret files", () => temp((root, write) => {
  const secret = "AKIA" + "IOSFODNN7EXAMPLE";
  write(".env", secret + "\n");
  write("app.js", "console.log('ok');\n");
  const result = auditRepository(root, undefined, { hygiene: true });
  assert.equal(result.complete, true);
  assert.deepEqual(result.blocking, []);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.ok(result.scan.skippedSensitiveFiles.includes(".env"));
}));

test("this repository has no blocking findings and no personal gmail address", () => {
  const result = auditRepository(repo, undefined, { requireCustody: true });
  assert.equal(result.complete, true, JSON.stringify(result.scan.warnings));
  assert.deepEqual(result.blocking, []);
  assert.equal(result.status, "pass");
  assert.equal(result.includeTests, false);
  const cliRun = spawnSync(process.execPath, [cli, repo, "--ci", "--json", "--require-custody"], { encoding: "utf8" });
  assert.equal(cliRun.status, 0, cliRun.stderr || cliRun.stdout);
  const report = JSON.parse(cliRun.stdout);
  const packageJson = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
  assert.equal(report.tool.version, packageJson.version);
  assert.equal(report.tool.version, "0.1.2");
  assert.deepEqual(report.blocking, []);
  assert.equal(packageJson.author, "Dripstatic Studios <hello@dripstaticstudios.com>");
  const refused = spawnSync(process.execPath, [cli, "init", repo], { encoding: "utf8" });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /will not overwrite/);
  const needle = Buffer.from("gmail" + ".com");
  const pending = [repo];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else assert.equal(fs.readFileSync(full).includes(needle), false, path.relative(repo, full));
    }
  }
});

test("init prints the subdirectory manifest and keeps test providers visible", () => temp((root, write) => {
  write("sub/tests/requirements.txt", "stripe==1.0.0\n");
  const run = spawnSync(process.execPath, [cli, "init", "sub", "--include-tests"], { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Wrote sub\/ops\.yaml/);
  const text = fs.readFileSync(path.join(root, "sub", "ops.yaml"), "utf8");
  assert.match(text, /include_tests: true/);
  assert.match(text, /^\s+stripe:/m);
  const audited = auditRepository(path.join(root, "sub"));
  assert.equal(audited.includeTests, true);
  assert.equal(audited.status, "pass");
  assert.deepEqual(audited.manifestOnly, []);
  assert.ok(audited.scan.services.some(item => item.id === "stripe"));
}));

test("bare hostnames stay weak and a longer name is not that host", () => temp((root, write) => {
  write("site.html", `<a href="${host(["pages.dev", "example", "com"])}/article">x</a>\n`);
  assert.equal(provider(scanRepository(root), "cloudflare-pages"), undefined);
  write("app.js", `const url = ${JSON.stringify(host(["formspree", "io"]) + "/blog")};\n`);
  write("page.html", `<a href="${host(["formspree", "io"])}/blog">blog</a>\n`);
  write("tool.py", `url = ${JSON.stringify(host(["upload.pypi", "org"]) + "/legacy/")}\n`);
  fs.unlinkSync(path.join(root, "app.js"));
  const weak = scanRepository(root);
  assert.equal(provider(weak, "formspree").confidence, "weak");
  assert.equal(provider(weak, "pypi").confidence, "weak");
  write("real.html", `<a href="${host(["demo.pages", "dev"])}">pages</a>\n`);
  assert.equal(provider(scanRepository(root), "cloudflare-pages").confidence, "weak");
}));

test("generic custom domains, twine, lockfiles, and GitHub Packages are not blocking registry evidence", () => temp((root, write) => {
  write("config.json", '{"customDomain":"model field"}\n');
  write("package.json", JSON.stringify({ dependencies: { twine: "*" } }));
  const registry = host(["registry.npmjs", "org"]);
  write("package-lock.json", JSON.stringify({ packages: { "": { resolved: registry + "/left" } } }));
  write("apps/package-lock.json", JSON.stringify({ packages: { "": { resolved: registry + "/right" } } }));
  write(".github/workflows/publish.yml", "jobs:\n  publish:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          registry-url: https://npm.pkg.github.com\n");
  const quiet = scanRepository(root);
  assert.equal(provider(quiet, "custom-domain"), undefined);
  assert.equal(provider(quiet, "pypi"), undefined);
  assert.equal(provider(quiet, "npm"), undefined);
  write("vercel.json", '{"customDomain":"example.com"}\n');
  write("requirements.txt", "twine==5.0.1\n");
  write(".github/workflows/publish.yml", "jobs:\n  publish:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          registry-url: " + registry + "\n      - run: npm stage publish\n");
  const found = scanRepository(root);
  assert.equal(provider(found, "custom-domain").confidence, "strong");
  assert.equal(provider(found, "pypi").confidence, "strong");
  assert.equal(provider(found, "npm").confidence, "strong");
}));

test("Cloudflare Pages actions and lowercase GitHub Pages actions are detected", () => temp((root, write) => {
  write(".github/workflows/pages.yml", [
    "jobs:",
    "  deploy:",
    "    steps:",
    "      - uses: cloudflare/wrangler-action@v3",
    "        with:",
    "          command: pages deploy",
    "      - uses: cloudflare/pages-action@v1",
    "      - uses: jamesives/github-pages-deploy-action@v4"
  ].join("\n"));
  const result = scanRepository(root);
  assert.equal(provider(result, "cloudflare-pages").confidence, "strong");
  assert.equal(provider(result, "github-pages").confidence, "strong");
  assert.equal(provider(result, "cloudflare"), undefined);
}));

test("hygiene ignores workflow secrets, emscripten paths, and longer domains", () => temp((root, write) => {
  const email = ["dev", dot(["gmail", "com"])].join("@");
  const lookalike = ["dev", [dot(["gmail", "com"]), "example", "org"].join(".")].join("@");
  const home = ["", "home", "dev"].join("/");
  const emscripten = ["", "home", "web_user"].join("/");
  const mac = ["", "Users", "ada"].join("/");
  write("app.js", [
    'const password = "${{ secrets.DOCKERHUB_TOKEN }}";',
    `const email = ${JSON.stringify(email)};`,
    `const other = ${JSON.stringify(lookalike)};`,
    `const home = ${JSON.stringify(home)};`,
    `const wasm = ${JSON.stringify(emscripten)};`,
    `const mac = ${JSON.stringify(mac)};`
  ].join("\n"));
  const result = auditRepository(root, undefined, { hygiene: true });
  assert.equal(result.blocking.filter(item => item.check === "personal-email").length, 1);
  assert.equal(result.blocking.filter(item => item.check === "local-path").length, 2);
  assert.equal(result.blocking.some(item => item.rule === "assigned-secret"), false);
}));

test("hygiene reads docs and config text without turning them into providers", () => temp((root, write) => {
  const email = ["dev", dot(["gmail", "com"])].join("@");
  write("README.md", `Contact ${email} via ${host(["formsubmit", "co"])}\n`);
  write("notes.txt", `see ${email}\n`);
  write("setup.cfg", `maintainer = ${email}\n`);
  write("app.ini", `owner = ${email}\n`);
  write("feed.xml", `<author>${email}</author>\n`);
  const quiet = scanRepository(root);
  assert.deepEqual(quiet.services, []);
  const noisy = auditRepository(root, undefined, { hygiene: true });
  assert.equal(noisy.scan.services.length, 0);
  assert.equal(noisy.blocking.filter(item => item.check === "personal-email").length, 5);
}));

test("a 1 MiB adversarial file finishes well under a second", () => temp((root, write) => {
  const form = "<" + "form ";
  write("index.html", form.repeat(Math.ceil(1048576 / form.length)).slice(0, 1048576));
  const started = performance.now();
  const forms = scanRepository(root);
  const formElapsed = performance.now() - started;
  assert.equal(forms.complete, true, JSON.stringify(forms.warnings));
  assert.equal(provider(forms, "netlify-forms"), undefined);
  assert.ok(formElapsed < 1000, `form scan took ${formElapsed}ms`);
  const action = "cloudflare/wrangler-action ";
  write(".github/workflows/slow.yml", action.repeat(Math.ceil(1048576 / action.length)).slice(0, 1048576));
  const workflowStarted = performance.now();
  const workflow = scanRepository(root);
  const workflowElapsed = performance.now() - workflowStarted;
  assert.equal(workflow.complete, true, JSON.stringify(workflow.warnings));
  assert.equal(provider(workflow, "cloudflare-pages"), undefined);
  assert.ok(workflowElapsed < 1000, `workflow scan took ${workflowElapsed}ms`);
  const dots = "a.a.a.";
  write("notes.md", dots.repeat(Math.ceil(1048576 / dots.length)).slice(0, 1048576));
  const hygieneStarted = performance.now();
  const hygiene = scanRepository(root, { hygiene: true });
  const hygieneElapsed = performance.now() - hygieneStarted;
  assert.equal(hygiene.complete, true, JSON.stringify(hygiene.warnings));
  assert.deepEqual(hygiene.hygiene, []);
  assert.ok(hygieneElapsed < 1000, `hygiene scan took ${hygieneElapsed}ms`);
  const closed = (form.repeat(Math.ceil(1048576 / form.length)).slice(0, 1048575)) + ">";
  write("closed.html", closed);
  const closedStarted = performance.now();
  const closedScan = scanRepository(root);
  const closedElapsed = performance.now() - closedStarted;
  assert.equal(closedScan.complete, true, JSON.stringify(closedScan.warnings));
  assert.ok(closedElapsed < 1000, `closed form scan took ${closedElapsed}ms`);
  write(".github/workflows/newlines.yml", "\n".repeat(1048576));
  const newlineStarted = performance.now();
  const newlines = scanRepository(root);
  const newlineElapsed = performance.now() - newlineStarted;
  assert.equal(newlines.complete, true, JSON.stringify(newlines.warnings));
  assert.equal(provider(newlines, "scheduled-jobs"), undefined);
  assert.ok(newlineElapsed < 1000, `newline workflow scan took ${newlineElapsed}ms`);
  write(".github/workflows/spaces.yml", " \n".repeat(524288));
  const spaceStarted = performance.now();
  const spaces = scanRepository(root);
  assert.equal(spaces.complete, true, JSON.stringify(spaces.warnings));
  assert.ok(performance.now() - spaceStarted < 1000, "spaced workflow scan was slow");
  write(".env.example", "\n".repeat(1048576));
  const envStarted = performance.now();
  const envFile = scanRepository(root);
  assert.equal(envFile.complete, true, JSON.stringify(envFile.warnings));
  assert.ok(performance.now() - envStarted < 1000, "env template scan was slow");
  write(".github/workflows/cron.yml", "on:\n  schedule:\n    - cron: '0 0 * * *'\n");
  assert.ok(provider(scanRepository(root), "scheduled-jobs"));
  const piece = "${{ " + "secrets.";
  const prefix = 'const password = "';
  const suffix = '"\n';
  const budget = 1048576 - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  const body = piece.repeat(Math.ceil(budget / piece.length)).slice(0, budget);
  write("a.js", prefix + body + suffix);
  const secretStarted = performance.now();
  const secretScan = scanRepository(root, { hygiene: true });
  const secretElapsed = performance.now() - secretStarted;
  assert.equal(secretScan.complete, true, JSON.stringify(secretScan.warnings));
  assert.equal(secretScan.hygiene.some(item => item.rule === "assigned-secret"), true);
  assert.ok(secretElapsed < 1000, `unclosed expression scan took ${secretElapsed}ms`);
}));

test("a private npm registry is not the public npm registry", () => temp((root, write) => {
  const github = "https://npm.pkg.github.com";
  write("package.json", JSON.stringify({ name: "example", publishConfig: { registry: github } }));
  assert.equal(provider(scanRepository(root), "npm"), undefined);
  write("package.json", JSON.stringify({ name: "example", publishConfig: { access: "public" } }));
  assert.equal(provider(scanRepository(root), "npm").confidence, "strong");
  write(".github/workflows/publish.yml", `jobs:\n  publish:\n    steps:\n      - run: npm publish --registry ${github}\n`);
  fs.unlinkSync(path.join(root, "package.json"));
  assert.equal(provider(scanRepository(root), "npm"), undefined);
  write(".github/workflows/publish.yml", "jobs:\n  publish:\n    steps:\n      - run: npm publish --registry " + host(["registry.npmjs", "org"]) + "\n");
  assert.equal(provider(scanRepository(root), "npm").confidence, "strong");
  write(".github/workflows/publish.yml", [
    "jobs:",
    "  publish:",
    "    steps:",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          registry-url: " + github,
    "      - run: npm publish"
  ].join("\n"));
  assert.equal(provider(scanRepository(root), "npm"), undefined);
  write("package.json", JSON.stringify({ name: "example", publishConfig: { registry: github } }));
  assert.equal(provider(scanRepository(root), "npm"), undefined);
  fs.unlinkSync(path.join(root, "package.json"));
  write(".github/workflows/publish.yml", [
    "jobs:",
    "  publish:",
    "    steps:",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          registry-url: " + host(["registry.npmjs", "org"]),
    "      - run: npm stage publish --access public"
  ].join("\n"));
  assert.equal(provider(scanRepository(root), "npm").confidence, "strong");
  write(".github/workflows/publish.yml", "jobs:\n  publish:\n    steps:\n      - run: npm publish\n");
  assert.equal(provider(scanRepository(root), "npm").confidence, "strong");
  write(".github/workflows/publish.yml", [
    "jobs:",
    "  private:",
    "    steps:",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          registry-url: " + github,
    "      - run: npm publish",
    "  release:",
    "    steps:",
    "      - run: npm publish"
  ].join("\n"));
  assert.equal(provider(scanRepository(root), "npm").confidence, "strong");
}));

test("netlify form tokens count only as form attributes, and JSX arrows do not end the tag", () => temp((root, write) => {
  write("docs.js", `const docs = ${JSON.stringify("data-" + "netlify" + " enables forms")};\n`);
  assert.equal(provider(scanRepository(root), "netlify-forms"), undefined);
  write("index.html", `<form name="contact" ${"data-" + "netlify"}="true"></form>\n`);
  assert.equal(provider(scanRepository(root), "netlify-forms").confidence, "strong");
  write("Form.jsx", `<form onSubmit={(e) => track(e)} action="${host(["formspree", "io"])}/f/abc"></form>\n`);
  assert.equal(provider(scanRepository(root), "formspree").confidence, "strong");
  fs.unlinkSync(path.join(root, "index.html"));
  write("Netlify.jsx", `<form onSubmit={(e) => track(e)} ${"data-" + "netlify"}="true"></form>\n`);
  assert.equal(provider(scanRepository(root), "netlify-forms").confidence, "strong");
}));

test("a fetch to a form endpoint is strong and a bare link stays weak", () => temp((root, write) => {
  write("submit.js", `fetch(${JSON.stringify(host(["api.web3forms", "com"]) + "/submit")}, { method: "POST" });\n`);
  write("ajax.js", `fetch(\n  ${JSON.stringify(host(["formsubmit", "co"]) + "/ajax/token")}\n);\n`);
  write("post.js", `axios.post(${JSON.stringify(host(["getform", "io"]) + "/f/1")});\n`);
  const called = scanRepository(root);
  assert.equal(provider(called, "web3forms").confidence, "strong");
  assert.equal(provider(called, "formsubmit").confidence, "strong");
  assert.equal(provider(called, "getform").confidence, "strong");
  write("submit.js", `const docs = ${JSON.stringify(host(["formspree", "io"]) + "/blog")};\n`);
  fs.unlinkSync(path.join(root, "ajax.js"));
  fs.unlinkSync(path.join(root, "post.js"));
  assert.equal(provider(scanRepository(root), "formspree").confidence, "weak");
  assert.equal(provider(scanRepository(root), "web3forms"), undefined);
  write("submit.js", `fetch("/health")\nconst docs = ${JSON.stringify(host(["formspree", "io"]) + "/blog")};\n`);
  assert.equal(provider(scanRepository(root), "formspree").confidence, "weak");
  write("submit.js", `// use fetch( with an endpoint such as ${host(["formsubmit", "co"])}/docs\n`);
  assert.equal(provider(scanRepository(root), "formsubmit").confidence, "weak");
  assert.equal(provider(scanRepository(root), "formspree"), undefined);
  write("submit.js", `fetch(api, {\n  headers: {},\n  // see ${host(["formspree", "io"])} for alternatives\n});\n`);
  assert.equal(provider(scanRepository(root), "formspree").confidence, "weak");
}));

test("cloudflare pages deploy does not leak across workflow steps", () => temp((root, write) => {
  write(".github/workflows/pages.yml", [
    "jobs:",
    "  deploy:",
    "    steps:",
    "      - uses: cloudflare/wrangler-action@v3",
    "        with:",
    "          command: deploy",
    "      - run: npm run pages deploy"
  ].join("\n"));
  assert.equal(provider(scanRepository(root), "cloudflare-pages"), undefined);
  write(".github/workflows/pages.yml", [
    "jobs:",
    "  deploy:",
    "    steps:",
    "      - uses: cloudflare/wrangler-action@v3",
    "        with:",
    "          command: pages deploy dist"
  ].join("\n"));
  assert.equal(provider(scanRepository(root), "cloudflare-pages").confidence, "strong");
  write(".github/workflows/pages.yml", [
    "jobs:",
    "  deploy:",
    "    steps:",
    "      - uses: cloudflare/wrangler-action@v3",
    "        with:",
    "          command: deploy",
    "  docs:",
    "    name: pages deploy documentation"
  ].join("\n"));
  assert.equal(provider(scanRepository(root), "cloudflare-pages"), undefined);
  write(".github/workflows/pages.yml", [
    "jobs:",
    "  deploy:",
    "    steps:",
    "      - run: npx wrangler pages deploy dist"
  ].join("\n"));
  assert.equal(provider(scanRepository(root), "cloudflare-pages").confidence, "strong");
}));

test("hygiene flags a hardcoded secret beside an expression and more path shapes", () => temp((root, write) => {
  const mixed = "actual-hardcoded-value-${{ vars.ENV }}";
  const only = "${{ secrets.DOCKERHUB_TOKEN }}";
  const pair = "${{ secrets.A }}${{ vars.B }}";
  const win = ["C:", "Users", "ada"].join("\\");
  const fwd = ["C:", "Users", "ada"].join("/");
  const home = ["", "home", "ada"].join("/");
  const mac = ["", "Users", "ada"].join("/");
  const tilde = "~" + "/work";
  const store = "~" + "/.pnpm-store";
  const alias = "~" + "/components/Button.vue";
  const wasm = ["", "home", "web_user"].join("/");
  const rootHome = ["", "root", "private"].join("/");
  const runner = ["", "home", "runner", "work"].join("/");
  const short = ["x:", "y"].join("/");
  write("app.js", [
    win,
    `const password = ${JSON.stringify(mixed)};`,
    `const token = ${JSON.stringify(only)};`,
    "path=" + fwd,
    "path=" + home,
    "dir=" + mac,
    "home=" + tilde,
    "wasm=" + wasm,
    "root=" + rootHome,
    "ci=" + runner,
    "short=" + short,
    "cache=" + store,
    "import " + alias,
    `const other = ${JSON.stringify(pair)};`
  ].join("\n"));
  write("package-lock.json", "path=" + home + "\n");
  const result = auditRepository(root, undefined, { hygiene: true });
  assert.equal(result.blocking.filter(item => item.rule === "assigned-secret").length, 1);
  const paths = result.blocking.filter(item => item.check === "local-path");
  assert.deepEqual(paths.map(item => item.line), [1, 4, 5, 6, 9]);
  assert.equal(paths.some(item => item.path === "package-lock.json"), false);
}));

test("hygiene skips non-utf8 docs without failing the scan", () => temp((root, write) => {
  write("NOTICE.txt", Buffer.from([0xA9, 0x20, 0xE9]));
  write("settings.ini", Buffer.from("owner=x\n", "utf16le"));
  write("app.js", "console.log('ok');\n");
  const quiet = scanRepository(root);
  assert.equal(quiet.complete, true);
  assert.deepEqual(quiet.notes, []);
  const noisy = scanRepository(root, { hygiene: true });
  assert.equal(noisy.complete, true, JSON.stringify(noisy.warnings));
  assert.deepEqual(noisy.hygiene, []);
  assert.deepEqual(noisy.notes.map(item => item.path).sort(), ["NOTICE.txt", "settings.ini"]);
  const cliRun = spawnSync(process.execPath, [cli, root, "--hygiene", "--ci", "--json"], { encoding: "utf8" });
  assert.equal(cliRun.status, 0, cliRun.stdout);
  const report = JSON.parse(cliRun.stdout);
  assert.equal(report.complete, true);
  assert.equal(report.status, "pass");
  write("bad.js", Buffer.from([0xff, 0xfe, 0x00, 0x41]));
  const strict = scanRepository(root, { hygiene: true });
  assert.equal(strict.complete, false);
  assert.equal(strict.warnings[0].code, "INVALID_UTF8");
}));
