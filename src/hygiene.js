const PERSONAL_DOMAINS = [
  ["gmail", "com"], ["googlemail", "com"], ["yahoo", "com"], ["hotmail", "com"], ["outlook", "com"],
  ["live", "com"], ["icloud", "com"], ["me", "com"], ["aol", "com"], ["proton", "me"], ["protonmail", "com"]
].map(parts => parts.join("."));

const SECRET_RULES = [
  { id: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
  { id: "github-token", pattern: /ghp_[A-Za-z0-9]{36}/ },
  { id: "github-fine-grained-token", pattern: /github_pat_[A-Za-z0-9_]{20,}/ },
  { id: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: "stripe-live-key", pattern: /sk_live_[A-Za-z0-9]{16,}/ },
  { id: "private-key", pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { id: "assigned-secret", pattern: /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password)[ \t]*[:=][ \t]*(?:"([^"]{16,})"|'([^']{16,})')/i }
];

function fresh(pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}
function personalEmailPattern() {
  const domains = PERSONAL_DOMAINS.map(domain => domain.replace(/[.]/g, "\\.")).join("|");
  return new RegExp("(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@(?:${domains})(?![A-Za-z0-9-])(?!\\.[A-Za-z0-9])".replace("${domains}", domains), "gi");
}
function localPathPatterns() {
  const prefix = "(?:^|[\\s\"'`(:=])";
  const windows = new RegExp(prefix + "[A-Za-z]:[\\\\/]", "g");
  const homes = "(?:" + ["home", "Users", "root"].join("|") + ")";
  const segment = "[^/\\s\"'`\\\\)]";
  const home = new RegExp(prefix + "/" + homes + "/" + segment, "g");
  return [windows, home];
}
function pathIndex(match) {
  const raw = match[0];
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("/")) return match.index;
  return match.index + 1;
}
function pathChar(text, index) {
  return index >= 0 && index < text.length ? text[index] : "";
}
function acceptedPath(text, index) {
  const drive = pathChar(text, index);
  const colon = pathChar(text, index + 1);
  const slash = pathChar(text, index + 2);
  if (/[A-Za-z]/.test(drive) && colon === ":" && (slash === "\\" || slash === "/")) {
    let cursor = index + 3;
    if (slash === "\\" && text[cursor] === "\\") cursor++;
    let length = 0;
    while (cursor < text.length) {
      const ch = text[cursor];
      if (ch === "\\" || ch === "/" || ch === ")" || ch === "\"" || ch === "'" || ch === "`" || /\s/.test(ch)) break;
      length++;
      if (length >= 2) return true;
      cursor++;
    }
    return false;
  }
  if (pathChar(text, index) !== "/") return false;
  let cursor = index + 1;
  let name = "";
  while (cursor < text.length && text[cursor] !== "/") {
    name += text[cursor];
    if (name.length > 8) return false;
    cursor++;
  }
  if (text[cursor] !== "/") return false;
  if (name !== "home" && name !== "Users" && name !== "root") return false;
  cursor++;
  let segment = "";
  while (cursor < text.length) {
    const ch = text[cursor];
    if (ch === "/" || ch === "\\" || ch === ")" || ch === "\"" || ch === "'" || ch === "`" || /\s/.test(ch)) break;
    segment += ch;
    if (segment.length > 64) break;
    cursor++;
  }
  if (!segment) return false;
  if (name === "home" && (segment === "web_user" || segment === "runner")) return false;
  return !webAttributePath(text, index, name);
}
function webAttributePath(text, index, name) {
  if (name !== "home" && name !== "root") return false;
  let cursor = index - 1;
  if (cursor >= 0 && (text[cursor] === "\"" || text[cursor] === "'" || text[cursor] === "`")) cursor--;
  while (cursor >= 0 && (text[cursor] === " " || text[cursor] === "\t")) cursor--;
  if (cursor >= 0 && text[cursor] === "{") {
    cursor--;
    while (cursor >= 0 && (text[cursor] === " " || text[cursor] === "\t")) cursor--;
  }
  if (cursor >= 0 && text[cursor] === "(") {
    cursor--;
    while (cursor >= 0 && (text[cursor] === " " || text[cursor] === "\t")) cursor--;
    return text[cursor] === "]";
  }
  if (cursor < 0 || text[cursor] !== "=") return false;
  cursor--;
  while (cursor >= 0 && (text[cursor] === " " || text[cursor] === "\t")) cursor--;
  let attr = "";
  while (cursor >= 0 && /[A-Za-z-]/.test(text[cursor]) && attr.length < 24) {
    attr = text[cursor] + attr;
    cursor--;
  }
  const lower = attr.toLowerCase();
  return lower === "href" || lower === "action";
}
function onlyActionsExpressions(value) {
  let index = 0;
  while (index < value.length && /\s/.test(value[index])) index++;
  if (index >= value.length) return false;
  let nextClose = value.indexOf("}}");
  while (index < value.length) {
    if (value.startsWith("${{", index)) {
      if (nextClose < index) {
        if (nextClose < 0) return false;
        nextClose = value.indexOf("}}", index);
      }
      if (nextClose < 0 || nextClose - index > 256) return false;
      const expr = value.slice(index + 3, nextClose);
      if (!/^\s*(?:secrets|vars)\.[A-Za-z0-9_]+(?:\s*\|\|\s*(?:secrets|vars)\.[A-Za-z0-9_]+)*\s*$/.test(expr)) return false;
      index = nextClose + 2;
      nextClose = value.indexOf("}}", index);
      while (index < value.length && /\s/.test(value[index])) index++;
      continue;
    }
    if (/\s/.test(value[index])) { index++; continue; }
    return false;
  }
  return true;
}
function ignoredSecret(value) {
  if (/^(?:x+|changeme|placeholder|example|redacted|todo|fake|dummy|password|secret)$/i.test(value) || /^your[-_]/i.test(value)) return true;
  if (value.trim().length === 0) return true;
  return onlyActionsExpressions(value);
}
function push(findings, seen, check, rule, path, line) {
  const key = `${check}\0${rule}\0${path}\0${line}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ check, rule, path, line });
}

export function collectHygiene(text, path, lineFor, checkTime, options = {}) {
  const findings = [];
  const seen = new Set();
  let steps = 0;
  const tick = () => { if ((steps++ & 127) === 0) checkTime?.(); };
  for (const rule of SECRET_RULES) {
    tick();
    for (const match of text.matchAll(fresh(rule.pattern))) {
      tick();
      if (match.index == null) continue;
      if (rule.id === "assigned-secret" && ignoredSecret(match[1] ?? match[2] ?? "")) continue;
      push(findings, seen, "secret", rule.id, path, lineFor(match.index));
    }
  }
  tick();
  for (const match of text.matchAll(personalEmailPattern())) {
    tick();
    if (match.index == null) continue;
    push(findings, seen, "personal-email", "personal-email", path, lineFor(match.index));
  }
  if (options.skipLocalPaths !== true) for (const pattern of localPathPatterns()) {
    tick();
    for (const match of text.matchAll(pattern)) {
      tick();
      if (match.index == null) continue;
      const index = pathIndex(match);
      if (!acceptedPath(text, index)) continue;
      push(findings, seen, "local-path", "local-path", path, lineFor(index));
    }
  }
  return findings;
}
