import assert from "node:assert/strict";import fs from "node:fs";import os from "node:os";import path from "node:path";import {spawnSync} from "node:child_process";import test from "node:test";import {fileURLToPath} from "node:url";
test("ACTION-03 private fork-event simulation needs no secrets and never executes target scripts",()=>{
 const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),"ops-fork-sim-"))),outside=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),"ops-fork-meta-")));
 const action=fileURLToPath(new URL("../src/action.js",import.meta.url)),sentinel=path.join(root,"TARGET_EXECUTED"),event=path.join(outside,"event.json");
 fs.writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:{resend:"*"},scripts:{install:"node app.js"}}));
 fs.writeFileSync(path.join(root,"app.js"),"require('fs').writeFileSync("+JSON.stringify(sentinel)+",'bad')");
 fs.writeFileSync(event,JSON.stringify({pull_request:{head:{ref:"$(touch TARGET_EXECUTED)\n::error::forged",repo:{fork:true}},title:"<script>hostile</script>"}}));
 const env={...process.env,GITHUB_EVENT_NAME:"pull_request",GITHUB_EVENT_PATH:event,GITHUB_WORKSPACE:root,INPUT_PATH:".",INPUT_MANIFEST:"",INPUT_FAIL_ON_UNDOCUMENTED:"false",INPUT_REQUIRE_CUSTODY:"false",GITHUB_OUTPUT:path.join(outside,"output"),GITHUB_STEP_SUMMARY:path.join(outside,"summary")};
 for(const key of ["GITHUB_TOKEN","GH_TOKEN","ACTIONS_RUNTIME_TOKEN","NODE_OPTIONS"])delete env[key];
 try{const r=spawnSync(process.execPath,[action],{env,encoding:"utf8",timeout:10000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Gate status: PASS/);assert.equal(fs.existsSync(sentinel),false);assert.equal(r.stdout.includes("::error::forged"),false);assert.match(fs.readFileSync(env.GITHUB_OUTPUT,"utf8"),/status=pass/);}
 finally{for(const dir of[root,outside]){if(!dir.startsWith(fs.realpathSync.native(os.tmpdir())+path.sep))throw Error("Unsafe simulation cleanup");fs.rmSync(dir,{recursive:true,force:true});}}
});
