import fs from "node:fs";
import { auditRepository } from "./audit.js";
import { formatReport, summaryMarkdown } from "./report.js";
import { fail, repositoryRoot, safeError } from "./safety.js";

function booleanInput(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!["true", "false"].includes(value)) fail("INVALID_BOOLEAN_INPUT");
  return value === "true";
}
function output(status, undocumented = 0, custody = 0, complete = false) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "undocumented_count=" + undocumented + "\nunknown_custody_count=" + custody + "\nstatus=" + status + "\ncomplete=" + complete + "\n");
}
try {
  if (!process.env.GITHUB_WORKSPACE) fail("GITHUB_WORKSPACE_REQUIRED");
  const root = repositoryRoot(process.env.INPUT_PATH ?? ".", process.env.GITHUB_WORKSPACE);
  const manifest = process.env.INPUT_MANIFEST === "" ? undefined : process.env.INPUT_MANIFEST;
  const result = auditRepository(root, manifest, {
    workspace: process.env.GITHUB_WORKSPACE,
    requireCustody: booleanInput("INPUT_REQUIRE_CUSTODY", "false"),
    failOnUndocumented: booleanInput("INPUT_FAIL_ON_UNDOCUMENTED", "true")
  });
  const report = formatReport(result);
  console.log(report);
  output(result.status, result.undocumented.length, result.unknownCustody.length, result.complete);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(report));
  process.exitCode = result.status === "error" ? 1 : result.status === "fail" ? 2 : 0;
} catch (error) {
  console.error("ops-drift action: " + safeError(error));
  try { output("error"); } catch {}
  process.exitCode = 1;
}
