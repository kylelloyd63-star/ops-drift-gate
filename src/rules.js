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
      } else while (index < lowerTag.length && !/[\s>]/.test(lowerTag[index])) index++;
    }
  }
  return names;
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

function callBefore(text, at) {
  const before = text.slice(Math.max(0, at - 240), at);
  const calls = /(?:\bfetch|\baxios(?:\s*\.\s*(?:post|get|put|request|delete))?|\bsendBeacon|\$\.(?:ajax|post|get))\s*\(/gi;
  let last = null;
  for (const match of before.matchAll(calls)) last = match;
  if (!last || last.index == null) return false;
  return !before.slice(last.index + last[0].length).includes(";");
}
function linesOf(text) {
  const lines = [];
  let start = 0;
  for (let index = 0; index <= text.length; index++) {
    if (index !== text.length && text[index] !== "\n") continue;
    lines.push({ start, text: text.slice(start, index) });
    start = index + 1;
  }
  return lines;
}
export function extraWorkflowHits(text, checkTime) {
  const hits = [];
  const lower = text.toLowerCase();
  if (!lower.includes("npm") && !lower.includes("wrangler-action")) return hits;
  const lines = linesOf(text);
  let steps = 0;
  for (let index = 0; index < lines.length; index++) {
    if ((steps++ & 1023) === 0) checkTime?.();
    let command = lines[index].text;
    let end = index;
    while (/\\[ \t]*$/.test(command) && end + 1 < lines.length && end - index < 4) {
      end++;
      command += "\n" + lines[end].text;
    }
    if (!/\bnpm(?:[ \t]+stage)?[ \t]+publish\b/.test(command)) continue;
    const flag = /--registry(?:=|[ \t]+)(\S+)/.exec(command);
    if (!flag || isPublicNpmRegistry(flag[1])) { hits.push({ id: "npm", index: lines[index].start }); break; }
  }
  let stepStart = -1;
  let stepIndent = Infinity;
  let stepText = "";
  const flush = () => {
    if (stepStart < 0) return;
    const lower = stepText.toLowerCase();
    if (lower.includes("cloudflare/wrangler-action") && /\bpages[ \t]+deploy\b/i.test(stepText)) hits.push({ id: "cloudflare-pages", index: stepStart });
  };
  for (const line of lines) {
    const marker = /^([ \t]*)-[ \t]+/.exec(line.text);
    if (marker) {
      const indent = marker[1].length;
      if (stepStart < 0 || indent <= stepIndent) {
        flush();
        stepStart = line.start;
        stepIndent = indent;
        stepText = line.text;
        continue;
      }
    }
    if (stepStart >= 0) stepText += "\n" + line.text;
  }
  flush();
  return hits;
}
export function structuralMatches(text, checkTime) {
  const lower = text.toLowerCase();
  const matches = [];
  const formTags = boundedTags(text, lower, "form", checkTime);
  const netlifyNames = new Set(["netlify", "data-" + "netlify", "netlify-" + "honeypot"]);
  for (const tag of formTags) {
    if (attrNames(tag.lower).some(name => netlifyNames.has(name))) { matches.push({ id: "netlify-forms", index: tag.start }); break; }
  }
  const scriptTags = boundedTags(text, lower, "script", checkTime);
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
    if (hit < 0) {
      for (const name of rule.formHosts) {
        const needle = name.toLowerCase();
        let from = 0;
        while (from < lower.length) {
          const at = lower.indexOf(needle, from);
          if (at < 0) break;
          const before = at === 0 ? "" : lower[at - 1];
          const after = lower[at + needle.length] ?? "";
          if ((!before || before === "." || !/[a-z0-9-]/.test(before)) && (!after || !/[a-z0-9.-]/.test(after)) && callBefore(text, at)) { hit = at; break; }
          from = at + needle.length;
        }
        if (hit >= 0) break;
      }
    }
    if (hit >= 0) matches.push({ id: rule.id, index: hit });
  }
  return matches;
}
