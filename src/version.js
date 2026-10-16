import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (typeof manifest.version !== "string" || manifest.version.length === 0) {
  throw new Error("package.json version is missing");
}

export const TOOL_VERSION = manifest.version;
