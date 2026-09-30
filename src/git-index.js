import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { LIMITS, checkedPath, fail, readBytesBounded, repositoryRoot, within } from "./safety.js";

const MAX_INDEX_BYTES=32*1024*1024;
// Parse metadata only. Never invoke Git, read a link target, or use repository config/hooks.
export function inspectGitIndex(data) {
  const hashBytes=[20,32].find(length=>data.length>=12+length && createHash(length===20?"sha1":"sha256").update(data.subarray(0,-length)).digest().equals(data.subarray(-length)));
  if(!hashBytes || data.toString("ascii",0,4)!=="DIRC")fail("INVALID_GIT_INDEX");
  const version=data.readUInt32BE(4), count=data.readUInt32BE(8), end=data.length-hashBytes;
  if(![2,3,4].includes(version))fail("GIT_INDEX_LAYOUT_UNSUPPORTED");
  if(count>LIMITS.entries)fail("ENTRY_COUNT_LIMIT");
  let cursor=12,previous=Buffer.alloc(0),unsupported=null;
  const need=n=>{if(cursor+n>end)fail("INVALID_GIT_INDEX");};
  for(let index=0;index<count;index++) {
    const start=cursor;need(42+hashBytes);
    const mode=data.readUInt32BE(start+24),flags=data.readUInt16BE(start+40+hashBytes);
    cursor+=42+hashBytes;
    if(flags&0x3000)unsupported="GIT_UNMERGED_INDEX";
    if(flags&0x4000) {
      if(version===2)fail("INVALID_GIT_INDEX");
      need(2);if(data.readUInt16BE(cursor)&~0x2000)unsupported="GIT_INDEX_LAYOUT_UNSUPPORTED";cursor+=2;
    }
    let remove=0;
    if(version===4) {
      need(1);let byte=data[cursor++];remove=byte&127;
      while(byte&128){need(1);byte=data[cursor++];remove=(remove+1)*128+(byte&127);if(remove>LIMITS.path)fail("INVALID_GIT_INDEX");}
      if(remove>previous.length)fail("INVALID_GIT_INDEX");
    }
    const zero=data.indexOf(0,cursor);
    if(zero<cursor||zero>=end||zero-cursor>LIMITS.path)fail("INVALID_GIT_INDEX");
    const name=version===4?Buffer.concat([previous.subarray(0,previous.length-remove),data.subarray(cursor,zero)]):data.subarray(cursor,zero);
    if(!name.length||name.length>LIMITS.path || (flags&4095)!==Math.min(name.length,4095))fail("INVALID_GIT_INDEX");
    let text;try{text=new TextDecoder("utf-8",{fatal:true}).decode(name);}catch{fail("INVALID_GIT_INDEX_PATH");}
    if(text.startsWith("/")||/[\\:]/.test(text)||text.split("/").some(x=>!x||[".","..",".git"].includes(x.toLowerCase())))fail("INVALID_GIT_INDEX_PATH");
    if(previous.length && Buffer.compare(previous,name)>=0)fail("INVALID_GIT_INDEX");
    previous=name;cursor=zero+1;
    if(version!==4) {
      const next=start+Math.ceil((cursor-start)/8)*8;
      if(next>end||data.subarray(cursor,next).some(byte=>byte!==0))fail("INVALID_GIT_INDEX");
      cursor=next;
    }
    if(mode===0o120000)unsupported="GIT_TRACKED_LINK_UNSUPPORTED";
    else if(mode===0o160000)unsupported="GIT_SUBMODULE_UNSUPPORTED";
    else if(![0o100644,0o100755].includes(mode))unsupported="GIT_INDEX_LAYOUT_UNSUPPORTED";
  }
  while(cursor<end) {
    need(8);const first=data[cursor],size=data.readUInt32BE(cursor+4);cursor+=8;need(size);
    if(first<65||first>90)unsupported="GIT_INDEX_LAYOUT_UNSUPPORTED";
    cursor+=size;
  }
  if(cursor!==end)fail("INVALID_GIT_INDEX");
  if(unsupported)fail(unsupported);
  return {version,entries:count,hash:hashBytes===20?"sha1":"sha256"};
}
export function checkGitRepresentation(scanRoot,guard,workspace) {
  const boundary=workspace?repositoryRoot(workspace):null;
  let root=scanRoot,stat;
  while(true) {
    try{
      const marker=path.join(root,".git");stat=fs.lstatSync(marker);
      if(!stat.isDirectory())break;
      let genuine=false;
      for(const name of ["HEAD","index"])try{fs.lstatSync(path.join(marker,name));genuine=true;}catch(error){if(error.code!=="ENOENT")throw error;}
      if(genuine)break;
    }catch(error){if(error.code!=="ENOENT")throw error;}
    const parent=path.dirname(root);if(parent===root)return;root=parent;
  }
  if(boundary&&!within(boundary,root))fail("GIT_METADATA_OUTSIDE_WORKSPACE");
  const directory=path.join(root,".git"),index=path.join(directory,"index");
  checkedPath(root,directory,guard);
  if(!stat.isDirectory())fail("GIT_DIRECTORY_FILE_UNSUPPORTED");
  try{fs.lstatSync(index);}catch(error){
    if(error.code!=="ENOENT")throw error;
    try{fs.lstatSync(path.join(directory,"HEAD"));}catch(headError){if(headError.code==="ENOENT")return;throw headError;}
    fail("GIT_INDEX_MISSING");
  }
  inspectGitIndex(readBytesBounded(root,index,MAX_INDEX_BYTES,Infinity,guard).data);
}
