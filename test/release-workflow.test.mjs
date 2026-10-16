import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("npm publishing is restricted to the main branch", () => {
  const workflow = fs.readFileSync(path.join(repo, ".github", "workflows", "publish-npm.yml"), "utf8");
  assert.match(workflow, /^  publish:\n    if: github\.ref == 'refs\/heads\/main'$/m);
});
