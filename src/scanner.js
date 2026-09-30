import fs from "node:fs";
import path from "node:path";
import { SERVICE_RULES } from "./rules.js";
import { checkGitRepresentation } from "./git-index.js";
import { LIMITS, checkedPath, fail, isSensitivePath, readBounded, repositoryRoot, safeError, safeText, snapshotGuard } from "./safety.js";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".cache", "coverage", "vendor"]);
const ENV_TEMPLATES = new Set([".env.example", ".env.sample", ".env.template"]);
const TEXT_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".jsonc", ".yaml", ".yml", ".toml",
  ".py", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".sh", ".bash", ".zsh", ".md", ".txt", ".html", ".css"
]);

function normalize(p) { return p.split(path.sep).join("/"); }
function* walk(root, limits, checkTime, location, guard) {
  const pending = [root];
  let entries = 0;
  while (pending.length) {
    const dir = pending.pop();
    location(path.relative(root, dir));
    const before = checkedPath(root, dir, guard);
    const handle = fs.opendirSync(dir);
    try {
      let entry;
      while ((entry = handle.readSync())) {
        checkTime();
        if (++entries > limits.entries) fail("ENTRY_COUNT_LIMIT");
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full);
        location(rel);
        if (rel.length > LIMITS.path) fail("PATH_LENGTH_LIMIT");
        if (entry.isSymbolicLink()) fail("SYMLINK_OR_JUNCTION");
        if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
        if (rel.split(path.sep).length > limits.depth) fail("PATH_DEPTH_LIMIT");
        if (entry.isDirectory()) {
          if (!checkedPath(root, full, guard).isDirectory()) fail("FILESYSTEM_CHANGED");
          pending.push(full);
        }
        else if (entry.isFile()) yield rel;
        else fail("UNSAFE_FILE_TYPE_OR_HARDLINK");
      }
    } finally { handle.closeSync(); }
    location(path.relative(root, dir));
    const after = checkedPath(root, dir, guard);
    if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail("FILESYSTEM_CHANGED");
  }
}
function lineLookup(text) {
  const offsets = [0];
  for (let index = 0; index < text.length; index++) if (text[index] === "\n") offsets.push(index + 1);
  return index => {
    let low = 0, high = offsets.length;
    while (low + 1 < high) { const middle = (low + high) >>> 1; if (offsets[middle] <= index) low = middle; else high = middle; }
    return low + 1;
  };
}
function strengthForKind(kind) { return ["package", "env", "file", "workflow"].includes(kind) ? "strong" : "signal"; }
function addEvidence(store, rule, evidence) {
  const finding = store.get(rule.id) ?? { id: rule.id, name: rule.name, category: rule.category, evidence: [] };
  const candidate = { service: rule.id, serviceName: rule.name, category: rule.category, strength: strengthForKind(evidence.kind), ...evidence };
  candidate.path = safeText(candidate.path);
  const key = JSON.stringify([rule.id, candidate.path, candidate.kind, candidate.detail, candidate.line]);
  if (!store.seen.has(key)) {
    if (store.seen.size >= store.limit) fail("EVIDENCE_COUNT_LIMIT");
    store.seen.add(key);
    finding.evidence.push(candidate);
  }
  store.set(rule.id, finding);
}
function confidenceFor(evidence) {
  if (evidence.some(item => item.strength === "strong")) return "strong";
  const distinct = new Set(evidence.map(item => `${item.kind}:${item.path}`));
  return distinct.size >= 2 ? "corroborated" : "weak";
}
function* extractEnvNames(text, envTemplate) {
  const patterns = [
    /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bimport\.meta\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bDeno\.env\.get\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
    /\bos\.Getenv\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
    /\bSystem\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
    /\bos\.environ\.get\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
    /\bos\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
    /\bos\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
    /\bENV\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
    /\$\{\{\s*(?:secrets|vars)\.([A-Z][A-Z0-9_]*)\s*\}\}/g
  ];
  if (envTemplate) patterns.push(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm);
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) if (match[1] && match.index != null) yield { name: match[1], index: match.index };
}
function inspectPackages(rel, text, store) {
  const base = path.basename(rel).toLowerCase();
  if (/^requirements(?:-[^.]+)?\.txt$/.test(base)) {
    const packages = new Set();
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith("-")) continue;
      const name = line.split(/[<>=!~;\s\[]/, 1)[0]?.trim();
      if (name) packages.add(name);
    }
    for (const pkg of packages) for (const rule of SERVICE_RULES) if (rule.packagePatterns?.some(re => re.test(pkg))) addEvidence(store, rule, { path: normalize(rel), kind: "package", detail: `package dependency matching ${rule.id}` });
    return;
  }
  if (base !== "package.json") return;
  let json;
  try { json = JSON.parse(text); } catch { fail("INVALID_PACKAGE_JSON"); }
  if (!json || typeof json !== "object" || Array.isArray(json)) fail("INVALID_PACKAGE_JSON");
    const packages = new Set();
    for (const group of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const value = json[group];
      if (value && typeof value === "object" && !Array.isArray(value)) for (const name of Object.keys(value)) packages.add(name);
    }
    for (const pkg of packages) for (const rule of SERVICE_RULES) if (rule.packagePatterns?.some(re => re.test(pkg))) addEvidence(store, rule, { path: normalize(rel), kind: "package", detail: `package dependency matching ${rule.id}` });
}

export function scanRepository(rootInput, options = {}, sharedGuard) {
  const root = repositoryRoot(rootInput);
  const guard = sharedGuard ?? snapshotGuard(root);
  const limits = { ...LIMITS };
  for (const [key, value] of Object.entries(options.limits ?? {})) {
    if (!Object.hasOwn(limits, key) || !Number.isInteger(value) || value < 1 || value > LIMITS[key]) fail("INVALID_RESOURCE_LIMIT");
    limits[key] = value;
  }
  const started = performance.now();
  const checkTime = () => { if (performance.now() - started > limits.milliseconds) fail("SCAN_TIME_LIMIT"); };
  const services = new Map();
  services.seen = new Set(); services.limit = limits.evidence;
  const envVars = new Map();
  const skippedSensitiveFiles = [];
  const warnings = [];
  let currentPath = ".";
  let scannedFiles = 0, candidateBytes = 0;

  try {
  currentPath = ".git/index";
  checkGitRepresentation(root, guard, options.workspace);
  currentPath = ".";
  for (const rel of walk(root, limits, checkTime, rel => { currentPath = normalize(rel) || "."; }, guard)) {
    const normalized = normalize(rel);
    const full = path.join(root, rel);
    if (isSensitivePath(full)) { skippedSensitiveFiles.push(safeText(normalized)); continue; }
    for (const rule of SERVICE_RULES) if (rule.filePatterns?.some(re => re.test(normalized))) addEvidence(services, rule, { path: normalized, kind: rule.id === "github-actions" ? "workflow" : "file", detail: "matching operational file" });
    const ext = path.extname(rel).toLowerCase();
    const base = path.basename(rel).toLowerCase();
    const envTemplate = ENV_TEMPLATES.has(base);
    const dependencyTextFile = /^requirements(?:-[^.]+)?\.txt$/.test(base);
    if ((!TEXT_EXTENSIONS.has(ext) && base !== "dockerfile" && base !== "procfile" && !envTemplate) || ([".md", ".txt"].includes(ext) && !dependencyTextFile)) continue;

    if (++scannedFiles > limits.candidates) fail("CANDIDATE_COUNT_LIMIT");
    const { text, bytes } = readBounded(root, full, limits.fileBytes, limits.totalBytes - candidateBytes, guard);
    candidateBytes += bytes;
    const lineFor = lineLookup(text);
    inspectPackages(rel, text, services);
    const detectionEligible = envTemplate || dependencyTextFile || ![".md", ".txt"].includes(ext);
    const extractedEnv = detectionEligible ? extractEnvNames(text, envTemplate) : [];
    let matches = 0;

    for (const env of extractedEnv) {
      checkTime();
      if (++matches > limits.evidence) fail("ENV_MATCH_COUNT_LIMIT");
      const key = `${env.name}|${normalized}`;
      if (env.name.length > 128) fail("ENV_NAME_LENGTH_LIMIT");
      if (!envVars.has(key)) {
        if (envVars.size >= limits.evidence) fail("EVIDENCE_COUNT_LIMIT");
        envVars.set(key, { name: env.name, path: safeText(normalized), line: lineFor(env.index) });
      }
      for (const rule of SERVICE_RULES) if (rule.envPatterns?.some(re => re.test(env.name))) addEvidence(services, rule, { path: normalized, kind: "env", detail: `environment variable name: ${env.name}`, line: lineFor(env.index) });
    }

    for (const rule of SERVICE_RULES) {
      if (!detectionEligible) continue;
      if (rule.id === "scheduled-jobs" && !/(^|\/)\.github\/workflows\/[^/]+\.(yml|yaml)$/i.test(normalized) && !/(^|\/)vercel\.json$/i.test(normalized)) continue;
      for (const regex of rule.contentPatterns ?? []) {
        const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
        const match = new RegExp(regex.source, flags).exec(text);
        if (match?.index != null) addEvidence(services, rule, { path: normalized, kind: "content", detail: `matched signature: /${regex.source}/`, line: lineFor(match.index) });
      }
    }
    checkTime();
  }
  if (!sharedGuard) guard.verify(checkTime);
  } catch (error) { warnings.push({ code: safeError(error), path: safeText(currentPath) }); }

  const findings = [...services.values()].map(finding => ({ ...finding, confidence: confidenceFor(finding.evidence) })).sort((a, b) => a.id.localeCompare(b.id));
  return {
    root: ".",
    complete: warnings.length === 0,
    warnings,
    candidateBytes,
    services: findings,
    envVars: [...envVars.values()].sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)),
    skippedSensitiveFiles: skippedSensitiveFiles.sort(),
    scannedFiles
  };
}
