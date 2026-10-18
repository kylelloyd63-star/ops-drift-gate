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
  { id: "assigned-secret", pattern: /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password)[ \t]*[:=][ \t]*(["'])([^"']{16,})\1/i }
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
  const homes = "(?:" + "home" + "|" + "Users" + ")";
  const home = new RegExp(prefix + "/" + homes + "/", "g");
  const tilde = new RegExp(prefix + "~(?:\\/|[A-Za-z0-9._-]+\\/)", "g");
  return [windows, home, tilde];
}
function pathIndex(match) {
  const raw = match[0];
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("/") || raw.startsWith("~")) return match.index;
  return match.index + 1;
}
function acceptedPath(text, index) {
  const rest = text.slice(index);
  if (/^[A-Za-z]:[\\/]/.test(rest)) return true;
  if (/^~(?:\/|[A-Za-z0-9._-]+\/)/.test(rest)) return true;
  const match = new RegExp("^/(" + "home" + "|" + "Users" + ")/([^/\\s\"'`\\\\)]*)").exec(rest);
  if (!match) return false;
  return !(match[1] === "home" && match[2] === "web_user");
}
function ignoredSecret(value) {
  if (/^(?:x+|changeme|placeholder|example|redacted|todo|fake|dummy|password|secret)$/i.test(value) || /^your[-_]/i.test(value)) return true;
  const stripped = value.replace(/\$\{\{\s*(?:secrets|vars)\.[^}]*\}\}/g, "").trim();
  return stripped.length === 0;
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
      if (rule.id === "assigned-secret" && ignoredSecret(match[2] ?? "")) continue;
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
