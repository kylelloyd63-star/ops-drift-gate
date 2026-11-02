import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditRepository, machineReport } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");
const cli = path.join(repo, "src", "cli.js");
const packageVersion = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")).version;

test("version module reads package.json instead of a hardcoded release", () => {
  const source = fs.readFileSync(path.join(repo, "src", "version.js"), "utf8");
  assert.equal(source.includes("0.1.0"), false);
  assert.equal(source.includes("0.1.1"), false);
  assert.match(source, /package\.json/);
});

test("JSON version matches the package version", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ops-drift-version-"));
  fs.writeFileSync(path.join(dir, "app.js"), "console.log('ok');\n");
  try {
    assert.equal(machineReport(auditRepository(dir)).tool.version, packageVersion);
    const success = spawnSync(process.execPath, [cli, dir, "--json"], { encoding: "utf8" });
    assert.equal(success.status, 0, success.stderr);
    assert.equal(JSON.parse(success.stdout).tool.version, packageVersion);
    const version = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout.trim(), packageVersion);
    const error = spawnSync(process.execPath, [cli, "--json", "--unknown"], { encoding: "utf8" });
    assert.equal(error.status, 1, error.stdout);
    assert.equal(JSON.parse(error.stdout).tool.version, packageVersion);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
