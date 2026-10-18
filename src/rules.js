const host = name => new RegExp("(?<![A-Za-z0-9-])" + name.replace(/[.]/g, "\\.") + "(?![A-Za-z0-9.-])", "i");
const token = (...parts) => new RegExp("\\b" + parts.join("") + "\\b", "i");
const TAG_CAP = 4096;
const HOSTING_CONFIG = /(^|\/)(?:netlify\.toml|wrangler\.(?:toml|jsonc?)|vercel\.json|firebase\.json)$/i;
const WRANGLER_CONFIG = /(^|\/)wrangler\.(?:toml|jsonc?)$/i;

const PUBLIC_NPM = "registry.npmjs" + ".org";

function registryUrlPattern() {
  return new RegExp("\\bregistry-url[ \\t]*:[ \\t]*[^\\s\"'`]{0,200}" + PUBLIC_NPM.replace(/[.]/g, "\\.") + "(?![A-Za-z0-9.-])", "i");
}

export function isPublicNpmRegistry(value) {
  const raw = String(value).trim().replace(/^['"`]|['"`]$/g, "");
  if (!raw) return false;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw;
  try { return new URL(withScheme).hostname.toLowerCase() === PUBLIC_NPM; }
  catch { return false; }
}

export const SERVICE_RULES = [
    {id:"vercel",name:"Vercel",category:"hosting",filePatterns:[/(^|\/)vercel\.json$/i],packagePatterns:[/^@vercel\//i],contentPatterns:[/\bvercel\.app\b/i],envPatterns:[/^VERCEL_/i]},
    {id:"supabase",name:"Supabase",category:"backend/database",filePatterns:[/(^|\/)supabase\/config\.toml$/i],packagePatterns:[/^@supabase\/supabase-js$/i],contentPatterns:[/\.supabase\.co\b/i],envPatterns:[/SUPABASE/i]},
    {id:"stripe",name:"Stripe",category:"payments",packagePatterns:[/^stripe$/i,/^@stripe\//i],contentPatterns:[/\bapi\.stripe\.com\b/i,/\bnew\s+Stripe\s*\(/i],envPatterns:[/^STRIPE_/i]},
    {id:"resend",name:"Resend",category:"email",packagePatterns:[/^resend$/i],contentPatterns:[/\bapi\.resend\.com\b/i,/\bnew\s+Resend\s*\(/i],envPatterns:[/^RESEND_/i]},
    {id:"twilio",name:"Twilio",category:"communications",packagePatterns:[/^twilio$/i],contentPatterns:[/\bapi\.twilio\.com\b/i],envPatterns:[/^TWILIO_/i]},
    {id:"firebase",name:"Firebase",category:"backend/hosting",filePatterns:[/(^|\/)firebase\.json$/i,/(^|\/)\.firebaserc$/i],packagePatterns:[/^firebase$/i,/^firebase-admin$/i,/^firebase_admin$/i],contentPatterns:[/\bfirebaseapp\.com\b/i],envPatterns:[/FIREBASE/i]},
    {id:"aws",name:"Amazon Web Services",category:"cloud",packagePatterns:[/^@aws-sdk\//i,/^aws-sdk$/i,/^boto3$/i],contentPatterns:[/\bamazonaws\.com\b/i],envPatterns:[/^AWS_/i]},
    {id:"cloudflare",name:"Cloudflare",category:"dns/edge",filePatterns:[/(^|\/)wrangler\.(toml|jsonc?)$/i],packagePatterns:[/^wrangler$/i,/^@cloudflare\//i],contentPatterns:[/\bworkers\.dev\b/i],envPatterns:[/^CLOUDFLARE_/i,/^CF_API_/i]},
    {id:"cloudflare-pages",name:"Cloudflare Pages",category:"hosting",hostPatterns:[host("pages" + ".dev")],workflowPatterns:[/\bwrangler[ \t]+pages\b/i, /cloudflare\/pages-action\b/i],configFiles:WRANGLER_CONFIG,configPatterns:[token("pages", "_", "build", "_", "output", "_", "dir")]},
    {id:"netlify",name:"Netlify",category:"hosting",filePatterns:[/(^|\/)netlify\.toml$/i],packagePatterns:[/^netlify$/i,/^netlify-cli$/i],contentPatterns:[host("netlify" + ".app")],envPatterns:[/^NETLIFY_/i]},
    {id:"github-pages",name:"GitHub Pages",category:"hosting",filePatterns:[/(^|\/)CNAME$/,/(^|\/)\.nojekyll$/i],workflowPatterns:[/actions\/(?:deploy-pages|upload-pages-artifact|configure-pages)\b/i,/peaceiris\/actions-gh-pages\b/i,/jamesives\/github-pages-deploy-action\b/i]},
    {id:"custom-domain",name:"Custom Domain",category:"dns",filePatterns:[/(^|\/)CNAME$/],configFiles:HOSTING_CONFIG,configPatterns:[token("custom", "_", "domain"), token("custom", "Domain")]},
    {id:"sentry",name:"Sentry",category:"observability",packagePatterns:[/^@sentry\//i,/^sentry-sdk$/i],contentPatterns:[/\bsentry\.io\b/i],envPatterns:[/^SENTRY_/i]},
    {id:"openai",name:"OpenAI API",category:"ai-api",packagePatterns:[/^openai$/i],contentPatterns:[/\bapi\.openai\.com\b/i],envPatterns:[/^OPENAI_/i]},
    {id:"github-actions",name:"GitHub Actions",category:"ci/cd",filePatterns:[/(^|\/)\.github\/workflows\/[^/]+\.(yml|yaml)$/i]},
    {id:"scheduled-jobs",name:"Scheduled Jobs",category:"automation",contentPatterns:[/^[ \t]*schedule[ \t]*:/im,/"crons"[ \t]*:/i]},
    {id:"formsubmit",name:"FormSubmit",category:"forms",formHosts:["formsubmit" + ".co"],hostPatterns:[host("formsubmit" + ".co")]},
    {id:"formspree",name:"Formspree",category:"forms",packagePatterns:[/^@formspree\//i],formHosts:["formspree" + ".io"],hostPatterns:[host("formspree" + ".io")]},
    {id:"netlify-forms",name:"Netlify Forms",category:"forms"},
    {id:"getform",name:"Getform",category:"forms",formHosts:["getform" + ".io"],hostPatterns:[host("getform" + ".io")]},
    {id:"web3forms",name:"Web3Forms",category:"forms",formHosts:["web3forms" + ".com"],hostPatterns:[host("web3forms" + ".com")]},
    {id:"npm",name:"npm Registry",category:"package-registry",packageMarkers:["publishConfig"],workflowPatterns:[registryUrlPattern(), host(PUBLIC_NPM)],contentPatterns:[host(PUBLIC_NPM)]},
    {id:"pypi",name:"PyPI",category:"package-registry",pythonPackagePatterns:[/^twine$/i],workflowPatterns:[/\btwine\s+upload\b/i,/gh-action-pypi-publish\b/i, host("pypi" + ".org")],hostPatterns:[host("upload.pypi" + ".org")],contentPatterns:[host("pypi" + ".org")]}
];

function findTagEnd(lower, openEnd, limit) {
  let quote = "";
  let braces = 0;
  for (let index = openEnd; index < limit; index++) {
    const ch = lower[index];
    if (quote) {
      if (ch === "\\") { index++; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") { braces++; continue; }
    if (ch === "}") { if (braces) braces--; continue; }
    if (ch === ">" && braces === 0) return index;
  }
  return -1;
}
function boundedTags(text, lower, name, checkTime) {
  const needle = "<" + name;
  if (!lower.includes(needle)) return [];
  const hits = [];
  let from = 0;
  let steps = 0;
  let gt = lower.indexOf(">", 0);
  while (from < lower.length) {
    if ((steps++ & 1023) === 0) checkTime?.();
    const start = lower.indexOf(needle, from);
    if (start < 0) break;
    const boundary = lower[start + needle.length];
    if (boundary && boundary !== ">" && boundary !== "/" && !/[\s{]/.test(boundary)) {
      from = start + needle.length;
      continue;
    }
    while (gt !== -1 && gt < start) gt = lower.indexOf(">", gt + 1);
    if (gt === -1) break;
    if (gt - start > TAG_CAP) {
      const next = gt - TAG_CAP;
      from = next > start ? next : start + needle.length;
      continue;
    }
    const end = findTagEnd(lower, start + needle.length, Math.min(lower.length, start + TAG_CAP + 1));
    if (end < 0) { from = Math.min(lower.length, start + TAG_CAP); continue; }
    hits.push({ start, tag: text.slice(start, end + 1), lower: lower.slice(start, end + 1) });
    from = end + 1;
  }
  return hits;
}
function attrValue(tag, lowerTag, name) {
  let from = 0;
  while (from < lowerTag.length) {
    const at = lowerTag.indexOf(name, from);
    if (at < 0) return null;
    const before = at === 0 ? "" : lowerTag[at - 1];
    if (before && !/[\s/<]/.test(before)) { from = at + 1; continue; }
    let index = at + name.length;
    if (lowerTag[index] && !/[\s=/>]/.test(lowerTag[index])) { from = at + 1; continue; }
    while (index < lowerTag.length && /\s/.test(lowerTag[index])) index++;
    if (lowerTag[index] !== "=") { from = at + 1; continue; }
    index++;
    while (index < lowerTag.length && /\s/.test(lowerTag[index])) index++;
    const quote = lowerTag[index];
    if (quote === '"' || quote === "'") {
      const end = lowerTag.indexOf(quote, index + 1);
      return tag.slice(index + 1, end < 0 ? tag.length : end);
    }
    const start = index;
    while (index < lowerTag.length && !/[\s>]/.test(lowerTag[index])) index++;
    return tag.slice(start, index);
  }
  return null;
}
function attrNames(lowerTag) {
  const names = [];
  let index = 0;
  while (index < lowerTag.length && lowerTag[index] !== ">" && !/\s/.test(lowerTag[index])) index++;
  while (index < lowerTag.length) {
    while (index < lowerTag.length && /\s/.test(lowerTag[index])) index++;
    if (index >= lowerTag.length || lowerTag[index] === ">" || lowerTag[index] === "/") break;
    const start = index;
    while (index < lowerTag.length && !/[\s=>/]/.test(lowerTag[index])) index++;
    if (index > start) names.push(lowerTag.slice(start, index));
    if (lowerTag[index] === "=") {
      index++;
      while (index < lowerTag.length && /\s/.test(lowerTag[index])) index++;
      const quote = lowerTag[index];
      if (quote === '"' || quote === "'" || quote === "`") {
        const end = lowerTag.indexOf(quote, index + 1);
        index = end < 0 ? lowerTag.length : end + 1;
      } else if (quote === "{") index = skipBraces(lowerTag, index);
      else while (index < lowerTag.length && !/[\s>]/.test(lowerTag[index])) index++;
    }
  }
  return names;
}
function regexAllowed(text, index) {
  let cursor = index - 1;
  while (cursor >= 0 && (text[cursor] === " " || text[cursor] === "\t")) cursor--;
  if (cursor < 0) return true;
  const ch = text[cursor];
  if (ch === "\n" || ch === "\r" || "([{:;,=!?&|%^~+-<>*".includes(ch)) return true;
  if (!/[A-Za-z0-9_$]/.test(ch)) return false;
  let start = cursor;
  while (start >= 0 && /[A-Za-z0-9_$]/.test(text[start])) start--;
  return /^(?:return|case|throw|else|typeof|void|delete|await|yield|in|of|new|do)$/.test(text.slice(start + 1, cursor + 1));
}
function skipRegex(text, start, limit) {
  let index = start + 1;
  let klass = false;
  while (index < limit) {
    const ch = text[index];
    if (ch === "\\") { index += 2; continue; }
    if (ch === "\n" || ch === "\r") return index;
    if (ch === "[" && !klass) klass = true;
    else if (ch === "]" && klass) klass = false;
    else if (ch === "/" && !klass) {
      index++;
      while (index < limit && /[a-z]/i.test(text[index])) index++;
      return index;
    }
    index++;
  }
  return index;
}
function skipBraces(text, open) {
  let depth = 0;
  let quote = "";
  for (let index = open; index < text.length; index++) {
    const ch = text[index];
    if (quote) {
      if (ch === "\\") { index++; continue; }
      if ((quote === "'" || quote === '"') && (ch === "\n" || ch === "\r")) { quote = ""; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "/" && text[index + 1] === "/") {
      const nl = text.indexOf("\n", index + 2);
      index = nl < 0 ? text.length - 1 : nl;
      continue;
    }
    if (ch === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length - 1 : end + 1;
      continue;
    }
    if (ch === "/" && regexAllowed(text, index)) {
      index = skipRegex(text, index, text.length) - 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}
function hostIn(value, name) {
  const lower = value.toLowerCase();
  const needle = name.toLowerCase();
  let from = 0;
  while (from <= lower.length - needle.length) {
    const at = lower.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : lower[at - 1];
    const after = lower[at + needle.length] ?? "";
    if ((!before || before === "." || !/[a-z0-9-]/.test(before)) && (!after || !/[a-z0-9.-]/.test(after))) return true;
    from = at + 1;
  }
  return false;
}

const ARG_CAP = 800;
const NPM_PUBLISH = /\bnpm(?:[ \t]+stage)?[ \t]+publish\b/;
const MARKUP = /\.(?:html?|vue|svelte)$/i;

function skipQuoted(text, start, limit) {
  const quote = text[start];
  let index = start + 1;
  while (index < limit) {
    if (text[index] === "\\") { index += 2; continue; }
    const ch = text[index];
    if ((quote === "'" || quote === '"') && (ch === "\n" || ch === "\r")) return index;
    if (ch === quote) return index + 1;
    if (quote === "`" && ch === "$" && text[index + 1] === "{") {
      let depth = 1;
      index += 2;
      while (index < limit && depth > 0) {
        if (text[index] === "{") depth++;
        else if (text[index] === "}") depth--;
        index++;
      }
      continue;
    }
    index++;
  }
  return limit;
}
function readQuoted(text, start, limit) {
  const quote = text[start];
  const chars = [];
  let index = start + 1;
  while (index < limit) {
    const ch = text[index];
    if (ch === "\\") {
      if (index + 1 < limit) chars.push(text[index + 1]);
      index += 2;
      continue;
    }
    if ((quote === "'" || quote === '"') && (ch === "\n" || ch === "\r")) return { value: chars.join(""), end: index };
    if (ch === quote) return { value: chars.join(""), end: index + 1 };
    if (quote === "`" && ch === "$" && text[index + 1] === "{") {
      chars.push("$", "{");
      let depth = 1;
      index += 2;
      while (index < limit && depth > 0) {
        chars.push(text[index]);
        if (text[index] === "{") depth++;
        else if (text[index] === "}") depth--;
        index++;
      }
      continue;
    }
    chars.push(ch);
    index++;
  }
  return { value: chars.join(""), end: index };
}
function urlKeyAt(text, index, limit) {
  if (index + 3 > limit) return -1;
  const word = text.slice(index, index + 3);
  if (word !== "url" && word !== "URL") return -1;
  const prev = index === 0 ? "" : text[index - 1];
  if (prev && /[A-Za-z0-9_$]/.test(prev)) return -1;
  let cursor = index + 3;
  if (cursor < limit && /[A-Za-z0-9_$]/.test(text[cursor])) return -1;
  while (cursor < limit && (text[cursor] === " " || text[cursor] === "\t" || text[cursor] === "\n" || text[cursor] === "\r")) cursor++;
  if (text[cursor] !== ":") return -1;
  cursor++;
  while (cursor < limit && (text[cursor] === " " || text[cursor] === "\t" || text[cursor] === "\n" || text[cursor] === "\r")) cursor++;
  const quote = text[cursor];
  if (quote !== "'" && quote !== '"' && quote !== "`") return -1;
  return cursor;
}
function argumentStrings(text, openParen, objectUrl) {
  const limit = Math.min(text.length, openParen + 1 + ARG_CAP);
  const strings = [];
  let index = openParen + 1;
  let depth = 1;
  let arg = 0;
  while (index < limit && depth > 0) {
    const ch = text[index];
    if (ch === "/" && text[index + 1] === "/") {
      const nl = text.indexOf("\n", index + 2);
      index = nl < 0 || nl > limit ? limit : nl + 1;
      continue;
    }
    if (ch === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 || end + 2 > limit ? limit : end + 2;
      continue;
    }
    if (ch === "/" && regexAllowed(text, index)) {
      index = skipRegex(text, index, limit);
      continue;
    }
    if (ch === "," && depth === 1) { arg++; index++; continue; }
    const urlAt = urlKeyAt(text, index, limit);
    if (urlAt >= 0) {
      const parsed = readQuoted(text, urlAt, limit);
      if (objectUrl && arg === 0 && depth === 2) strings.push(parsed.value);
      index = parsed.end;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      const parsed = readQuoted(text, index, limit);
      if (depth === 1) strings.push(parsed.value);
      index = parsed.end;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") { depth++; index++; continue; }
    if (ch === ")" || ch === "}" || ch === "]") { depth--; index++; continue; }
    index++;
  }
  return { strings, end: Math.max(index, openParen + 1) };
}
function parenAfter(text, index) {
  while (index < text.length && (text[index] === " " || text[index] === "\t" || text[index] === "\n" || text[index] === "\r")) index++;
  return text[index] === "(" ? index : -1;
}
function methodParen(text, index, methods) {
  let cursor = index;
  while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t" || text[cursor] === "\n" || text[cursor] === "\r")) cursor++;
  for (const method of methods) {
    if (!text.startsWith(method, cursor)) continue;
    const after = cursor + method.length;
    if (after < text.length && /[A-Za-z0-9_]/.test(text[after])) return -1;
    return parenAfter(text, after);
  }
  return -1;
}
function objectUrlCall(text, index) {
  if (text.startsWith("axios", index)) {
    let cursor = index + 5;
    while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t" || text[cursor] === "\n" || text[cursor] === "\r")) cursor++;
    if (text[cursor] !== ".") return true;
    cursor++;
    while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t" || text[cursor] === "\n" || text[cursor] === "\r")) cursor++;
    return text.startsWith("request", cursor) && !/[A-Za-z0-9_]/.test(text[cursor + 7] || "");
  }
  if (text.startsWith("$.", index)) {
    let cursor = index + 2;
    while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t")) cursor++;
    return text.startsWith("ajax", cursor) && !/[A-Za-z0-9_]/.test(text[cursor + 4] || "");
  }
  return false;
}
function callOpen(text, index) {
  const ch = text[index];
  if (ch !== "f" && ch !== "a" && ch !== "s" && ch !== "$") return -1;
  const prev = index === 0 ? "" : text[index - 1];
  if (prev && /[A-Za-z0-9_$]/.test(prev)) return -1;
  if (ch === "f") return text.startsWith("fetch", index) ? parenAfter(text, index + 5) : -1;
  if (ch === "s") return text.startsWith("sendBeacon", index) ? parenAfter(text, index + 10) : -1;
  if (ch === "$") return text.startsWith("$.", index) ? methodParen(text, index + 2, ["ajax", "post", "get"]) : -1;
  if (!text.startsWith("axios", index)) return -1;
  const direct = parenAfter(text, index + 5);
  if (direct >= 0 && text[index + 5] !== ".") return direct;
  let cursor = index + 5;
  while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t" || text[cursor] === "\n" || text[cursor] === "\r")) cursor++;
  if (text[cursor] !== ".") return -1;
  return methodParen(text, cursor + 1, ["post", "get", "put", "request", "delete"]);
}
function formCallIndexes(text, lower, checkTime) {
  const rules = SERVICE_RULES.filter(rule => rule.formHosts?.length && rule.formHosts.some(name => lower.includes(name.toLowerCase())));
  const found = new Map();
  if (!rules.length) return found;
  if (!lower.includes("fetch") && !lower.includes("axios") && !lower.includes("sendbeacon") && !text.includes("$.")) return found;
  let index = 0;
  let steps = 0;
  while (index < text.length && found.size < rules.length) {
    if ((steps++ & 8191) === 0) checkTime?.();
    const ch = text[index];
    if (ch === "/" && text[index + 1] === "/") {
      const nl = text.indexOf("\n", index + 2);
      index = nl < 0 ? text.length : nl + 1;
      continue;
    }
    if (ch === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 2;
      continue;
    }
    if (ch === "/" && regexAllowed(text, index)) {
      index = skipRegex(text, index, text.length);
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      index = skipQuoted(text, index, text.length);
      continue;
    }
    const open = callOpen(text, index);
    if (open >= 0) {
      const args = argumentStrings(text, open, objectUrlCall(text, index));
      for (const value of args.strings) {
        for (const rule of rules) {
          if (found.has(rule.id)) continue;
          if (rule.formHosts.some(name => hostIn(value, name))) found.set(rule.id, index);
        }
      }
      index = args.end;
      continue;
    }
    index++;
  }
  return found;
}
function formCallIndexesForFile(text, lower, checkTime, filePath) {
  if (!MARKUP.test(filePath || "")) return formCallIndexes(text, lower, checkTime);
  const found = new Map();
  let from = 0;
  while (from < lower.length) {
    const start = lower.indexOf("<script", from);
    if (start < 0) break;
    const boundary = lower[start + 7];
    if (boundary && boundary !== ">" && boundary !== "/" && !/\s/.test(boundary)) { from = start + 7; continue; }
    const open = lower.indexOf(">", start);
    if (open < 0) break;
    const close = lower.indexOf("</script", open + 1);
    const end = close < 0 ? lower.length : close;
    const slice = text.slice(open + 1, end);
    const part = formCallIndexes(slice, slice.toLowerCase(), checkTime);
    for (const [id, index] of part) if (!found.has(id)) found.set(id, open + 1 + index);
    if (close < 0) break;
    from = close + 8;
  }
  return found;
}
function leadingCount(text, start, end) {
  let index = start;
  while (index < end && (text[index] === " " || text[index] === "\t")) index++;
  return index - start;
}
function blankLine(text, start, end) {
  let index = start;
  while (index < end && (text[index] === " " || text[index] === "\t" || text[index] === "\r")) index++;
  return index === end;
}
function commentLine(text, start, end) {
  let index = start;
  while (index < end && (text[index] === " " || text[index] === "\t")) index++;
  return text[index] === "#";
}
function jobsLine(text, start, end) {
  let index = start;
  while (index < end && (text[index] === " " || text[index] === "\t")) index++;
  if (!text.startsWith("jobs", index)) return false;
  index += 4;
  while (index < end && (text[index] === " " || text[index] === "\t")) index++;
  return text[index] === ":";
}
function mappingKey(text, start, end) {
  let index = start;
  while (index < end && (text[index] === " " || text[index] === "\t")) index++;
  if (text[index] === "-") return false;
  const keyStart = index;
  while (index < end && /[A-Za-z0-9_-]/.test(text[index])) index++;
  if (index === keyStart) return false;
  while (index < end && (text[index] === " " || text[index] === "\t")) index++;
  return text[index] === ":";
}
function listIndent(text, start, end) {
  let index = start;
  while (index < end && (text[index] === " " || text[index] === "\t")) index++;
  if (text[index] !== "-") return -1;
  const next = text[index + 1];
  if (next !== " " && next !== "\t") return -1;
  return index - start;
}
function readCommand(text, start, end) {
  const parts = [text.slice(start, end)];
  let cursor = end;
  let extra = 0;
  while (/\\[ \t]*$/.test(parts[parts.length - 1]) && extra < 4) {
    if (cursor >= text.length || text[cursor] !== "\n") break;
    const nextStart = cursor + 1;
    let nextEnd = text.indexOf("\n", nextStart);
    if (nextEnd < 0) nextEnd = text.length;
    parts.push(text.slice(nextStart, nextEnd));
    cursor = nextEnd;
    extra++;
  }
  return { command: parts.join("\n"), next: cursor < text.length ? cursor + 1 : text.length + 1 };
}
function lineIndent(line) {
  let index = 0;
  while (index < line.length && (line[index] === " " || line[index] === "\t")) index++;
  return index;
}
function stepField(line) {
  let index = 0;
  while (index < line.length && (line[index] === " " || line[index] === "\t")) index++;
  if (line[index] === "-" && (line[index + 1] === " " || line[index + 1] === "\t")) {
    index++;
    while (index < line.length && (line[index] === " " || line[index] === "\t")) index++;
  }
  if (line[index] === "#") return null;
  const start = index;
  while (index < line.length && /[A-Za-z0-9_-]/.test(line[index])) index++;
  if (index === start) return null;
  const name = line.slice(start, index);
  while (index < line.length && (line[index] === " " || line[index] === "\t")) index++;
  if (line[index] !== ":") return null;
  return { name, indent: start, value: line.slice(index + 1) };
}
function yamlScalar(raw) {
  let index = 0;
  while (index < raw.length && (raw[index] === " " || raw[index] === "\t")) index++;
  const quote = raw[index];
  if (quote === '"' || quote === "'") {
    const end = raw.indexOf(quote, index + 1);
    return raw.slice(index + 1, end < 0 ? raw.length : end);
  }
  let end = index;
  while (end < raw.length) {
    if (raw[end] === "#" && (end === index || /\s/.test(raw[end - 1]))) break;
    end++;
  }
  while (end > index && /\s/.test(raw[end - 1])) end--;
  return raw.slice(index, end);
}
function blockMarker(value) {
  let index = 0;
  while (index < value.length && (value[index] === " " || value[index] === "\t")) index++;
  const start = index;
  while (index < value.length && value[index] !== " " && value[index] !== "\t" && value[index] !== "#") index++;
  const token = value.slice(start, index);
  return token === "|" || token === ">" || token === "|-" || token === ">-" || token === "|+" || token === ">+";
}
function wranglerPages(lines) {
  let withIndent = -1;
  let capture = null;
  const matched = value => /\bpages[ \t]+deploy\b/i.test(value);
  for (const line of lines) {
    if (/^[ \t]*#/.test(line)) continue;
    const indent = lineIndent(line);
    if (capture) {
      if (line.trim() && indent <= capture.indent) {
        if (matched(capture.text)) return true;
        capture = null;
      } else {
        const piece = yamlScalar(line);
        if (piece) capture.text += "\n" + piece;
        continue;
      }
    }
    const field = stepField(line);
    if (!field) continue;
    if (field.name === "with") { withIndent = field.indent; continue; }
    if (withIndent >= 0 && field.indent <= withIndent) withIndent = -1;
    if (field.name !== "command" || withIndent < 0 || field.indent <= withIndent) continue;
    if (blockMarker(field.value)) capture = { indent, text: "" };
    else if (matched(yamlScalar(field.value))) return true;
  }
  return Boolean(capture && matched(capture.text));
}
function boundaryBefore(text, index) {
  return index === 0 || /\s/.test(text[index - 1]);
}
function flagEnd(text, index) {
  return index >= text.length || /[\s=]/.test(text[index]);
}
function readFlagValue(text, index) {
  while (index < text.length && (text[index] === " " || text[index] === "\t")) index++;
  if (index >= text.length) return { value: "", next: index };
  const quote = text[index];
  if (quote === "'" || quote === '"') {
    const end = text.indexOf(quote, index + 1);
    if (end < 0) return { value: text.slice(index + 1), next: text.length };
    return { value: text.slice(index + 1, end), next: end + 1 };
  }
  let end = index;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return { value: text.slice(index, end), next: end };
}
function stripShellComment(command) {
  let quote = "";
  for (let index = 0; index < command.length; index++) {
    const ch = command[index];
    if (quote) {
      if (ch === "\\") { index++; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === "#") return command.slice(0, index);
  }
  return command;
}
function flagEnabled(command, index) {
  if (command[index] !== "=") return { enabled: true, next: index };
  const token = readFlagValue(command, index + 1);
  return { enabled: token.value !== "false", next: token.next };
}
function publishScope(command, checkTime) {
  const names = [];
  let all = false;
  let includeRoot = false;
  let index = 0;
  let steps = 0;
  while (index < command.length) {
    if ((steps++ & 8191) === 0) checkTime?.();
    if (!boundaryBefore(command, index)) { index++; continue; }
    if (command.startsWith("--include-workspace-root", index) && flagEnd(command, index + 24)) {
      const flag = flagEnabled(command, index + 24);
      if (flag.enabled) includeRoot = true;
      index = flag.next;
      continue;
    }
    if (command.startsWith("--workspaces", index) && flagEnd(command, index + 12)) {
      const flag = flagEnabled(command, index + 12);
      if (flag.enabled) all = true;
      index = flag.next;
      continue;
    }
    if (command.startsWith("--workspace", index) && flagEnd(command, index + 11)) {
      index += 11;
      if (command[index] === "=") index++;
      const token = readFlagValue(command, index);
      if (token.value) names.push(token.value);
      index = token.next;
      continue;
    }
    if (command.startsWith("-ws", index) && flagEnd(command, index + 3)) {
      const flag = flagEnabled(command, index + 3);
      if (flag.enabled) all = true;
      index = flag.next;
      continue;
    }
    if (command.startsWith("-w", index) && flagEnd(command, index + 2)) {
      index += 2;
      if (command[index] === "=") index++;
      const token = readFlagValue(command, index);
      if (token.value) names.push(token.value);
      index = token.next;
      continue;
    }
    index++;
  }
  return { all, includeRoot, names };
}
function cleanToken(token) {
  return String(token).replace(/^['"]|['"]$/g, "").replace(/^\.\//, "").replace(/\/$/, "");
}
const GLOB_LIMIT = 16;
function splitGlob(value) {
  const parts = [];
  for (const part of String(value).replace(/^\.\//, "").split("/")) {
    if (!part) continue;
    if (part === "**" && parts[parts.length - 1] === "**") continue;
    parts.push(part);
    if (parts.length > GLOB_LIMIT) return null;
  }
  return parts;
}
function segmentMatch(pattern, text) {
  if (pattern === "*") return true;
  if (!pattern.includes("*") && !pattern.includes("?")) return pattern === text;
  let pi = 0;
  let ti = 0;
  let star = -1;
  let mark = 0;
  while (ti < text.length) {
    const ch = pattern[pi];
    if (pi < pattern.length && (ch === "?" || ch === text[ti])) {
      pi++;
      ti++;
    } else if (pi < pattern.length && ch === "*") {
      star = pi;
      mark = ti;
      pi++;
    } else if (star !== -1) {
      pi = star + 1;
      mark++;
      ti = mark;
    } else return false;
  }
  while (pi < pattern.length && pattern[pi] === "*") pi++;
  return pi === pattern.length;
}
function matchParts(parts, dir) {
  const dirs = splitGlob(dir);
  if (!dirs) return false;
  const n = parts.length;
  const m = dirs.length;
  const width = m + 1;
  const cells = new Uint8Array((n + 1) * width);
  cells[0] = 1;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (!cells[i * width + j] || i === n) continue;
      const part = parts[i];
      if (part === "**") {
        cells[(i + 1) * width + j] = 1;
        if (j < m) cells[i * width + j + 1] = 1;
      } else if (j < m && segmentMatch(part, dirs[j])) cells[(i + 1) * width + j + 1] = 1;
    }
  }
  return cells[n * width + m] === 1;
}
export function indexPackages(packages, checkTime) {
  const byName = new Map();
  const byDir = new Map();
  const workspaces = [];
  const root = packages.find(pkg => pkg.dir === "");
  const patterns = [];
  for (const pattern of root?.patterns ?? []) {
    const parts = splitGlob(pattern);
    if (parts) patterns.push(parts);
  }
  let workspacesPublic = false;
  let steps = 0;
  for (const pkg of packages) {
    if ((steps++ & 63) === 0) checkTime?.();
    if (pkg.name && !byName.has(pkg.name)) byName.set(pkg.name, pkg);
    if (!byDir.has(pkg.dir)) byDir.set(pkg.dir, pkg);
    if (!pkg.dir || patterns.length === 0) continue;
    let matched = false;
    for (let i = 0; i < patterns.length; i++) {
      if ((steps++ & 63) === 0) checkTime?.();
      if (matchParts(patterns[i], pkg.dir)) { matched = true; break; }
    }
    if (!matched) continue;
    workspaces.push(pkg);
    if (pkg.registry !== "private") workspacesPublic = true;
  }
  const publicParents = new Set();
  for (const pkg of workspaces) {
    if (pkg.registry === "private") continue;
    const parts = pkg.dir.split("/");
    let ancestor = "";
    for (let i = 0; i < parts.length - 1; i++) {
      ancestor = ancestor ? ancestor + "/" + parts[i] : parts[i];
      publicParents.add(ancestor);
    }
  }
  return { byName, byDir, workspaces, publicParents, sawWorkspace: workspaces.length > 0, workspacesPublic, rootPublic: !root || root.registry !== "private" };
}
function selectorIsPublic(index, token) {
  const cleaned = cleanToken(token);
  const exact = index.byName.get(cleaned) || index.byDir.get(cleaned);
  if (exact) return exact.registry !== "private";
  return cleaned !== "" && index.publicParents.has(cleaned);
}
export function barePublishIsPublic(index, command, directory = "", checkTime) {
  const scope = publishScope(stripShellComment(command), checkTime);
  if (scope.names.length) {
    for (let cursor = 0; cursor < scope.names.length; cursor++) {
      if ((cursor & 1023) === 0) checkTime?.();
      if (selectorIsPublic(index, scope.names[cursor])) return true;
    }
    return false;
  }
  if (scope.all) return (scope.includeRoot && index.rootPublic) || (index.sawWorkspace && index.workspacesPublic);
  let dir = cleanToken(directory || "");
  if (dir === ".") dir = "";
  const pkg = index.byDir.get(dir);
  return !pkg || pkg.registry !== "private";
}
function workingDirectory(lines) {
  for (const line of lines) {
    let index = 0;
    while (index < line.length && (line[index] === " " || line[index] === "\t")) index++;
    if (line[index] === "#") continue;
    if (line[index] === "-" && (line[index + 1] === " " || line[index + 1] === "\t")) {
      index++;
      while (index < line.length && (line[index] === " " || line[index] === "\t")) index++;
    }
    if (!line.startsWith("working-directory", index)) continue;
    let cursor = index + "working-directory".length;
    while (cursor < line.length && (line[cursor] === " " || line[cursor] === "\t")) cursor++;
    if (line[cursor] !== ":") continue;
    cursor++;
    while (cursor < line.length && (line[cursor] === " " || line[cursor] === "\t")) cursor++;
    const quote = line[cursor];
    if (quote === "'" || quote === '"') {
      const end = line.indexOf(quote, cursor + 1);
      return line.slice(cursor + 1, end < 0 ? line.length : end).trim();
    }
    let end = cursor;
    while (end < line.length && line[end] !== " " && line[end] !== "\t" && line[end] !== "#") end++;
    return line.slice(cursor, end).trim();
  }
  return "";
}
function registryUrlIn(line) {
  if (/^[ \t]*#/.test(line)) return null;
  const match = /(?:^|\s)registry-url[ \t]*:[ \t]*['"]?([^ \t#'"]+)/i.exec(line);
  return match ? match[1] : null;
}
export function extraWorkflowHits(text, checkTime) {
  const hits = [];
  const probe = text.toLowerCase();
  if (!probe.includes("npm") && !probe.includes("wrangler-action")) return hits;
  let npmAt = text.indexOf("npm");
  const lineHasNpm = (start, end) => {
    if (npmAt < 0) return false;
    if (npmAt < start) npmAt = text.indexOf("npm", start);
    return npmAt >= start && npmAt < end;
  };
  let registryMode = "default";
  let jobDirectory = "";
  let jobPublishes = [];
  let step = null;
  let inJobs = false;
  let jobsIndent = -1;
  let jobIndent = -1;
  let jobOpen = true;
  let counted = 0;
  const flushStep = () => {
    if (!step) return;
    if (step.publishes.length) {
      const stepDirectory = workingDirectory(step.lines);
      for (const hit of step.publishes) {
        if (stepDirectory) hit.directory = stepDirectory;
        else { hit.directory = jobDirectory; jobPublishes.push(hit); }
      }
    }
    if (step.wrangler && wranglerPages(step.lines)) hits.push({ id: "cloudflare-pages", index: step.start });
    step = null;
  };
  const absorb = line => {
    if (!step) return;
    step.lines.push(line);
    const lower = line.toLowerCase();
    if (lower.includes("cloudflare/wrangler-action")) step.wrangler = true;
    if (lower.includes("actions/setup-node")) step.setup = true;
    const url = registryUrlIn(line);
    if (url) step.pending.push(url);
    if (step.setup) {
      for (const pending of step.pending) registryMode = isPublicNpmRegistry(pending) ? "public" : "private";
      step.pending.length = 0;
    }
  };
  const notePublish = (index, explicit, command) => {
    if (explicit) {
      if (isPublicNpmRegistry(explicit)) hits.push({ id: "npm", index });
      return;
    }
    if (registryMode === "private") return;
    if (registryMode === "public") { hits.push({ id: "npm", index }); return; }
    const hit = { id: "npm", index, defer: true, command, directory: "" };
    if (step) step.publishes.push(hit);
    hits.push(hit);
  };
  let offset = 0;
  while (offset <= text.length) {
    if ((counted++ & 8191) === 0) checkTime?.();
    let end = text.indexOf("\n", offset);
    if (end < 0) end = text.length;
    const indent = leadingCount(text, offset, end);
    if (blankLine(text, offset, end) || commentLine(text, offset, end)) {
      if (step) step.lines.push(text.slice(offset, end));
    } else if (jobsLine(text, offset, end)) {
      flushStep();
      inJobs = true;
      jobsIndent = indent;
      jobIndent = -1;
      jobOpen = false;
      registryMode = "default";
      jobDirectory = "";
      jobPublishes = [];
    } else if (inJobs && mappingKey(text, offset, end) && indent > jobsIndent && (jobIndent < 0 || indent === jobIndent)) {
      if (jobIndent < 0) jobIndent = indent;
      flushStep();
      jobOpen = true;
      registryMode = "default";
      jobDirectory = "";
      jobPublishes = [];
    } else {
      if (inJobs && jobIndent >= 0 && indent <= jobsIndent) {
        flushStep();
        inJobs = false;
        jobOpen = true;
        registryMode = "default";
        jobDirectory = "";
        jobPublishes = [];
      }
      const marker = listIndent(text, offset, end);
      if (marker >= 0 && (!step || marker <= step.indent)) {
        flushStep();
        step = { indent: marker, start: offset, lines: [], wrangler: false, setup: false, pending: [], publishes: [] };
        absorb(text.slice(offset, end));
      } else if (step && indent < step.indent) flushStep();
      else if (step) absorb(text.slice(offset, end));
      else if (inJobs && jobIndent >= 0) {
        const dir = workingDirectory([text.slice(offset, end)]);
        if (dir) {
          jobDirectory = dir;
          for (const hit of jobPublishes) hit.directory = dir;
        }
      }
      if (jobOpen && lineHasNpm(offset, end)) {
        const line = text.slice(offset, end);
        if (line.includes("publish") || /\\[ \t]*$/.test(line)) {
          const command = readCommand(text, offset, end);
          if (NPM_PUBLISH.test(command.command)) {
            const source = stripShellComment(command.command);
            const flag = /--registry(?:=|[ \t]+)(\S+)/.exec(source);
            notePublish(offset, flag ? flag[1] : null, source);
            offset = command.next;
            if (end === text.length && command.next > text.length) break;
            continue;
          }
        }
      }
    }
    if (end === text.length) break;
    offset = end + 1;
  }
  flushStep();
  return hits;
}
export function structuralMatches(text, checkTime, filePath = "") {
  const lower = text.toLowerCase();
  const matches = [];
  const formTags = boundedTags(text, lower, "form", checkTime);
  const netlifyNames = new Set(["netlify", "data-" + "netlify", "netlify-" + "honeypot"]);
  for (const tag of formTags) {
    if (attrNames(tag.lower).some(name => netlifyNames.has(name))) { matches.push({ id: "netlify-forms", index: tag.start }); break; }
  }
  const scriptTags = boundedTags(text, lower, "script", checkTime);
  const called = formCallIndexesForFile(text, lower, checkTime, filePath);
  for (const rule of SERVICE_RULES) {
    if (!rule.formHosts?.length) continue;
    let hit = -1;
    for (const tag of formTags) {
      const action = attrValue(tag.tag, tag.lower, "action");
      if (action && rule.formHosts.some(name => hostIn(action, name))) { hit = tag.start; break; }
    }
    if (hit < 0) for (const tag of scriptTags) {
      const src = attrValue(tag.tag, tag.lower, "src");
      if (src && rule.formHosts.some(name => hostIn(src, name))) { hit = tag.start; break; }
    }
    if (hit < 0 && called.has(rule.id)) hit = called.get(rule.id);
    if (hit >= 0) matches.push({ id: rule.id, index: hit });
  }
  return matches;
}
