import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {scanRepository} from "../src/index.js";
test("FS-14 real native permission denial is incomplete and is restored",()=>{
  const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),"ops-native-acl-"))),file=path.join(root,"app.js");
  fs.writeFileSync(file,"SYNTHETIC_PERMISSION_VALUE");
  let user,denied=false;
  const run=(command,args)=>{const r=spawnSync(command,args,{encoding:"utf8",timeout:10000});assert.equal(r.status,0,"Native permission operation failed");return r.stdout.trim();};
  try {
    if(process.platform==="win32") {user=run("whoami",[]);run("icacls",[file,"/deny",user+":(RD)","/Q"]);denied=true;}
    else {fs.chmodSync(file,0o000);denied=true;}
    assert.throws(()=>fs.readFileSync(file),error=>["EACCES","EPERM"].includes(error.code),"Fixture must actually deny this process read access");
    const r=scanRepository(root);assert.equal(r.complete,false);assert.equal(JSON.stringify(r).includes("SYNTHETIC_PERMISSION_VALUE"),false);
  } finally {
    if(denied){if(process.platform==="win32")run("icacls",[file,"/remove:d",user,"/Q"]);else fs.chmodSync(file,0o600);}
    assert.equal(fs.readFileSync(file,"utf8"),"SYNTHETIC_PERMISSION_VALUE");
    if(!root.startsWith(fs.realpathSync.native(os.tmpdir())+path.sep))throw Error("Unsafe fixture cleanup");
    fs.rmSync(root,{recursive:true,force:true});
  }
});
