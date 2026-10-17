const PERSONAL_DOMAINS = Object.freeze([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com",
  "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "msn.com"
]);

const SECRET_RULES = Object.freeze([
  { rule: "aws-access-key-id", pattern: /AKIA[0-9A-Z]{16}/ },
  { rule: "github-token", pattern: /ghp_[A-Za-z0-9]{36}/ },
  { rule: "github-fine-grained-pat", pattern: /github_pat_[A-Za-z0-9_]{22,}/ },
  { rule: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { rule: "stripe-live-secret", pattern: /sk_live_[0-9a-zA-Z]{16,}/ },
  { rule: "npm-token", pattern: /npm_[A-Za-z0-9]{36}/ },
  { rule: "google-api-key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { rule: "private-key", pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ }
]);

const LOCAL_PATH_RULES = Object.freeze([
  { rule: "unix-home", pattern: /(?:^|[\s"'`=(])\/home\/[A-Za-z0-9._-]+/ },
  { rule: "macos-users", pattern: /(?:^|[\s"'`=(])\/Users\/[A-Za-z0-9._-]+/ },
  { rule: "windows-drive", pattern: /(?:^|[\s"'`=(])[A-Za-z]:\\{1,2}[A-Za-z0-9._-]+/ },
  { rule: "windows-drive-forward", pattern: /(?:^|[\s"'`=(])[A-Za-z]:\/[A-Za-z0-9._-]+/ }
]);

function visit(text, pattern, emit, kind, rule, lineFor) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  let count = 0;
  for (const match of text.matchAll(regex)) {
    if (match.index == null) continue;
    emit({ kind, rule, line: lineFor(match.index) });
    if (++count >= 50) return;
  }
}

export function inspectHygiene(text, lineFor, emit) {
  for (const item of SECRET_RULES) visit(text, item.pattern, emit, "secret", item.rule, lineFor);
  for (const domain of PERSONAL_DOMAINS) {
    const escaped = domain.replace(/\./g, "\\.");
    visit(text, new RegExp(`(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@${escaped}(?![A-Za-z0-9.-])`, "i"), emit, "personal-email", domain, lineFor);
  }
  for (const item of LOCAL_PATH_RULES) visit(text, item.pattern, emit, "local-path", item.rule, lineFor);
}
