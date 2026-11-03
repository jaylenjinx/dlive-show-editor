'use strict';

// Global Scene Safes (Scenes › Global Safes). Stored outside the scenes, in the show-level file
// Show/SceneSafes/StageBoxSceneSafes.dat, as one byte per safe (00 off, 01 on).
// Decoded 2026-11-03 from Director 2.12 shows RSAFE0–16 (one grid change per stored show):
//   +0..15            header: 01 01 15, then a copy of the 13-byte MixConfig
//   +16 + 521×(n−1)   Input n block (128 inputs)
//   +66704 + 518×k    mix leg blocks in mix-config order (groups, FX sends, auxes, …; not written here)
// Input block offsets below. Routing sets per-send flags whose positions depend on which buses exist,
// so it is shown but not written. Only the 122,093-byte version-15 file is edited.
const SAFES_PATH='Show/SceneSafes/StageBoxSceneSafes.dat';
const SAFES_INPUT_BASE=16,SAFES_INPUT_STRIDE=521,SAFES_FILE_LENGTH=122093,SAFES_VERSION=0x15;
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
const SAFES_INPUT_FIELDS=[
  {key:'processing',label:'Processing',offsets:[510,...range(512,518),520]},
  {key:'mute',label:'Mute',offsets:[1]},
  {key:'level',label:'Level',offsets:[0]},
  {key:'mainOn',label:'Main On',offsets:[451]},
  {key:'pan',label:'Pan',offsets:[2]},
  {key:'routing',label:'Routing',offsets:[...range(3,17).filter(o=>o%2),...range(115,177),...range(397,411),...range(485,508)],readOnly:true},
  {key:'directOut',label:'Direct Out',offsets:[519]},
  {key:'iemWedge',label:'IEM / Wedge',offsets:[452]},
  {key:'dcaMute',label:'DCA & Mute Grp',offsets:range(453,484)},
  {key:'name',label:'Name & Colour',offsets:[509]}
];

function sceneSafesEntry(){
  const e=state.outerEntries?.find(x=>x.name===SAFES_PATH);if(!e)return null;
  const d=e.content,ok=d.length===SAFES_FILE_LENGTH&&d[0]===1&&d[1]===1&&d[2]===SAFES_VERSION;
  return {entry:e,dat:d,writable:ok};
}
// state per field: 'on' | 'off' | 'partial'
function inputSafes(ch){
  const s=sceneSafesEntry();if(!s||!s.writable||!(ch>=1&&ch<=128))return null;
  const base=SAFES_INPUT_BASE+SAFES_INPUT_STRIDE*(ch-1),out={};
  for(const f of SAFES_INPUT_FIELDS){
    const v=f.offsets.map(o=>s.dat[base+o]);
    // Routing only sets the flags of buses that exist; any set flag counts as on.
    out[f.key]=f.readOnly?(v.some(x=>x)?'on':'off'):(v.every(x=>x===1)?'on':v.every(x=>x===0)?'off':'partial');
  }
  return out;
}
function setInputSafe(ch,key,on){
  const s=sceneSafesEntry(),f=SAFES_INPUT_FIELDS.find(x=>x.key===key);
  if(!s?.writable||!f||f.readOnly||!(ch>=1&&ch<=128))return false;
  const base=SAFES_INPUT_BASE+SAFES_INPUT_STRIDE*(ch-1);
  for(const o of f.offsets)s.dat[base+o]=on?1:0;
  state.showFilesDirty=true;if(typeof updateDirtyStatus==='function')updateDirtyStatus();return true;
}
