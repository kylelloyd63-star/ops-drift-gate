const host = name => new RegExp("\\b" + name.replace(/[.]/g, "\\.") + "\\b", "i");
const token = (...parts) => new RegExp("\\b" + parts.join("") + "\\b", "i");

export const SERVICE_RULES = [
    {id:"vercel",name:"Vercel",category:"hosting",filePatterns:[/(^|\/)vercel\.json$/i],packagePatterns:[/^@vercel\//i],contentPatterns:[/\bvercel\.app\b/i],envPatterns:[/^VERCEL_/i]},
    {id:"supabase",name:"Supabase",category:"backend/database",filePatterns:[/(^|\/)supabase\/config\.toml$/i],packagePatterns:[/^@supabase\/supabase-js$/i],contentPatterns:[/\.supabase\.co\b/i],envPatterns:[/SUPABASE/i]},
    {id:"stripe",name:"Stripe",category:"payments",packagePatterns:[/^stripe$/i,/^@stripe\//i],contentPatterns:[/\bapi\.stripe\.com\b/i,/\bnew\s+Stripe\s*\(/i],envPatterns:[/^STRIPE_/i]},
    {id:"resend",name:"Resend",category:"email",packagePatterns:[/^resend$/i],contentPatterns:[/\bapi\.resend\.com\b/i,/\bnew\s+Resend\s*\(/i],envPatterns:[/^RESEND_/i]},
    {id:"twilio",name:"Twilio",category:"communications",packagePatterns:[/^twilio$/i],contentPatterns:[/\bapi\.twilio\.com\b/i],envPatterns:[/^TWILIO_/i]},
    {id:"firebase",name:"Firebase",category:"backend/hosting",filePatterns:[/(^|\/)firebase\.json$/i,/(^|\/)\.firebaserc$/i],packagePatterns:[/^firebase$/i,/^firebase-admin$/i,/^firebase_admin$/i],contentPatterns:[/\bfirebaseapp\.com\b/i],envPatterns:[/FIREBASE/i]},
    {id:"aws",name:"Amazon Web Services",category:"cloud",packagePatterns:[/^@aws-sdk\//i,/^aws-sdk$/i,/^boto3$/i],contentPatterns:[/\bamazonaws\.com\b/i],envPatterns:[/^AWS_/i]},
    {id:"cloudflare",name:"Cloudflare",category:"dns/edge",filePatterns:[/(^|\/)wrangler\.(toml|jsonc?)$/i],packagePatterns:[/^wrangler$/i,/^@cloudflare\//i],contentPatterns:[/\bworkers\.dev\b/i],envPatterns:[/^CLOUDFLARE_/i,/^CF_API_/i]},
    {id:"cloudflare-pages",name:"Cloudflare Pages",category:"hosting",hostPatterns:[host("pages" + ".dev")],workflowPatterns:[/\bwrangler\s+pages\b/],configPatterns:[token("pages", "_", "build", "_", "output", "_", "dir")]},
    {id:"netlify",name:"Netlify",category:"hosting",filePatterns:[/(^|\/)netlify\.toml$/i],packagePatterns:[/^netlify$/i,/^netlify-cli$/i],contentPatterns:[host("netlify" + ".app")],envPatterns:[/^NETLIFY_/i]},
    {id:"github-pages",name:"GitHub Pages",category:"hosting",filePatterns:[/(^|\/)CNAME$/,/(^|\/)\.nojekyll$/i],workflowPatterns:[/actions\/(?:deploy-pages|upload-pages-artifact|configure-pages)\b/,/peaceiris\/actions-gh-pages\b/,/JamesIves\/github-pages-deploy-action\b/]},
    {id:"custom-domain",name:"Custom Domain",category:"dns",filePatterns:[/(^|\/)CNAME$/],configPatterns:[token("custom", "_", "domain"), token("custom", "Domain")]},
    {id:"sentry",name:"Sentry",category:"observability",packagePatterns:[/^@sentry\//i,/^sentry-sdk$/i],contentPatterns:[/\bsentry\.io\b/i],envPatterns:[/^SENTRY_/i]},
    {id:"openai",name:"OpenAI API",category:"ai-api",packagePatterns:[/^openai$/i],contentPatterns:[/\bapi\.openai\.com\b/i],envPatterns:[/^OPENAI_/i]},
    {id:"github-actions",name:"GitHub Actions",category:"ci/cd",filePatterns:[/(^|\/)\.github\/workflows\/[^/]+\.(yml|yaml)$/i]},
    {id:"scheduled-jobs",name:"Scheduled Jobs",category:"automation",contentPatterns:[/^\s*schedule\s*:/im,/"crons"\s*:/i]},
    {id:"formsubmit",name:"FormSubmit",category:"forms",hostPatterns:[host("formsubmit" + ".co")]},
    {id:"formspree",name:"Formspree",category:"forms",packagePatterns:[/^@formspree\//i],hostPatterns:[host("formspree" + ".io")]},
    {id:"netlify-forms",name:"Netlify Forms",category:"forms",hostPatterns:[token("data-", "netlify"), token("netlify-", "honeypot"), new RegExp("<" + "form\\b[^>]*\\snetlify(?:\\s*=|=|\\s|>|\\/)", "i")]},
    {id:"getform",name:"Getform",category:"forms",hostPatterns:[host("getform" + ".io")]},
    {id:"web3forms",name:"Web3Forms",category:"forms",hostPatterns:[host("web3forms" + ".com")]},
    {id:"npm",name:"npm Registry",category:"package-registry",packageMarkers:["publishConfig"],workflowPatterns:[/\bnpm(?:\s+stage)?\s+publish\b/,/\bregistry-url\s*:/, host("registry.npmjs" + ".org")],contentPatterns:[host("registry.npmjs" + ".org")]},
    {id:"pypi",name:"PyPI",category:"package-registry",packagePatterns:[/^twine$/i],workflowPatterns:[/\btwine\s+upload\b/,/gh-action-pypi-publish\b/, host("pypi" + ".org")],hostPatterns:[host("upload.pypi" + ".org")],contentPatterns:[host("pypi" + ".org")]}
];
