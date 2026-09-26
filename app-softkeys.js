'use strict';

// Surface Soft Controls (the C-class softkey assignments), stored in every SurfaceScene as the
// "Surface Soft Controls" record. Decoded from controlled Director 2.12 (C1500) softkey edits.
//
// State layout:
//   [nBanks=02] [u16 entryCount]×2, then nBanks blocks of entryCount entries. Director writes the same
//   26 entries to both blocks. Each entry is [function][01][arg-class][sub][payload…]; the payload size
//   depends on the function (table below). Softkeys 20–26 are unavailable on a C1500 and stay Unused.
const SOFTKEY_LABEL='Surface Soft Controls';
const SOFTKEY_COUNT=26;
const SOFTKEY_CH_TYPES={input:0x01,monoGroup:0x02,stereoGroup:0x03,monoAux:0x04,stereoAux:0x05,main:0x08,monoMatrix:0x0A,stereoMatrix:0x0B,dca:0x0D};
// function code -> total entry length in bytes (first byte is the function code).
const SOFTKEY_ENTRY_LEN={
  0x00:4,   // Unused
  0x01:6,   // Mute (invert on)
  0x02:6,   // Mute
  0x03:6,   // Sel
  0x04:6,   // Mix
  0x05:9,   // PAFL
  0x07:11,  // Level Up
  0x08:11,  // Level Down
  0x0B:6,   // Talkback Assign
  0x0C:8,   // Tap Tempo
  0x0D:6,   // Scene Controls: Specific Scene Recall
  0x0F:6,   // PAFL Clear
  0x10:5,   // Scene Controls: Go
  0x11:5,   // Scene Controls: Store/New/Update/Next/Previous
  0x15:6,   // Mute Group
  0x16:6,   // Mute Group (invert on)
  0x17:4,   // DCA/MCA Spill Active
  0x19:6,   // Fader On-Off
  0x1A:6,   // Fader Start
  0x1C:4,   // Peak Hold Reset
  0x1D:9,   // Assign On/Off
  0x1F:6,   // Talkback Group
  0x22:6,   // MCA On/Off Specific DCA
  0x2F:11   // Set Level
};
const SOFTKEY_SCENE_ACTIONS={store:0,new:1,update:2,next:3,previous:4};

function softkeyFind(dat){
  const sig=asciiBytes(SOFTKEY_LABEL),pos=indexOfBytes(dat,sig);if(pos<2)return null;
  const frameStart=pos-2,len=readU16BE(dat,frameStart),frameEnd=pos+len;
  if(frameEnd>dat.length||dat[pos+sig.length]!==0)return null;
  return {frameStart,frameEnd,stateStart:pos+sig.length+1};
}
function parseSoftKeys(dat){
  const f=softkeyFind(dat);if(!f)return null;
  let p=f.stateStart;const nBanks=dat[p++],counts=[];
  for(let i=0;i<nBanks;i++){counts.push(readU16BE(dat,p));p+=2;}
  const banks=[];
  for(let b=0;b<nBanks;b++){
    const entries=[];
    for(let i=0;i<counts[b];i++){
      const len=SOFTKEY_ENTRY_LEN[dat[p]];
      if(!len||p+len>f.frameEnd)return {...f,valid:false,reason:`unknown softkey function 0x${(dat[p]||0).toString(16)} at entry ${i+1}`};
      entries.push(dat.slice(p,p+len));p+=len;
    }
    banks.push(entries);
  }
  return {...f,valid:p===f.frameEnd,nBanks,counts,banks,reason:p===f.frameEnd?null:'trailing bytes'};
}

// Entry builders (bytes verified from Director captures).
const skBytes=a=>Uint8Array.from(a);
const softKeyEntry={
  unused:()=>skBytes([0,1,0,1]),
  mix:(type,index)=>skBytes([0x04,1,0x04,1,SOFTKEY_CH_TYPES[type],index]),          // index is zero-based
  mute:(type,index,invert)=>skBytes(invert?[0x01,1,2,1,SOFTKEY_CH_TYPES[type],index]:[0x02,1,1,1,SOFTKEY_CH_TYPES[type],index]),
  sel:(type,index)=>skBytes([0x03,1,2,1,SOFTKEY_CH_TYPES[type],index]),
  muteGroup:(n,invert)=>skBytes([invert?0x16:0x15,1,invert?2:1,1,0x0D,0x17+n]),      // n is 1-based; targets follow the 24 DCAs
  paflClear:()=>skBytes([0x0F,1,3,2,0,0]),
  peakHoldReset:()=>skBytes([0x1C,1,3,1]),
  dcaSpillActive:()=>skBytes([0x17,1,5,1]),
  tapTempo:(o)=>skBytes([0x0C,1,3,2,o.global?1:0,o.ufx?1:0,(o.unit||1)-1,o.right?0:1]),
  sceneGo:(autoIncrement)=>skBytes([0x10,1,2,1,autoIncrement?1:0]),
  sceneAction:(action)=>skBytes([0x11,1,2,2,SOFTKEY_SCENE_ACTIONS[action]])
};

function setSoftKeys(list){
  const surface=state.current?.surface;if(!surface)return false;
  // The whole record is replaced, so it is rewritable even when it holds functions this module cannot parse.
  const sk=softkeyFind(surface.datBytes);if(!sk)return false;
  const entries=Array.from({length:SOFTKEY_COUNT},(_,i)=>list[i]||softKeyEntry.unused());
  if(entries.some(e=>!SOFTKEY_ENTRY_LEN[e[0]]||SOFTKEY_ENTRY_LEN[e[0]]!==e.length))return false;
  const label=asciiBytes(SOFTKEY_LABEL);
  const body=[2,0,SOFTKEY_COUNT,0,SOFTKEY_COUNT];
  for(let b=0;b<2;b++)for(const e of entries)body.push(...e);
  const frameLen=label.length+1+body.length;if(frameLen>0xFFFF)return false;
  const old=surface.datBytes,out=new Uint8Array(old.length-(sk.frameEnd-sk.frameStart)+2+frameLen);
  out.set(old.subarray(0,sk.frameStart),0);
  let p=sk.frameStart;out[p++]=frameLen>>8;out[p++]=frameLen&255;
  out.set(label,p);p+=label.length;out[p++]=0;out.set(body,p);p+=body.length;
  out.set(old.subarray(sk.frameEnd),p);
  surface.datBytes=out;surface.banks=parseSurfaceBanks(out);surface.structure=findStructureLabels(out);
  markSurfaceDirty();return true;
}
