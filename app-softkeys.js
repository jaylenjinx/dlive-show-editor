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
  0x09:14,  // Send Level Up
  0x0D:6,   // Scene Controls: Specific Scene Recall
  0x0F:6,   // PAFL Clear
  0x10:5,   // Scene Controls: Go
  0x11:5,   // Scene Controls: Store/New/Update/Next/Previous
  0x15:6,   // Mute Group
  0x16:6,   // Mute Group (invert on)
  0x17:4,   // DCA/MCA Spill Active
  0x18:7,   // AMM Control
  0x19:6,   // Fader On-Off
  0x1A:6,   // Fader Start
  0x1C:4,   // Peak Hold Reset
  0x1D:9,   // Assign On/Off
  0x1F:6,   // Talkback Group
  0x22:6,   // MCA On/Off Specific DCA
  0x23:9,   // Assign On/Off (invert on)
  0x2A:7,   // Channel Processing
  0x2F:11,  // Set Level
  0x30:11,  // Set Send Level
  0x34:6,   // Set Bypass UFX
  // Decoded 2026-11-03 (Director 2.12, S5000, scenes 113–140):
  0x0A:14,  // Send Level Down (same layout as Send Level Up)
  0x12:12,  // Sel Mix PAFL Scene
  0x1E:4,   // SIP
  0x20:4,   // MCA On/Off Selected DCAs
  0x21:4,   // MCA On/Off All DCAs
  0x24:5,   // ABCD Set All
  0x25:6,   // ABCD Set Channel
  0x26:5,   // PAFL - Surface Number
  0x28:7,   // ABCD Set Range
  0x29:6,   // ABCD Set For DCA
  0x2B:5,   // Virtual Sound Check
  0x2C:5,   // USB Play/Record
  0x2D:4,   // Talkback Additive Groups
  0x2E:11,  // Assign Range
  0x31:10   // Channel Processing Range
};
// Variable-length functions (not parsed; a record holding them stays read-only): 0x0E Custom MIDI,
// 0x27 Bookmark, 0x32 Strip Assign Recall and 0x33 Action Recall carry MIDI bytes or NUL-terminated
// names, and their Director 2.12 layout differs from older shows.
const SOFTKEY_ABCD_SOURCES={off:0,A:1,B:2,C:3,D:4};
const SOFTKEY_USB_MODES={stop:0,playPause:1,record:2};
const SOFTKEY_VSC_MODES={inactive:0,recordSend:1,virtualSoundcheck:2};
// Levels in softkey entries use the fader coordinate: raw = 0x8000 + round(dB×256), −∞ = 0x0000.
function skLevel(db){if(db===null||db===-Infinity)return [0,0];const r=0x8000+Math.round(Math.max(-127,Math.min(10,Number(db)))*256);return [r>>8,r&255];}
const SOFTKEY_CP_FUNCTIONS={preampModel:1,lpf:2,hpf:3,gate:4,insertA:5,insertB:6,compressor:7,peq:8};
const SOFTKEY_SCENE_ACTIONS={store:0,new:1,update:2,next:3,previous:4};

function softkeyFind(dat){
  const sig=asciiBytes(SOFTKEY_LABEL),pos=indexOfBytes(dat,sig);if(pos<2)return null;
  const frameStart=pos-2,len=readU16BE(dat,frameStart),frameEnd=pos+len;
  if(frameEnd>dat.length||dat[pos+sig.length]!==0)return null;
  return {frameStart,frameEnd,stateStart:pos+sig.length+1};
}
// Byte 4 of an entry is its format: older shows store Tap Tempo with format 01 and no Left/Right byte
// (`0C 01 03 01 G U u`, 7 bytes); Director 2.12 writes format 02 (8 bytes). Checked on 1,413 USB-corpus records.
function softkeyEntryLen(dat,p){
  if(dat[p]===0x0C&&dat[p+3]===0x01)return 7;
  return SOFTKEY_ENTRY_LEN[dat[p]];
}
function parseSoftKeys(dat){
  const f=softkeyFind(dat);if(!f)return null;
  let p=f.stateStart;const nBanks=dat[p++],counts=[];
  for(let i=0;i<nBanks;i++){counts.push(readU16BE(dat,p));p+=2;}
  const banks=[];
  for(let b=0;b<nBanks;b++){
    const entries=[];
    for(let i=0;i<counts[b];i++){
      const len=softkeyEntryLen(dat,p);
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
  sceneAction:(action)=>skBytes([0x11,1,2,2,SOFTKEY_SCENE_ACTIONS[action]]),
  sceneRecall:(scene)=>skBytes([0x0D,1,2,1,(scene-1)>>8,(scene-1)&255]),             // scene is 1-based
  pafl:(type,index)=>skBytes([0x05,1,3,1,SOFTKEY_CH_TYPES[type],index,2,0,0]),
  levelUp:(type,index,minDb,maxDb)=>skBytes([0x07,1,2,1,SOFTKEY_CH_TYPES[type],index,1,...skLevel(minDb),...skLevel(maxDb)]),
  levelDown:(type,index,minDb,maxDb)=>skBytes([0x08,1,2,1,SOFTKEY_CH_TYPES[type],index,1,...skLevel(minDb),...skLevel(maxDb)]),
  setLevel:(type,index,db)=>skBytes([0x2F,1,4,1,0,0,1,SOFTKEY_CH_TYPES[type],index,...skLevel(db)]),
  faderStart:(type,index)=>skBytes([0x1A,1,1,1,SOFTKEY_CH_TYPES[type],index]),
  faderOnOff:(type,index)=>skBytes([0x19,1,1,1,SOFTKEY_CH_TYPES[type],index]),
  mcaSpecific:(type,index)=>skBytes([0x22,1,3,1,SOFTKEY_CH_TYPES[type],index]),
  talkbackAssign:(type,index)=>skBytes([0x0B,1,2,1,SOFTKEY_CH_TYPES[type],index]),
  talkbackGroup:(n,latching=true)=>skBytes([0x1F,1,0,2,n-1,latching?1:0]),
  // send = channel feeding the send (e.g. an input), receive = the mix (e.g. a mono aux)
  sendLevelUp:(sendType,sendIndex,rcvType,rcvIndex,minDb,maxDb)=>skBytes([0x09,1,4,1,SOFTKEY_CH_TYPES[sendType],sendIndex,1,...skLevel(minDb),...skLevel(maxDb),1,SOFTKEY_CH_TYPES[rcvType],rcvIndex]),
  setSendLevel:(rcvType,rcvIndex,sendType,sendIndex,db)=>skBytes([0x30,1,4,1,SOFTKEY_CH_TYPES[rcvType],rcvIndex,1,SOFTKEY_CH_TYPES[sendType],sendIndex,...skLevel(db)]),
  ufxBypass:(unit)=>skBytes([0x34,1,2,1,unit-1,0]),
  ammInOut:(n)=>skBytes([0x18,1,2,1,0,n-1,0]),
  // Assign On/Off: source channel → destination mix; invert uses function 23 / class 01
  assignOnOff:(srcType,srcIndex,dstType,dstIndex,invert)=>skBytes([invert?0x23:0x1D,1,invert?1:4,1,SOFTKEY_CH_TYPES[srcType],srcIndex,1,SOFTKEY_CH_TYPES[dstType],dstIndex]),
  // Channel Processing In/Out toggle for one channel's processing block
  channelProcessing:(type,index,fn)=>skBytes([0x2A,1,2,1,SOFTKEY_CP_FUNCTIONS[fn],SOFTKEY_CH_TYPES[type],index]),
  sendLevelDown:(sendType,sendIndex,rcvType,rcvIndex,minDb,maxDb)=>skBytes([0x0A,1,4,1,SOFTKEY_CH_TYPES[sendType],sendIndex,1,...skLevel(minDb),...skLevel(maxDb),1,SOFTKEY_CH_TYPES[rcvType],rcvIndex]),
  sip:()=>skBytes([0x1E,1,6,1]),
  mcaSelectedDcas:()=>skBytes([0x20,1,3,1]),
  mcaAllDcas:()=>skBytes([0x21,1,4,1]),
  talkbackAdditiveGroups:()=>skBytes([0x2D,1,2,1]),
  // ABCD source: 'off' (Disable ABCD) or 'A'–'D'; channel indexes are zero-based
  abcdSetAll:(src)=>skBytes([0x24,1,2,1,SOFTKEY_ABCD_SOURCES[src]]),
  abcdSetChannel:(index,src)=>skBytes([0x25,1,2,1,index,SOFTKEY_ABCD_SOURCES[src]]),
  abcdSetRange:(start,end,src)=>skBytes([0x28,1,2,1,start,end,SOFTKEY_ABCD_SOURCES[src]]),
  abcdSetForDca:(dca,src)=>skBytes([0x29,1,2,1,dca,SOFTKEY_ABCD_SOURCES[src]]),
  paflSurfaceNumber:(n)=>skBytes([0x26,1,3,1,n-1]),
  usbPlayRecord:(mode)=>skBytes([0x2C,1,2,1,SOFTKEY_USB_MODES[mode]]),
  virtualSoundcheck:(mode)=>skBytes([0x2B,1,2,1,SOFTKEY_VSC_MODES[mode]]),
  // Assign Range: send channels start..end (zero-based) of one type → destination mix; mode byte 00 = Toggle
  assignRange:(sendType,start,end,dstType,dstIndex)=>skBytes([0x2E,1,4,1,SOFTKEY_CH_TYPES[sendType],start,end,1,0,SOFTKEY_CH_TYPES[dstType],dstIndex]),
  // Channel Processing Range: mode byte 02 = Set Off (Director's default); fn as for channelProcessing
  channelProcessingRange:(type,start,end,fn)=>skBytes([0x31,1,2,1,SOFTKEY_CH_TYPES[type],start,end,1,2,SOFTKEY_CP_FUNCTIONS[fn]])
};

function setSoftKeys(list){
  const surface=state.current?.surface;if(!surface)return false;
  // The whole record is replaced, so it is rewritable even when it holds functions this module cannot parse.
  const sk=softkeyFind(surface.datBytes);if(!sk)return false;
  const entries=Array.from({length:SOFTKEY_COUNT},(_,i)=>list[i]||softKeyEntry.unused());
  if(entries.some(e=>!SOFTKEY_ENTRY_LEN[e[0]]||softkeyEntryLen(e,0)!==e.length))return false;
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

// Plain-language description of one parsed entry (for read-only listings).
const SOFTKEY_TYPE_NAMES={0x01:'Ip',0x02:'Grp',0x03:'St Grp',0x04:'Aux',0x05:'St Aux',0x08:'Main',0x0A:'Mtx',0x0B:'St Mtx',0x0D:'DCA'};
function softkeyChannelName(t,i){
  if(t===0x0D&&i>=0x18)return `Mute Group ${i-0x17}`;
  return `${SOFTKEY_TYPE_NAMES[t]||`type ${t}`} ${i+1}`;
}
function softkeyLevelText(hi,lo){const r=(hi<<8)|lo;return r===0?'−∞':`${((r-0x8000)/256).toFixed(1)} dB`;}
function softkeyDescribe(e){
  const f=e[0],ch=(o)=>softkeyChannelName(e[o],e[o+1]),cp=Object.entries(SOFTKEY_CP_FUNCTIONS).find(([,v])=>v===e[e.length-1])?.[0];
  const abcd=v=>v?`Source ${'ABCD'[v-1]}`:'Disable ABCD';
  switch(f){
    case 0x00:return 'Unused';
    case 0x01:return `Mute ${ch(4)} (inverted)`;case 0x02:return `Mute ${ch(4)}`;case 0x03:return `Sel ${ch(4)}`;case 0x04:return `Mix ${ch(4)}`;
    case 0x05:return `PAFL ${ch(4)}`;case 0x07:return `Level Up ${ch(4)}`;case 0x08:return `Level Down ${ch(4)}`;
    case 0x09:return `Send Level Up ${ch(4)} → ${ch(12)}`;case 0x0A:return `Send Level Down ${ch(4)} → ${ch(12)}`;
    case 0x0B:return `Talkback Assign ${ch(4)}`;case 0x0C:return e[3]===1?'Tap Tempo (older format)':`Tap Tempo ${e[4]?'Global':(e[5]?`UFX ${e[6]+1}`:`FX ${e[6]+1}`)}`;
    case 0x0D:return `Recall Scene ${((e[4]<<8)|e[5])+1}`;case 0x0F:return 'PAFL Clear';case 0x10:return `Scene Go${e[4]?' (auto increment)':''}`;
    case 0x11:return `Scene ${['Store','New','Update','Next','Previous'][e[4]]||e[4]}`;case 0x12:return `Sel Mix PAFL Scene ${ch(4)}`;
    case 0x15:return `${ch(4)}`;case 0x16:return `${ch(4)} (inverted)`;case 0x17:return 'DCA/MCA Spill Active';case 0x18:return `AMM ${e[5]+1} In/Out`;
    case 0x19:return `Fader On-Off ${ch(4)}`;case 0x1A:return `Fader Start ${ch(4)}`;case 0x1C:return 'Peak Hold Reset';
    case 0x1D:return `Assign ${ch(4)} → ${ch(7)}`;case 0x23:return `Assign ${ch(4)} → ${ch(7)} (inverted)`;case 0x1E:return 'SIP';case 0x1F:return `Talkback Group ${e[4]+1}`;
    case 0x20:return 'MCA On/Off Selected DCAs';case 0x21:return 'MCA On/Off All DCAs';case 0x22:return `MCA On/Off ${ch(4)}`;
    case 0x24:return `ABCD Set All: ${abcd(e[4])}`;case 0x25:return `ABCD Set Ip ${e[4]+1}: ${abcd(e[5])}`;case 0x26:return `PAFL Surface Number ${e[4]+1}`;
    case 0x28:return `ABCD Set Ip ${e[4]+1}–${e[5]+1}: ${abcd(e[6])}`;case 0x29:return `ABCD Set DCA ${e[4]+1}: ${abcd(e[5])}`;
    case 0x2A:return `${cp||'Processing'} In/Out ${ch(5)}`;case 0x2B:return `Virtual Sound Check: ${['Inactive','Record Send','Virtual SoundCheck'][e[4]]||e[4]}`;
    case 0x2C:return `USB ${['Stop','Play / Pause','Record'][e[4]]||e[4]}`;case 0x2D:return 'Talkback Additive Groups';
    case 0x2E:return `Assign ${SOFTKEY_TYPE_NAMES[e[4]]||e[4]} ${e[5]+1}–${e[6]+1} → ${ch(9)}`;case 0x2F:return `Set Level ${ch(7)} ${softkeyLevelText(e[9],e[10])}`;
    case 0x30:return `Set Send Level ${ch(7)} → ${ch(4)} ${softkeyLevelText(e[9],e[10])}`;case 0x31:return `${cp||'Processing'} Range ${SOFTKEY_TYPE_NAMES[e[4]]||''} ${e[5]+1}–${e[6]+1}`;
    case 0x34:return `Bypass UFX ${e[4]+1}`;
    default:return `Function 0x${f.toString(16).padStart(2,'0')}`;
  }
}
