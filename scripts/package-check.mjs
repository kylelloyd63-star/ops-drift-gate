import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ops-package-"));
const runtime = process.env.npm_execpath;
if (!runtime) throw new Error("Run package-check through npm or pnpm.");
const pnpm = /pnpm/i.test(runtime);
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120000, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout;
}
try {
  const expected = ["LICENSE", "README.md", "action.yml", "package.json", "docs/execution-model.md", ...fs.readdirSync("src").map(name => "src/" + name)].sort();
  if (!pnpm) {
    const dry = JSON.parse(run(process.execPath, [runtime, "pack", "--dry-run", "--json"]));
    assert.deepEqual(dry[0].files.map(x => x.path).sort(), expected);
  }
  run(process.execPath, [runtime, "pack", "--pack-destination", scratch]);
  const archive = path.join(scratch, fs.readdirSync(scratch).find(x => x.endsWith(".tgz")));
  const files = run("tar", ["-tf", archive]).trim().split(/\r?\n/).sort();
  const allowed = new Set(expected.map(name => "package/" + name));
  assert.deepEqual(files, [...allowed].sort());
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  const project = path.join(scratch, "second-repository"); fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, "package.json"), '{"name":"ops-pack-smoke","private":true}');
  run(process.execPath, [runtime, pnpm ? "add" : "install", "--offline", "--ignore-scripts", ...(pnpm ? [] : ["--no-audit", "--no-fund"]), archive], { cwd: project });
  const installed = path.join(project, "node_modules/ops-drift-gate/src");
  assert.equal(run(process.execPath, [path.join(installed, "cli.js"), "--version"]).trim(), "0.1.0");
  const target = path.join(scratch, "hostile-target"); fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "package.json"), '{"dependencies":{"resend":"*"},"scripts":{"install":"exit 99"}}');
  const cli = spawnSync(process.execPath, [path.join(installed, "cli.js"), target, "--ci", "--json"], { encoding: "utf8" });
  assert.equal(cli.status, 2); assert.equal(JSON.parse(cli.stdout).status, "fail");
  const action = run(process.execPath, [path.join(installed, "action.js")], { env: { ...process.env, GITHUB_WORKSPACE: target, INPUT_PATH: ".", INPUT_MANIFEST: "", INPUT_FAIL_ON_UNDOCUMENTED: "false", INPUT_REQUIRE_CUSTODY: "false", GITHUB_OUTPUT: path.join(scratch, "output"), GITHUB_STEP_SUMMARY: path.join(scratch, "summary") } });
  assert.match(action, /Gate status: PASS/);
  console.log(JSON.stringify({ sha256, files, packed_cli: "pass", packed_action: "pass", offline_install: "pass", runtime: process.version }));
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
