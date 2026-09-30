import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import test from "node:test";
import {scanRepository} from "../src/index.js";
import {inspectGitIndex} from "../src/git-index.js";
function fixture(run,sha256=false) {
  const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),"ops-index-batch-")));
  const env={...process.env,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null"};
  const git=(args,input)=>{const r=spawnSync("git",args,{cwd:root,env,encoding:"utf8",input});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  try {git(["init","-q",...(sha256?["--object-format=sha256"]:[])]);run(root,git);}
  finally {if(!root.startsWith(fs.realpathSync.native(os.tmpdir())+path.sep))throw Error("Unsafe fixture cleanup");fs.rmSync(root,{recursive:true,force:true});}
}
for(const version of [2,3,4])test("C real Git index version "+version+" accepts ordinary text and leaves checkout unchanged",()=>fixture((root,git)=>{
  for(const name of ["alpha.js","alphabet.js","beta.js"])fs.writeFileSync(path.join(root,name),"../outside.js");
  git(["add","--all"]);
  // Git keeps an ordinary requested v3 index at v2 until an extended flag is needed.
  // Intent-to-add produces a genuine v3 record without hiding any checkout content.
  if(version===3){fs.writeFileSync(path.join(root,"intent.js"),"ordinary text");git(["add","--intent-to-add","intent.js"]);}
  git(["update-index","--index-version",String(version)]);
  const file=path.join(root,".git/index"),before=fs.readFileSync(file),state=git(["status","--porcelain"]);
  assert.equal(inspectGitIndex(before).version,version);
  const r=scanRepository(root);assert.equal(r.complete,true,JSON.stringify(r.warnings));assert.equal(r.scannedFiles,version===3?4:3);
  assert.equal(fs.readFileSync(file).equals(before),true);assert.equal(git(["status","--porcelain"]),state);
}));
test("C SHA-256 Git index is validated without config reads",()=>fixture((root,git)=>{
  fs.writeFileSync(path.join(root,"app.js"),"process.env.OPENAI_API_KEY");git(["add","app.js"]);
  assert.equal(inspectGitIndex(fs.readFileSync(path.join(root,".git/index"))).hash,"sha256");assert.equal(scanRepository(root).complete,true);
},true));
test("C tracked Windows placeholder link rejected before any source read",()=>fixture((root,git)=>{
  const name="linked.js",file=path.join(root,name);fs.writeFileSync(file,"../outside.js");
  const oid=git(["hash-object","-w","--stdin"],"../outside.js");git(["update-index","--add","--cacheinfo","120000,"+oid+","+name]);
  const open=fs.openSync;let reads=0;fs.openSync=function(target,...args){if(target===file)reads++;return open.call(this,target,...args);};
  try {const r=scanRepository(root);assert.equal(r.complete,false);assert.equal(r.warnings[0].code,"GIT_TRACKED_LINK_UNSUPPORTED");assert.equal(r.scannedFiles,0);assert.equal(reads,0);}
  finally {fs.openSync=open;}
}));
test("C real tracked symlink or junction has same rejection as placeholder",()=>fixture((root,git)=>{
  const target=path.join(root,"target");fs.mkdirSync(target);fs.writeFileSync(path.join(target,"app.js"),"process.env.OPENAI_API_KEY");
  const name="linked";fs.symlinkSync(target,path.join(root,name),process.platform==="win32"?"junction":"dir");
  const oid=git(["hash-object","-w","--stdin"],"target");git(["update-index","--add","--cacheinfo","120000,"+oid+","+name]);
  const r=scanRepository(root);assert.equal(r.complete,false);assert.equal(r.warnings[0].code,"GIT_TRACKED_LINK_UNSUPPORTED");assert.equal(r.scannedFiles,0);
}));
test("C corrupt checksum, truncation and unsupported index extension fail closed",()=>fixture((root,git)=>{
  fs.writeFileSync(path.join(root,"app.js"),"");git(["add","app.js"]);const valid=fs.readFileSync(path.join(root,".git/index"));
  const damaged=Buffer.from(valid);damaged[15]^=1;assert.throws(()=>inspectGitIndex(damaged),/INVALID_GIT_INDEX/);
  assert.throws(()=>inspectGitIndex(valid.subarray(0,20)),/INVALID_GIT_INDEX/);
  const payload=valid.subarray(0,-20),ext=Buffer.alloc(8);ext.write("link");const body=Buffer.concat([payload,ext]);
  assert.throws(()=>inspectGitIndex(Buffer.concat([body,createHash("sha1").update(body).digest()])),/GIT_INDEX_LAYOUT_UNSUPPORTED/);
}));
test("C linked-worktree Git pointer is rejected without following it",()=>fixture(root=>{
  fs.renameSync(path.join(root,".git"),path.join(root,"saved-git"));fs.writeFileSync(path.join(root,".git"),"gitdir: ../outside");
  const r=scanRepository(root);assert.equal(r.complete,false);assert.equal(r.warnings[0].code,"GIT_DIRECTORY_FILE_UNSUPPORTED");
}));
test("C real Git checkout without index is explicitly incomplete",()=>fixture(root=>{
  const r=scanRepository(root);assert.equal(r.complete,false);assert.equal(r.warnings[0].code,"GIT_INDEX_MISSING");
}));
test("C split-index layout rejected rather than omitting shared entries",()=>fixture((root,git)=>{
  fs.writeFileSync(path.join(root,"app.js"),"");git(["add","app.js"]);git(["update-index","--split-index"]);
  assert.equal(scanRepository(root).complete,false);
}));
test("C malformed on-disk index produces static incomplete diagnostic",()=>fixture(root=>{
  fs.writeFileSync(path.join(root,".git/index"),"SYNTHETIC_METADATA_MUST_NOT_ECHO");
  const r=scanRepository(root);assert.equal(r.complete,false);assert.equal(JSON.stringify(r).includes("SYNTHETIC_METADATA_MUST_NOT_ECHO"),false);
}));
test("C nested scan roots cannot bypass ancestor Git link metadata",()=>fixture((root,git)=>{
  const child=path.join(root,"child");fs.mkdirSync(child);fs.writeFileSync(path.join(child,"linked.js"),"../outside.js");
  const oid=git(["hash-object","-w","--stdin"],"../outside.js");git(["update-index","--add","--cacheinfo","120000,"+oid+",child/linked.js"]);
  fs.mkdirSync(path.join(child,".git"));fs.writeFileSync(path.join(child,".git/dummy.js"),"ignored fixture");
  const r=scanRepository(child,{workspace:root});assert.equal(r.complete,false);assert.equal(r.warnings[0].code,"GIT_TRACKED_LINK_UNSUPPORTED");assert.equal(r.scannedFiles,0);
}));
test("C Action workspace boundary does not permit parent Git metadata reads",()=>fixture((root,git)=>{
  fs.writeFileSync(path.join(root,"app.js"),"");git(["add","app.js"]);const child=path.join(root,"child");fs.mkdirSync(child);
  const file=path.join(root,".git/index"),open=fs.openSync;let reads=0;fs.openSync=function(target,...args){if(target===file)reads++;return open.call(this,target,...args);};
  try{const r=scanRepository(child,{workspace:child});assert.equal(r.complete,false);assert.equal(r.warnings[0].code,"GIT_METADATA_OUTSIDE_WORKSPACE");assert.equal(reads,0);}
  finally{fs.openSync=open;}
}));
