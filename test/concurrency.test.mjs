import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditRepository, scanRepository, machineReport } from "../src/index.js";
const seeded = "SOL_BATCH_SYNTHETIC_EXTERNAL_VALUE";
function fixture(run) {
  const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),"ops-race-batch-")));
  const root=path.join(base,"scan"), outside=path.join(base,"outside");
  fs.mkdirSync(root); fs.mkdirSync(outside);
  const write=(name,value)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);return file;};
  try { run(root,outside,write); }
  finally { if(!base.startsWith(fs.realpathSync.native(os.tmpdir())+path.sep))throw Error("Unsafe fixture cleanup");fs.rmSync(base,{recursive:true,force:true}); }
}
function noPass(result) {
  assert.equal(result.complete,false);
  assert.equal(JSON.stringify(result).includes(seeded),false);
}
for(const type of ["directory","link"]) test("B ancestor "+type+" replacement before content read",()=>fixture((root,outside,write)=>{
  const file=write("nested/app.js","process.env.OPENAI_API_KEY"), external=path.join(outside,"app.js");
  fs.writeFileSync(external,seeded);
  const open=fs.openSync, read=fs.readSync;let injected=false,externalFd,externalReads=0;
  fs.openSync=function(target,...args){
    if(target===file&&!injected){injected=true;fs.renameSync(path.join(root,"nested"),path.join(root,"saved"));
      if(type==="link")fs.symlinkSync(outside,path.join(root,"nested"),process.platform==="win32"?"junction":"dir");
      else {fs.mkdirSync(path.join(root,"nested"));fs.writeFileSync(file,seeded);}
      externalFd=open.call(this,target,...args);return externalFd;
    } return open.call(this,target,...args);
  };
  fs.readSync=function(fd,...args){if(fd===externalFd)externalReads++;return read.call(this,fd,...args);};
  try {const r=scanRepository(root);assert.equal(injected,true);noPass(r);assert.equal(externalReads,0);}
  finally {fs.openSync=open;fs.readSync=read;}
}));
test("B leaf mutation during descriptor read cannot pass",()=>fixture((root,outside,write)=>{
  const file=write("app.js","process.env.OPENAI_API_KEY"), read=fs.readSync;let injected=false;
  fs.readSync=function(...args){const n=read.apply(this,args);if(!injected){injected=true;fs.appendFileSync(file,";"+seeded);}return n;};
  try {const r=scanRepository(root);assert.equal(injected,true);noPass(r);assert.equal(r.warnings[0].code,"FILESYSTEM_CHANGED");}
  finally {fs.readSync=read;}
}));
test("B already-read file mutation rejected by audit-wide version guard",()=>fixture((root,outside,write)=>{
  const file=write("app.js","process.env.OPENAI_API_KEY"), close=fs.closeSync;let injected=false;
  fs.closeSync=function(...args){const v=close.apply(this,args);if(!injected){injected=true;fs.appendFileSync(file,";"+seeded);}return v;};
  try {const r=auditRepository(root,undefined,{failOnUndocumented:false});assert.equal(injected,true);noPass(r);assert.equal(r.status,"error");}
  finally {fs.closeSync=close;}
}));
test("B manifest changed after collection cannot pass",()=>fixture((root,outside,write)=>{
  write("app.js","process.env.OPENAI_API_KEY");
  const manifest=write("ops.yaml","version: 1\nservices:\n  ai:\n    provider: openai\n"), open=fs.openSync;let injected=false;
  fs.openSync=function(target,...args){if(target===path.join(root,"app.js")&&!injected){injected=true;fs.appendFileSync(manifest,"x-change: true\n");}return open.call(this,target,...args);};
  try {const r=auditRepository(root);assert.equal(injected,true);noPass(r);assert.equal(r.status,"error");}
  finally {fs.openSync=open;}
}));
test("B root replacement before traversal cannot pass",()=>fixture((root,outside,write)=>{
  write("app.js","process.env.OPENAI_API_KEY"); const opendir=fs.opendirSync;let injected=false;
  fs.opendirSync=function(target,...args){if(target===root&&!injected){injected=true;fs.renameSync(root,root+"-saved");fs.mkdirSync(root);fs.writeFileSync(path.join(root,"app.js"),seeded);}return opendir.call(this,target,...args);};
  try {const r=scanRepository(root);assert.equal(injected,true);noPass(r);}
  finally {fs.opendirSync=opendir;}
}));
test("B manifest leaf replacement never reads external descriptor",()=>fixture((root,outside,write)=>{
  const file=write("ops.yaml","version: 1\nservices:\n"),open=fs.openSync;let injected=false;
  fs.openSync=function(target,...args){if(target===file&&!injected){injected=true;fs.unlinkSync(file);fs.writeFileSync(file,seeded);}return open.call(this,target,...args);};
  try {assert.throws(()=>auditRepository(root),/FILESYSTEM_CHANGED/);assert.equal(injected,true);}
  finally {fs.openSync=open;}
}));
test("B hardlink added during open rejected before content read",()=>fixture((root,outside,write)=>{
  const file=write("app.js","process.env.OPENAI_API_KEY"),open=fs.openSync;let injected=false;
  fs.openSync=function(target,...args){if(target===file&&!injected){injected=true;fs.linkSync(file,path.join(outside,"alias.js"));}return open.call(this,target,...args);};
  try {const r=scanRepository(root);assert.equal(injected,true);noPass(r);}
  finally {fs.openSync=open;}
}));
test("B stable isolated checkout remains complete and reports execution contract",()=>fixture((root,outside,write)=>{
  write("app.js","process.env.OPENAI_API_KEY");const r=auditRepository(root,undefined,{failOnUndocumented:false});
  assert.equal(r.complete,true);assert.equal(r.status,"pass");assert.equal(machineReport(r).execution_model,"stable-working-tree");
}));
