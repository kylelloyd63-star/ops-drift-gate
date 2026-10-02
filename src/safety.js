import fs from "node:fs";
import path from "node:path";

export const LIMITS = Object.freeze({ entries: 100000, candidates: 10000, fileBytes: 1048576, totalBytes: 268435456, depth: 64, evidence: 20000, ignoreChecks: 1000000, ignoreMatches: 20000, manifestBytes: 262144, manifestKeys: 10000, manifestDepth: 16, text: 2048, path: 4096, milliseconds: 30000 });
export class SafetyError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function fail(code) { throw new SafetyError(code); }
export function safeError(error) { return error instanceof SafetyError ? error.code : "SCAN_OR_CONFIGURATION_ERROR"; }
export function safeText(value) {
  return String(value).replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`).replace(/::/g, ": :");
}
export function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
export function isSensitivePath(value) {
  const normalized = value.split(path.sep).join("/");
  const base = path.basename(value).toLowerCase();
  if (/(^|\/)(secrets?|credentials?)(\.|\/|$)/i.test(normalized) || /\.(pem|p12|pfx|key|keystore)$/i.test(base)) return true;
  if (/(^|\/)\.docker\/config\.json$/i.test(normalized)) return true;
  if (/(^|\/)(?:auth\.json|application_default_credentials\.json|service[-_]?account[^/]*\.json|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|dsa|ecdsa|ed25519))$/i.test(normalized)) return true;
  if (base.startsWith(".env")) return ![".env.example", ".env.sample", ".env.template"].includes(base);
  return false;
}
export function inputPath(value) {
  if (typeof value !== "string" || !value.trim() || value.length > LIMITS.path || /[\x00-\x1f\x7f]/.test(value)) fail("INVALID_PATH_INPUT");
  // Do not let Windows drive, UNC, device, or alternate stream syntax acquire different meaning on another runner.
  if (process.platform !== "win32" && /[\\:]/.test(value)) fail("INVALID_PATH_INPUT");
  if (process.platform === "win32" && (value.startsWith("\\\\") || /:/.test(value.replace(/^[A-Za-z]:[\\/]/, "")))) fail("INVALID_PATH_INPUT");
  return value;
}
export function checkedPath(root, target, guard) {
  if (!within(root, target)) fail("PATH_OUTSIDE_ROOT");
  let current = root;
  const pieces = path.relative(root, target).split(path.sep).filter(Boolean);
  for (const piece of ["", ...pieces]) {
    if (piece) current = path.join(current, piece);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail("SYMLINK_OR_JUNCTION");
    if (!within(root, fs.realpathSync.native(current))) fail("PATH_OUTSIDE_ROOT");
    guard?.observe(current, stat, root);
  }
  const stat = fs.lstatSync(target);
  guard?.observe(target, stat, root);
  return stat;
}
export function repositoryRoot(value, workspace) {
  inputPath(value);
  const boundary = workspace ? fs.realpathSync.native(inputPath(workspace)) : null;
  const resolved = path.resolve(boundary ?? process.cwd(), value);
  // Inspect the original spelling before canonicalization so an in-bound symlink cannot hide behind realpath.
  let current = path.parse(resolved).root;
  for (const component of path.relative(current, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fs.lstatSync(current).isSymbolicLink()) fail("SYMLINK_OR_JUNCTION");
  }
  const root = fs.realpathSync.native(resolved);
  if (boundary) checkedPath(boundary, root);
  if (!fs.statSync(root).isDirectory()) fail("INVALID_SCAN_ROOT");
  if (isSensitivePath(root)) fail("SENSITIVE_SCAN_ROOT");
  return root;
}
function sameFile(a, b) { return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs; }
// Detect observed mutations across the entire audit, including a manifest or file read earlier.
// This records versions; it is not an atomic filesystem sandbox against an active writer.
export function snapshotGuard(root) {
  const versions = new Map(), started = performance.now();
  const guard = {
    observe(file, stat, boundary) {
      const previous = versions.get(file);
      if (previous && (!sameFile(previous.stat, stat) || previous.stat.mode !== stat.mode || previous.stat.nlink !== stat.nlink)) fail("FILESYSTEM_CHANGED");
      if (!previous) {
        if (versions.size > LIMITS.entries + LIMITS.depth) fail("ENTRY_COUNT_LIMIT");
        versions.set(file, { stat, boundary });
      }
    },
    verify(checkTime = () => { if (performance.now() - started > LIMITS.milliseconds) fail("SCAN_TIME_LIMIT"); }) {
      for (const [file, version] of versions) { checkTime(); checkedPath(version.boundary, file, guard); }
    }
  };
  checkedPath(root, root, guard);
  return guard;
}
export function readBytesBounded(root, file, maximum, remaining = Infinity, guard) {
  const before = checkedPath(root, file, guard);
  if (!before.isFile() || before.nlink !== 1) fail("UNSAFE_FILE_TYPE_OR_HARDLINK");
  if (before.size > maximum) fail("FILE_SIZE_LIMIT");
  if (before.size > remaining) fail("TOTAL_BYTES_LIMIT");
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const opened = fs.fstatSync(descriptor);
    if (!sameFile(before, opened)) fail("FILESYSTEM_CHANGED");
    checkedPath(root, file, guard);
    // Linux can verify the opened object independently of a raced pathname before any content read.
    if (process.platform === "linux" && !within(root, fs.realpathSync.native(`/proc/self/fd/${descriptor}`))) fail("PATH_OUTSIDE_ROOT");
    const data = Buffer.alloc(opened.size + 1);
    let count = 0, bytes;
    while (count < data.length && (bytes = fs.readSync(descriptor, data, count, data.length - count, null)) > 0) count += bytes;
    if (count !== opened.size || !sameFile(opened, fs.fstatSync(descriptor)) || !sameFile(opened, checkedPath(root, file, guard))) fail("FILESYSTEM_CHANGED");
    return { data: data.subarray(0, count), bytes: count };
  } finally { fs.closeSync(descriptor); }
}
export function readBounded(root, file, maximum, remaining = Infinity, guard) {
  const { data, bytes } = readBytesBounded(root, file, maximum, remaining, guard);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { fail("INVALID_UTF8"); }
  if (text.includes("\0")) fail("NUL_IN_TEXT");
  return { text, bytes };
}
