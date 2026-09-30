import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditRepository, scanRepository, parseSimpleYaml, parseManifestJson, validateManifest, machineReport, formatReport } from "../src/index.js";
import { LIMITS } from "../src/safety.js";
const here=path.dirname(fileURLToPath(import.meta.url)),cli=path.join(here,"../src/cli.js"),action=path.join(here,"../src/action.js");
const fake="RC2_SYNTHETIC_SECRET_MUST_NOT_APPEAR",template="version: 1\nservices:\n";
function fixture(run){const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),"ops-rc2-")));const write=(name,data)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);return file;};try{return run(root,write);}finally{fs.rmSync(root,{recursive:true,force:true});}}
function launch(root,extra={}){const summary=path.join(os.tmpdir(),"ops-summary-"+crypto.randomUUID()),output=summary+".output";try{const r=spawnSync(process.execPath,[action],{encoding:"utf8",timeout:10000,env:{...process.env,GITHUB_WORKSPACE:root,INPUT_PATH:".",INPUT_MANIFEST:"",INPUT_FAIL_ON_UNDOCUMENTED:"false",INPUT_REQUIRE_CUSTODY:"false",GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary,...extra}});return{...r,output:fs.existsSync(output)?fs.readFileSync(output,"utf8"):"",summary:fs.existsSync(summary)?fs.readFileSync(summary,"utf8"):""};}finally{for(const f of[summary,output])if(fs.existsSync(f))fs.unlinkSync(f);}}
const manifest=raw=>validateManifest(parseSimpleYaml(raw));
for(const[id,name]of[["SEC-01",".env"],["SEC-02","nested/.env"],["SEC-03",".env.local"],["SEC-04",".env.production"],["SEC-05",".env.development.local"],["SEC-06","tls.pem"],["SEC-07","tls.p12"],["SEC-07","tls.pfx"],["SEC-07","tls.key"],["SEC-07","tls.keystore"],["SEC-08","credentials.json"],["SEC-09","secrets/config.json"]])test(id+" no content read: "+name,()=>fixture((root,write)=>{
 write(name,fake);let reads=0;const original=fs.openSync;fs.openSync=function(file,...args){if(String(file)===path.join(root,name))reads++;return original.call(this,file,...args);};
 try{const r=scanRepository(root);assert.equal(r.complete,true);assert.equal(reads,0);assert.ok(r.skippedSensitiveFiles.includes(name));assert.equal(JSON.stringify(r).includes(fake),false);}finally{fs.openSync=original;}
}));
for(const[id,name,text]of[["SEC-10",".env.example","OPENAI_API_KEY="+fake],["SEC-11","app.js",'const secret="'+fake+'"; process.env.OPENAI_API_KEY;'],["SEC-12","app.js",'fetch("https://api.openai.com/'+fake+'")'],["SEC-13","package.json",'{"secret":"'+fake],["SEC-14","ops.yaml",template+'  bad:\n    provider: "'+fake]])test(id+" SEC-15–20 synthetic values absent from every output",()=>fixture((root,write)=>{
 write(name,text);const r=launch(root),c=spawnSync(process.execPath,[cli,root,"--json","--ci"],{encoding:"utf8"});
 for(const surface of[r.stdout,r.stderr,r.summary,r.output,c.stdout,c.stderr]){assert.equal(surface.includes(fake),false);assert.equal(surface.includes(root),false);assert.equal(surface.includes(os.homedir()),false);assert.equal(/\bat .+:\d+:\d+/.test(surface),false);}
 if(id==="SEC-13"||id==="SEC-14"){assert.equal(r.status,1);assert.equal(c.status,1);}
}));
for(const[id,input]of[["FS-01","../"],["FS-02",os.tmpdir()],["ACTION-06",".\n::error::bad"],["ACTION-08"," "],["ACTION-08",""],["ACTION-09","a".repeat(4097)],["ACTION-07","C:\\outside"],["ACTION-07","\\\\server\\share"],["ACTION-07","C:relative"]])test(id+" reject Action input "+JSON.stringify(input).slice(0,70),()=>fixture(root=>{const r=launch(root,{INPUT_PATH:input});assert.equal(r.status,1,r.stdout);assert.match(r.output,/status=error/);}));
test("FS-01 missing explicit manifest, escaped manifest, competing defaults fail",()=>fixture((root,write)=>{assert.throws(()=>auditRepository(root,"../outside.yaml"));assert.throws(()=>auditRepository(root,"missing.yaml"));write("ops.yaml",template);write("ops.json",'{"version":1,"services":{}}');assert.throws(()=>auditRepository(root),/MULTIPLE_MANIFESTS/);}));
for(const[id,target]of[["FS-03","system"],["FS-04","sibling"],["FS-05","loop"],["FS-06","junction"],["FS-15","broken"]])test(id+" never traverses directory link",()=>fixture(root=>{
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),"ops-outside-"));try{fs.writeFileSync(path.join(outside,"app.js"),"process.env.OPENAI_API_KEY");const dest=target==="loop"?root:target==="broken"?path.join(outside,"missing"):target==="system"?os.tmpdir():outside;fs.symlinkSync(dest,path.join(root,"linked"),process.platform==="win32"?"junction":"dir");const r=scanRepository(root);assert.equal(r.complete,false);assert.match(r.warnings[0].code,/SYMLINK/);assert.equal(r.services.length,0);assert.throws(()=>auditRepository(root,"linked/ops.yaml"));assert.equal(launch(root,{INPUT_PATH:"linked"}).status,1);}finally{fs.rmSync(outside,{recursive:true,force:true});}
}));
test("FS hardlinks do not alias secret content",()=>fixture((root,write)=>{const file=write(".env",fake);fs.linkSync(file,path.join(root,"app.js"));const r=scanRepository(root);assert.equal(r.complete,false);assert.equal(JSON.stringify(r).includes(fake),false);}));
test("FS-07 depth limit is incomplete error",()=>fixture((root,write)=>{write(Array(66).fill("a").join("/")+"/app.js","");const r=scanRepository(root);assert.equal(r.complete,false);assert.match(r.warnings[0].code,/PATH_DEPTH_LIMIT/);}));
test("FS-08 Unicode lookalikes are literal paths",()=>fixture((root,write)=>{write("．．/app.js","process.env.STRIPE_SECRET_KEY");const r=scanRepository(root);assert.equal(r.complete,true);assert.ok(r.services.some(x=>x.id==="stripe"));assert.equal(launch(root,{INPUT_PATH:"．．"}).status,0);}));
for(const[id,name]of[["FS-09","a\n::error::forged.js"],["FS-10","a\rforged.js"],["FS-11","::error::.js"],["FS-12","%0A%0D%25.js"]])test(id+" filename cannot forge output",()=>fixture((root,write)=>{
 let r;if(process.platform!=="win32"||id==="FS-12"){write(name,"process.env.OPENAI_API_KEY");r=auditRepository(root);}else{write("app.js","process.env.OPENAI_API_KEY");r=auditRepository(root);r.items[0].finding.evidence[0].path=name;}
 const report=formatReport(r);assert.equal(report.includes("\r"),false);assert.equal(report.includes("::error::"),false);assert.doesNotThrow(()=>JSON.parse(JSON.stringify(machineReport(r))));
}));
test("FS-13 replaced object rejected before read",()=>fixture((root,write)=>{
 const file=write("app.js","process.env.OPENAI_API_KEY"),original=fs.openSync;let done=false;fs.openSync=function(target,...args){if(target===file&&!done){done=true;fs.unlinkSync(file);fs.writeFileSync(file,fake);}return original.call(this,target,...args);};try{const r=scanRepository(root);assert.equal(done,true,"replacement fault must be injected");assert.equal(r.complete,false);assert.equal(JSON.stringify(r).includes(fake),false);assert.match(r.warnings[0].code,/FILESYSTEM_CHANGED/);}finally{fs.openSync=original;}
}));
test("FS-14 denied I/O cannot pass or leak error text",()=>fixture((root,write)=>{write("app.js","");const original=fs.openSync;fs.openSync=()=>{throw Object.assign(new Error(fake),{code:"EACCES"});};try{const r=scanRepository(root);assert.equal(r.complete,false);assert.equal(JSON.stringify(r).includes(fake),false);}finally{fs.openSync=original;}}));
for(const[id,content,complete]of[["PARSE-01","{",false],["PARSE-02"," ".repeat(LIMITS.fileBytes-2)+"{}",true],["PARSE-03"," ".repeat(LIMITS.fileBytes)+"{}",false],["PARSE-04","\uFEFF{}",true],["PARSE-05",Buffer.from([0xff,0xfe]),false],["PARSE-06","{\0}",false],["PARSE-07",'{"x":"'+"a".repeat(800000)+'"}',true]])test(id+" decoding and size boundaries",()=>fixture((root,write)=>{write("package.json",content);const r=scanRepository(root);assert.equal(r.complete,complete);if(!complete){const c=spawnSync(process.execPath,[cli,root,"--json"],{encoding:"utf8"});assert.equal(c.status,1);assert.equal(JSON.parse(c.stdout).status,"error");}}));
for(const[id,raw]of[["PARSE-08",template+"x-a: &anchor bad"],["PARSE-09",template+"x-a: *alias"],["PARSE-10",template+"x-a: !!js/object foo"],["PARSE-11",template+"version: 1"],["PARSE-12",template+" x-a: value"],["PARSE-12",template+"    x-a: value"],["PARSE-12",template+"x-a: value\n  x-b: value"],["PARSE-13",template+Array.from({length:18},(_,i)=>"  ".repeat(i)+"x-a:").join("\n")],["PARSE-14",template+"x-a:\n  constructor: bad"],["PARSE-15",template+Array.from({length:10001},(_,i)=>"x-"+i+": null").join("\n")]])test(id+" hostile YAML rejected",()=>assert.throws(()=>manifest(raw)));
test("PARSE JSON duplicates, unknown fields and bounded extensions",()=>{
 for(const raw of['{"version":1,"version":1,"services":{}}','{"version":1,"services":{},"x-a":{"prototype":true}}','{"version":1,"services":{},"x-a":[]}'])assert.throws(()=>validateManifest(parseManifestJson(raw)));
 assert.throws(()=>manifest(template+"servcies:\n"));assert.throws(()=>manifest(template+"  a:\n    provider: openai\n    custody:\n      billing_owenr: Finance"));assert.doesNotThrow(()=>manifest(template+"x-company:\n  ticket: ENG-482"));assert.throws(()=>manifest("version: 2\nservices:\n"));
});
test("DOS-01 DOS-02 lowered count limits terminate promptly",()=>fixture((root,write)=>{for(let i=0;i<12;i++)write(i+".js","");assert.equal(scanRepository(root,{limits:{entries:10}}).warnings[0].code,"ENTRY_COUNT_LIMIT");assert.equal(scanRepository(root,{limits:{candidates:10}}).warnings[0].code,"CANDIDATE_COUNT_LIMIT");}));
test("DOS total bytes, evidence and elapsed-time budgets",()=>fixture((root,write)=>{
 write("app.js","process.env.OPENAI_API_KEY; fetch('https://api.resend.com')");assert.equal(scanRepository(root,{limits:{totalBytes:10}}).warnings[0].code,"TOTAL_BYTES_LIMIT");assert.equal(scanRepository(root,{limits:{evidence:1}}).warnings[0].code,"EVIDENCE_COUNT_LIMIT");
 const original=fs.opendirSync;fs.opendirSync=function(...args){const end=performance.now()+20;while(performance.now()<end){}return original.apply(this,args);};try{assert.equal(scanRepository(root,{limits:{milliseconds:1}}).warnings[0].code,"SCAN_TIME_LIMIT");}finally{fs.opendirSync=original;}
}));
test("DOS-03 regex stress within byte bound",()=>fixture((root,write)=>{write("app.js"," ".repeat(500000)+"createClient(".repeat(20000));const start=performance.now(),r=scanRepository(root);assert.equal(r.complete,true);assert.ok(performance.now()-start<10000);}));
test("DOS repeated env signatures are bounded even when duplicate",()=>fixture((root,write)=>{write("app.js","process.env.OPENAI_API_KEY;".repeat(20001));const start=performance.now(),r=scanRepository(root);assert.equal(r.complete,false);assert.equal(r.warnings[0].code,"ENV_MATCH_COUNT_LIMIT");assert.ok(performance.now()-start<10000);}));
for(const dir of["node_modules",".git","vendor","dist","build",".next","coverage"])test("DOS-04 DOS-05 DOS-06 excluded tree "+dir,()=>fixture((root,write)=>{write(dir+"/app.js",Buffer.alloc(2*LIMITS.fileBytes,0xff));const r=scanRepository(root);assert.equal(r.complete,true);assert.equal(r.scannedFiles,0);}));
test("DOS-07 many links reject first link",()=>fixture(root=>{for(let i=0;i<50;i++)fs.symlinkSync(root,path.join(root,"link"+i),process.platform==="win32"?"junction":"dir");const r=scanRepository(root);assert.equal(r.complete,false);assert.equal(r.scannedFiles,0);}));
test("DOS-08 malformed packages stop first error",()=>fixture((root,write)=>{for(let i=0;i<30;i++)write("p"+i+"/package.json","{"+fake);const r=scanRepository(root);assert.equal(r.complete,false);assert.equal(r.scannedFiles,1);assert.equal(JSON.stringify(r).includes(fake),false);}));
for(const[id,name,content,provider,confidence]of[["DET-01","app.js","createClient()","supabase",null],["DET-02","README.md","Stripe api.stripe.com new Stripe()","stripe",null],["DET-03","app.js",'fetch("https://api.resend.com")',"resend","weak"],["DET-04","package.json",'{"devDependencies":{"stripe":"*"}}',"stripe","strong"],["DET-05","app.js","process.env.OPENAI_API_KEY","openai","strong"],["DET-06","wrangler.toml",'name="x"',"cloudflare","strong"],["DET-08","README.md","process.env.OPENAI_API_KEY","openai",null]])test(id+" detection confidence",()=>fixture((root,write)=>{write(name,content);const r=scanRepository(root);assert.equal(r.complete,true);assert.equal(r.services.find(x=>x.id===provider)?.confidence??null,confidence);}));
test("DET-07 independent weak files corroborate",()=>fixture((root,write)=>{write("a.js",'fetch("https://api.resend.com")');write("b.js",'fetch("https://api.resend.com")');const r=auditRepository(root);assert.equal(r.items[0].finding.confidence,"corroborated");assert.deepEqual(r.undocumented,["resend"]);}));
test("DET-09 DET-10 unknown provider manifest-only, strict custody still applies",()=>fixture((root,write)=>{write("ops.yaml",template+"  human:\n    provider: unknown-provider\n");const r=auditRepository(root,undefined,{requireCustody:true});assert.equal(r.items.length,0);assert.equal(r.manifestOnly[0].provider,"unknown-provider");assert.equal(r.status,"fail");assert.equal(r.unknownCustody.length,1);}));
test("DET-11 no reason or implicit provider-wide ignore rejected",()=>{for(const raw of[template+"ignores:\n  a:\n    provider: resend\n    scope: all\n",template+"ignores:\n  a:\n    provider: resend\n    reason: fixture"])assert.throws(()=>manifest(raw));});
test("DET-12 scoped ignores retain evidence and cannot cover siblings",()=>fixture((root,write)=>{
 write("test/fixtures/package.json",'{"dependencies":{"resend":"*"}}');write("test/fixtures-sibling/package.json",'{"dependencies":{"resend":"*"}}');write("ops.yaml",template+"ignores:\n  legacy:\n    provider: resend\n    path_prefix: test/fixtures/\n    reason: archived fixture\n");
 const r=auditRepository(root);assert.equal(r.status,"fail");assert.deepEqual(r.undocumented,["resend"]);assert.equal(r.items[0].finding.evidence.filter(x=>x.ignores.length).length,1);fs.unlinkSync(path.join(root,"test/fixtures-sibling/package.json"));const clean=auditRepository(root);assert.equal(clean.status,"pass");assert.equal(clean.items[0].ignored,true);assert.ok(machineReport(clean).findings[0].evidence[0].ignores[0].reason);
}));
test("ACTION-04 ACTION-05 fixed output grammar and escaped HTML summary",()=>fixture((root,write)=>{
 const ticks=String.fromCharCode(96).repeat(3);write("package.json",'{"dependencies":{"resend":"*"}}');write("ops.yaml",template+"ignores:\n  fixture:\n    provider: resend\n    scope: all\n    reason: '<script>"+ticks+" ::error:: %0A</script>'\n");
 const r=launch(root);assert.equal(r.status,0,r.stderr);assert.equal(r.summary.includes("<script>"),false);assert.equal(r.summary.includes(ticks),false);assert.equal(r.stdout.includes("::error::"),false);assert.match(r.summary,/&lt;script&gt;/);for(const line of r.output.trim().split("\n"))assert.match(line,/^(undocumented_count|unknown_custody_count)=\d+$|^status=(pass|fail|error)$|^complete=(true|false)$/);
}));
test("ACTION-10 no repository code execution or network dependency",()=>fixture((root,write)=>{
 const sentinel=path.join(root,"SENTINEL");write("app.js",'require("fs").writeFileSync('+JSON.stringify(sentinel)+',"bad"); process.env.OPENAI_API_KEY');write("package.json",'{"scripts":{"install":"node app.js"},"dependencies":{"openai":"*"}}');const r=launch(root,{HTTP_PROXY:"http://127.0.0.1:1",HTTPS_PROXY:"http://127.0.0.1:1"});assert.equal(r.status,0);assert.equal(fs.existsSync(sentinel),false);
}));
test("ACTION incomplete overrides disabled enforcement; booleans strict",()=>fixture((root,write)=>{write("package.json","{");const r=launch(root);assert.equal(r.status,1);assert.match(r.stdout,/Gate status: ERROR/);assert.match(r.output,/status=error/);assert.equal(launch(root,{INPUT_FAIL_ON_UNDOCUMENTED:"FALSE"}).status,1);}));

test("SEC manifest overrides and nested scan roots cannot read protected secrets",()=>fixture((root,write)=>{
 write(".env",fake);write("secrets/ops.yaml",fake);write("credentials.json",fake);write("secrets/app.js",fake);
 for(const file of[".env","secrets/ops.yaml","credentials.json"]){assert.throws(()=>auditRepository(root,file),/SENSITIVE/);assert.equal(launch(root,{INPUT_MANIFEST:file}).status,1);}
 assert.equal(launch(root,{INPUT_PATH:"secrets"}).status,1);
}));

test("DOS overlapping ignore annotations are bounded before report amplification",()=>fixture((root,write)=>{
 write("app.js","process.env.OPENAI_API_KEY;\n".repeat(150));
 write("ops.yaml",template+"ignores:\n"+Array.from({length:150},(_,i)=>"  ignore-"+i+":\n    provider: openai\n    scope: all\n    reason: synthetic overlap\n").join(""));
 assert.throws(()=>auditRepository(root),/IGNORE_MATCH_COUNT_LIMIT/);
 const r=launch(root);assert.equal(r.status,1);assert.match(r.output,/status=error/);
}));
test("DOS nonmatching ignore comparisons are bounded",()=>fixture((root,write)=>{
 write("app.js","process.env.OPENAI_API_KEY;\n".repeat(1100));
 write("ops.yaml",template+"ignores:\n"+Array.from({length:1000},(_,i)=>"  ignore-"+i+":\n    provider: openai\n    path_prefix: unused-"+i+"/\n    reason: synthetic nonmatch\n").join(""));
 assert.throws(()=>auditRepository(root),/IGNORE_COMPARISON_LIMIT/);
}));

test("SEC-09 SEC-10 template exemption never overrides protected ancestors",()=>fixture((root,write)=>{
 const file=write("secrets/.env.example","OPENAI_API_KEY="+fake);
 write("credentials/.env.sample","OPENAI_API_KEY="+fake);
 const original=fs.openSync;let reads=0;fs.openSync=function(target,...args){if(target===file||String(target).includes(path.sep+"credentials"+path.sep))reads++;return original.call(this,target,...args);};
 try{const r=scanRepository(root);assert.equal(r.complete,true);assert.equal(reads,0);assert.deepEqual(r.services,[]);assert.equal(JSON.stringify(r).includes(fake),false);}finally{fs.openSync=original;}
}));
