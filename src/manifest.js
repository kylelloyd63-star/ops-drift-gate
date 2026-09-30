import fs from "node:fs";
import path from "node:path";
import { LIMITS, fail, inputPath, isSensitivePath, readBounded, repositoryRoot, within } from "./safety.js";
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
function keyCheck(key) { if (RESERVED.has(key)) fail("reserved key"); if (!ID.test(key)) fail("INVALID_MANIFEST_KEY"); }
function scalar(value) {
  if (/^[&*!\[\]{}>|]/.test(value)) fail("UNSUPPORTED_YAML_SYNTAX");
  if (value.startsWith('"')) { try { return JSON.parse(value); } catch { fail("INVALID_YAML_STRING"); } }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || /(^|[^'])'([^']|$)/.test(value.slice(1, -1))) fail("INVALID_YAML_STRING");
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (["null", "~"].includes(value)) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote === "'" && ch === "'" && line[i + 1] === "'") { i++; continue; }
    if ((ch === '"' || ch === "'") && !(quote === '"' && line[i - 1] === "\\")) quote = quote === ch ? null : quote ?? ch;
    if (ch === "#" && !quote && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  if (quote) fail("INVALID_YAML_STRING");
  return line;
}
function checkTree(value) {
  const pending = [[value, 0]]; let keys = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (depth > LIMITS.manifestDepth) fail("MANIFEST_DEPTH_LIMIT");
    if (record(node)) for (const [key, child] of Object.entries(node)) {
      keyCheck(key); if (++keys > LIMITS.manifestKeys) fail("MANIFEST_KEY_LIMIT");
      pending.push([child, depth + 1]);
    }
    else if (Array.isArray(node) || !["string", "number", "boolean"].includes(typeof node) && node !== null) fail("INVALID_MANIFEST_VALUE");
    else if (typeof node === "string" && (node.length > LIMITS.text || /[\x00-\x1f\x7f-\x9f]/.test(node))) fail("INVALID_MANIFEST_TEXT");
    else if (typeof node === "number" && !Number.isFinite(node)) fail("INVALID_MANIFEST_VALUE");
  }
}
export function parseSimpleYaml(text) {
  if (Buffer.byteLength(text) > LIMITS.manifestBytes) fail("MANIFEST_SIZE_LIMIT");
  const root = Object.create(null), stack = [{ indent: -2, object: root }];
  let keys = 0, previousIndent = -2, previousMap = true;
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (line.includes("\t")) fail("INVALID_YAML_INDENTATION");
    const source = stripComment(line).trimEnd(); if (!source.trim()) continue;
    const indent = source.length - source.trimStart().length;
    if (indent % 2 || indent > previousIndent && (!previousMap || indent !== previousIndent + 2)) fail("INVALID_YAML_INDENTATION");
    const match = /^([^:]+):(.*)$/.exec(source.trim()); if (!match) fail("INVALID_YAML_MAPPING");
    const key = match[1].trim(); keyCheck(key);
    if (++keys > LIMITS.manifestKeys) fail("MANIFEST_KEY_LIMIT");
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    if (stack.length > LIMITS.manifestDepth) fail("MANIFEST_DEPTH_LIMIT");
    const parent = stack.at(-1).object;
    if (Object.hasOwn(parent, key)) fail("DUPLICATE_MANIFEST_KEY");
    const raw = match[2].trim(); parent[key] = raw === "" ? Object.create(null) : scalar(raw);
    if (raw === "") stack.push({ indent, object: parent[key] });
    previousIndent = indent; previousMap = raw === "";
  }
  checkTree(root); return root;
}
// Mapping-only JSON parser rejects duplicate declarations rather than silently overwriting.
export function parseManifestJson(text) {
  if (Buffer.byteLength(text) > LIMITS.manifestBytes) fail("MANIFEST_SIZE_LIMIT");
  text = text.replace(/^\uFEFF/, ""); let cursor = 0, keys = 0;
  const white = () => { while (cursor < text.length && /[ \t\r\n]/.test(text[cursor])) cursor++; };
  const string = () => {
    const match = /^"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.exec(text.slice(cursor));
    if (!match) fail("INVALID_MANIFEST_JSON"); cursor += match[0].length; return JSON.parse(match[0]);
  };
  const value = depth => {
    if (depth > LIMITS.manifestDepth) fail("MANIFEST_DEPTH_LIMIT"); white();
    if (text[cursor] === "{") {
      cursor++; white(); const out = Object.create(null);
      if (text[cursor] === "}") { cursor++; return out; }
      while (true) {
        white(); const key = string(); keyCheck(key);
        if (++keys > LIMITS.manifestKeys) fail("MANIFEST_KEY_LIMIT");
        if (Object.hasOwn(out, key)) fail("DUPLICATE_MANIFEST_KEY");
        white(); if (text[cursor++] !== ":") fail("INVALID_MANIFEST_JSON");
        out[key] = value(depth + 1); white();
        const separator = text[cursor++]; if (separator === "}") return out; if (separator !== ",") fail("INVALID_MANIFEST_JSON");
      }
    }
    if (text[cursor] === '"') return string();
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(cursor));
    if (!token) fail("INVALID_MANIFEST_JSON"); cursor += token[0].length; return JSON.parse(token[0]);
  };
  const out = value(0); white(); if (cursor !== text.length) fail("INVALID_MANIFEST_JSON"); checkTree(out); return out;
}
function fields(value, allowed) {
  if (!record(value)) fail("MANIFEST_MAPPING_REQUIRED");
  for (const key of Object.keys(value)) if (!allowed.includes(key) && !/^x-[a-zA-Z0-9._-]+$/.test(key)) fail("UNKNOWN_MANIFEST_FIELD");
}
function optionalText(value) { if (value !== null && (typeof value !== "string" || !value.trim())) fail("INVALID_MANIFEST_TEXT"); return value === null ? null : value.trim(); }
export function validateManifest(raw) {
  checkTree(raw); fields(raw, ["version", "services", "ignores"]);
  if (!Object.hasOwn(raw, "version") || raw.version !== 1) fail("Manifest version must be 1.");
  if (!Object.hasOwn(raw, "services") || !record(raw.services)) fail("MANIFEST_SERVICES_REQUIRED");
  const services = Object.create(null), ignores = Object.create(null);
  for (const [id, value] of Object.entries(raw.services)) {
    fields(value, ["provider", "purpose", "required_for_production", "custody"]);
    if (!Object.hasOwn(value, "provider") || typeof value.provider !== "string" || !ID.test(value.provider)) fail("MANIFEST_PROVIDER_REQUIRED");
    const out = { provider: value.provider.toLowerCase() };
    if (Object.hasOwn(value, "purpose")) out.purpose = optionalText(value.purpose);
    if (Object.hasOwn(value, "required_for_production")) {
      if (![true, false, null].includes(value.required_for_production)) fail("INVALID_PRODUCTION_FLAG");
      out.required_for_production = value.required_for_production;
    }
    if (Object.hasOwn(value, "custody")) {
      out.custody = null;
      if (value.custody !== null) {
        fields(value.custody, ["owner", "billing_owner", "transferable", "recovery_procedure"]); out.custody = {};
        for (const field of ["owner", "billing_owner", "recovery_procedure"]) out.custody[field] = Object.hasOwn(value.custody, field) ? optionalText(value.custody[field]) : null;
        out.custody.transferable = Object.hasOwn(value.custody, "transferable") ? value.custody.transferable : null;
        if (![true, false, "unknown", null].includes(out.custody.transferable)) fail("INVALID_TRANSFERABILITY");
      }
    }
    services[id] = out;
  }
  if (Object.hasOwn(raw, "ignores")) {
    if (!record(raw.ignores)) fail("MANIFEST_MAPPING_REQUIRED");
    for (const [id, value] of Object.entries(raw.ignores)) {
      fields(value, ["provider", "reason", "path_prefix", "scope"]);
      if (!Object.hasOwn(value, "provider") || typeof value.provider !== "string" || !ID.test(value.provider)) fail("IGNORE_PROVIDER_REQUIRED");
      if (!Object.hasOwn(value, "reason") || typeof value.reason !== "string" || !value.reason.trim()) fail("IGNORE_REASON_REQUIRED");
      const out = { provider: value.provider.toLowerCase(), reason: value.reason.trim() };
      if (Object.hasOwn(value, "path_prefix")) {
        if (Object.hasOwn(value, "scope") || typeof value.path_prefix !== "string" || !value.path_prefix || /[\\:\x00-\x1f\x7f]/.test(value.path_prefix) || value.path_prefix.startsWith("/")) fail("INVALID_IGNORE_PATH");
        out.path_prefix = value.path_prefix.replace(/\/$/, "");
        if (!out.path_prefix || out.path_prefix.split("/").some(x => !x || x === ".." || x === ".")) fail("INVALID_IGNORE_PATH");
      } else if (!Object.hasOwn(value, "scope") || value.scope !== "all") fail("IGNORE_EXPLICIT_SCOPE_REQUIRED");
      else out.scope = "all";
      ignores[id] = out;
    }
  }
  return { version: 1, services, ignores };
}
export function loadManifest(rootInput, explicitPath, guard) {
  const root = repositoryRoot(rootInput);
  const candidates = explicitPath !== undefined ? [inputPath(explicitPath)] : ["ops.yaml", "ops.yml", "ops.json"];
  let loaded = null;
  for (const candidate of candidates) {
    const resolved = path.resolve(root, candidate); if (!within(root, resolved)) fail("PATH_OUTSIDE_ROOT");
    if (isSensitivePath(resolved) || ![".yaml", ".yml", ".json"].includes(path.extname(resolved).toLowerCase())) fail("SENSITIVE_OR_UNSUPPORTED_MANIFEST_PATH");
    let exists;
    try { fs.lstatSync(resolved); exists = true; } catch (error) { if (error.code !== "ENOENT") throw error; exists = false; }
    if (!exists) { if (explicitPath !== undefined) fail("EXPLICIT_MANIFEST_MISSING"); continue; }
    if (loaded) fail("MULTIPLE_MANIFESTS");
    const { text } = readBounded(root, resolved, LIMITS.manifestBytes, Infinity, guard);
    const raw = path.extname(resolved).toLowerCase() === ".json" ? parseManifestJson(text) : parseSimpleYaml(text);
    loaded = { manifest: validateManifest(raw), path: path.relative(root, resolved).split(path.sep).join("/") };
  }
  return loaded;
}
