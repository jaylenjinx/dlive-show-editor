'use strict';

// Verified input-processing writers derived from controlled dLive 2.12 scenes.
// This module stays deliberately conservative: record shape/discriminators are
// validated before writes and time/routing values expose only directly tested
// anchors/configurations where the continuous transform is not proven.

// Gate state +1 selects the gate model (Director's Gate Libraries): 00 Gate, 01 Ducker / Ducker Slow, 02 Dual Expander, 03 Source Expander.
// Recalling a library preset also rewrites the model's default parameters, so the model byte stays read-only.
const IP_GATE_MODEL_LABELS=new Map([[0,'Gate'],[1,'Ducker'],[2,'Dual Expander'],[3,'Source Expander']]);
// Threshold sits at +2..3 for Gate and Ducker but at +4..5 for Dual Expander and Source Expander (model sweeps, input 13).
// Dual Expander also has a lower threshold (+6..7, −72…+10 dB) and a LIN switch (+12); Source Expander has a speed selector (+17: 0 Slow, 1 Medium, 2 Fast).
// Director clamps: Gate/Ducker −72…+12, Dual upper −70…+12, Source −56…+12.
const IP_GATE_THRESHOLD_MIN_DB=-72;
const IP_GATE_THRESHOLD_MAX_DB=12;
const IP_GATE_EXPANDER_MODELS=new Set([2,3]);
const IP_GATE_THRESHOLD_MIN_BY_MODEL={0:-72,1:-72,2:-70,3:-56};
const IP_GATE_LOWER_MIN_DB=-72,IP_GATE_LOWER_MAX_DB=10;
const IP_GATE_SPEED_LABELS=new Map([[0,'Slow'],[1,'Medium'],[2,'Fast']]);
const IP_GATE_DEPTH_MIN_DB=0;
const IP_GATE_DEPTH_MAX_DB=60;
const IP_TRIM_MIN_DB=-24;
const IP_TRIM_MAX_DB=24;
const IP_PREAMP_GAIN_MIN_DB=5;
const IP_PREAMP_GAIN_MAX_DB=60;
const IP_DELAY_MIN_MS=0;
const IP_DELAY_MAX_MS=340;

// Every tested anchor matches raw = round(17874 + 5958 × log10(ms)) within ±1 raw unit,
// the same time_log coordinate proven continuous on the compressor attack/release and
// RackUltra Decay Time fields, so all three gate time controls are continuous writers.
const IP_GATE_ATTACK_MIN_MS=0.05,IP_GATE_ATTACK_MAX_MS=300;
const IP_GATE_HOLD_MIN_MS=10,IP_GATE_HOLD_MAX_MS=5000;
const IP_GATE_RELEASE_MIN_MS=10,IP_GATE_RELEASE_MAX_MS=1000;
function ipTimeRawFromMs(ms){return Math.max(0,Math.min(0xffff,Math.round(17874+5958*Math.log10(ms))));}
function ipTimeMsFromRaw(raw){return Math.pow(10,(Number(raw)-17874)/5958);}

const IP_STEREO_IMAGE_MODE_LABELS=new Map([
  [0x00,'L/R'],[0x01,'R/L'],[0x02,'L Polarity'],[0x03,'R Polarity'],
  [0x04,'Mono'],[0x05,'L/L'],[0x06,'R/R'],[0x07,'M/S']
]);

// The controlled routing series uses this exact Input Mixer header and 208-byte
// per-input block. We do not extrapolate these offsets to other MixConfigs yet.
const IP_ROUTING_HEADER_208=[0x03,0x04,0x09,0x04,0x04,0x06,0x06,0x02,0x02,0x01,0x01,0x01];
const IP_SEND_NEG_INF_RAW=-32767; // 0x8001

function ipReadU16(dat,off){return ((dat[off]<<8)|dat[off+1])>>>0;}
function ipWriteU16(dat,off,v){v=Math.max(0,Math.min(0xffff,Math.round(Number(v)||0)));dat[off]=(v>>8)&255;dat[off+1]=v&255;}
function ipSignedRawHex(raw){if(raw==null)return '—';let v=Number(raw);if(v<0)v+=0x10000;return `${hexByte(v>>8)} ${hexByte(v&255)}`;}
function ipU16Hex(raw){return raw==null?'—':`${hexByte(raw>>8)} ${hexByte(raw&255)}`;}
function ipTimeLabel(ms){ms=Number(ms);if(ms<1)return `${Math.round(ms*1000)} µs`;if(ms>=1000)return `${ms/1000} s`;return `${ms} ms`;}

function ipParseRecord(dat,label,expectedLength){
  const sig=asciiBytes(label),pos=indexOfBytes(dat,sig);if(pos<2)return null;
  const payloadLength=readU16BE(dat,pos-2),frameStart=pos-2,frameEnd=pos+payloadLength;
  const nul=pos+sig.length;if(frameEnd>dat.length||dat[nul]!==0)return null;
  const stateStart=nul+1,stateLength=frameEnd-stateStart;if(expectedLength!=null&&stateLength!==expectedLength)return null;
  return {label,frameStart,pos,payloadLength,frameEnd,stateStart,stateLength};
}

function parseInputGates(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`Gate, Input Channel ${String(channel).padStart(2,'0')}`;
    const r=ipParseRecord(dat,label,19);if(!r)continue;
    const s=r.stateStart;
    const thrOff=IP_GATE_EXPANDER_MODELS.has(dat[s+1])?s+4:s+2;
    const thresholdRaw=readI16BE(dat,thrOff),depthRaw=readI16BE(dat,s+8);
    const holdRaw=ipReadU16(dat,s+10),releaseRaw=ipReadU16(dat,s+13),attackRaw=ipReadU16(dat,s+15);
    const enableRaw=dat[s+18],writableShape=dat[s]===0x03&&(enableRaw===0||enableRaw===1);
    out.push({...r,channel,discriminator:dat[s],modelRaw:dat[s+1],modelLabel:IP_GATE_MODEL_LABELS.get(dat[s+1])||`Unknown 0x${hexByte(dat[s+1])}`,thresholdOffset:thrOff,thresholdRaw,thresholdDb:thresholdRaw/256,lowerThresholdOffset:s+6,lowerThresholdDb:readI16BE(dat,s+6)/256,linOffset:s+12,lin:dat[s+12]===1,speedOffset:s+17,speedRaw:dat[s+17],
      depthOffset:s+8,depthRaw,depthDb:depthRaw/256,
      holdOffset:s+10,holdRaw,holdMs:ipTimeMsFromRaw(holdRaw),
      releaseOffset:s+13,releaseRaw,releaseMs:ipTimeMsFromRaw(releaseRaw),
      attackOffset:s+15,attackRaw,attackMs:ipTimeMsFromRaw(attackRaw),
      enableOffset:s+18,enableRaw,active:enableRaw===1,writableShape});
  }
  return out;
}

function parseInputDelays(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`Delay, Input Channel ${String(channel).padStart(2,'0')}`;
    const r=ipParseRecord(dat,label,4);if(!r)continue;
    const s=r.stateStart,delayRaw=ipReadU16(dat,s+1),bypassRaw=dat[s+3];
    out.push({...r,channel,discriminator:dat[s],delayOffset:s+1,delayRaw,delayMs:delayRaw/96,
      bypassOffset:s+3,bypassRaw,active:bypassRaw===0,writableShape:dat[s]===0x01&&(bypassRaw===0||bypassRaw===1)});
  }
  return out;
}

function parseInputAttenuators(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`Digital Attenuator Input Channel ${String(channel).padStart(2,'0')}`;
    const r=ipParseRecord(dat,label,5);if(!r)continue;
    const s=r.stateStart,trimRaw=readI16BE(dat,s+1),polarityRaw=dat[s+3];
    out.push({...r,channel,discriminator:dat[s],trimOffset:s+1,trimRaw,trimDb:trimRaw/256,
      polarityOffset:s+3,polarityRaw,polarityReversed:polarityRaw===1,
      trailingRaw:dat[s+4],writableShape:dat[s]===0x01&&(polarityRaw===0||polarityRaw===1)});
  }
  return out;
}

function parseInputStereoImages(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`Stereo Image Input Channel ${String(channel).padStart(2,'0')}`;
    const r=ipParseRecord(dat,label,4);if(!r)continue;
    const s=r.stateStart,widthRaw=dat[s+2],modeRaw=dat[s+3];
    out.push({...r,channel,discriminator:dat[s],unknownRaw:dat[s+1],widthOffset:s+2,widthRaw,widthPercent:widthRaw,
      modeOffset:s+3,modeRaw,modeLabel:IP_STEREO_IMAGE_MODE_LABELS.get(modeRaw)||`Unknown 0x${hexByte(modeRaw)}`,
      writableShape:dat[s]===0x01&&widthRaw<=100&&IP_STEREO_IMAGE_MODE_LABELS.has(modeRaw)});
  }
  return out;
}

function parseStageBoxAnalogueInputs(dat){
  const out=[];
  for(let socket=1;socket<=128;socket++){
    const label=`StageBox Analogue Input, Number ${String(socket).padStart(2,'0')}`;
    const r=ipParseRecord(dat,label,5);if(!r)continue;
    const s=r.stateStart,gainRaw=readI16BE(dat,s+1),padRaw=dat[s+3],phantomRaw=dat[s+4];
    out.push({...r,socket,discriminator:dat[s],gainOffset:s+1,gainRaw,gainDb:gainRaw/256,
      padOffset:s+3,padRaw,padOn:padRaw===1,phantomOffset:s+4,phantomRaw,phantomOn:phantomRaw===1,
      writableShape:dat[s]===0x01&&(padRaw===0||padRaw===1)&&(phantomRaw===0||phantomRaw===1)});
  }
  return out;
}

function ensureInputProcessing(){
  const stage=state.current?.stage;if(!stage)return null;
  if(!stage.inputGates)stage.inputGates=parseInputGates(stage.datBytes);
  if(!stage.inputDelays)stage.inputDelays=parseInputDelays(stage.datBytes);
  if(!stage.inputAttenuators)stage.inputAttenuators=parseInputAttenuators(stage.datBytes);
  if(!stage.inputStereoImages)stage.inputStereoImages=parseInputStereoImages(stage.datBytes);
  if(!stage.stageBoxAnalogueInputs)stage.stageBoxAnalogueInputs=parseStageBoxAnalogueInputs(stage.datBytes);
  return {gates:stage.inputGates,delays:stage.inputDelays,attenuators:stage.inputAttenuators,stereoImages:stage.inputStereoImages,analogueInputs:stage.stageBoxAnalogueInputs};
}
function getInputGate(channel){return ensureInputProcessing()?.gates?.find(x=>x.channel===Number(channel))||null;}
function getInputDelay(channel){return ensureInputProcessing()?.delays?.find(x=>x.channel===Number(channel))||null;}
function getInputAttenuator(channel){return ensureInputProcessing()?.attenuators?.find(x=>x.channel===Number(channel))||null;}
function getInputStereoImage(channel){return ensureInputProcessing()?.stereoImages?.find(x=>x.channel===Number(channel))||null;}
function getStageBoxAnalogueInput(socket){return ensureInputProcessing()?.analogueInputs?.find(x=>x.socket===Number(socket))||null;}

function setInputGateActive(channel,on){const g=getInputGate(channel);if(!g?.writableShape)return false;const raw=on?1:0;state.current.stage.datBytes[g.enableOffset]=raw;g.enableRaw=raw;g.active=!!on;markStageDirty();return true;}
function setInputGateThreshold(channel,db){const g=getInputGate(channel);if(!g?.writableShape)return false;let v=Number(db);if(!Number.isFinite(v))return false;v=Math.max(IP_GATE_THRESHOLD_MIN_BY_MODEL[g.modelRaw]??IP_GATE_THRESHOLD_MIN_DB,Math.min(IP_GATE_THRESHOLD_MAX_DB,v));const raw=Math.round(v*256);writeI16BE(state.current.stage.datBytes,g.thresholdOffset,raw);g.thresholdRaw=raw;g.thresholdDb=raw/256;markStageDirty();return true;}
function setInputGateLowerThreshold(channel,db){const g=getInputGate(channel);if(!g?.writableShape||g.modelRaw!==2)return false;let v=Number(db);if(!Number.isFinite(v))return false;v=Math.max(IP_GATE_LOWER_MIN_DB,Math.min(IP_GATE_LOWER_MAX_DB,v));const raw=Math.round(v*256);writeI16BE(state.current.stage.datBytes,g.lowerThresholdOffset,raw);g.lowerThresholdDb=raw/256;markStageDirty();return true;}
function setInputGateLin(channel,on){const g=getInputGate(channel);if(!g?.writableShape||g.modelRaw!==2)return false;state.current.stage.datBytes[g.linOffset]=on?1:0;g.lin=!!on;markStageDirty();return true;}
function setInputGateSpeed(channel,raw){const g=getInputGate(channel);raw=Number(raw);if(!g?.writableShape||g.modelRaw!==3||!IP_GATE_SPEED_LABELS.has(raw))return false;state.current.stage.datBytes[g.speedOffset]=raw;g.speedRaw=raw;markStageDirty();return true;}
function setInputGateDepth(channel,db){const g=getInputGate(channel);if(!g?.writableShape)return false;let v=Number(db);if(!Number.isFinite(v))return false;v=Math.max(IP_GATE_DEPTH_MIN_DB,Math.min(IP_GATE_DEPTH_MAX_DB,v));const raw=Math.round(v*256);writeI16BE(state.current.stage.datBytes,g.depthOffset,raw);g.depthRaw=raw;g.depthDb=raw/256;markStageDirty();return true;}
function setInputGateTime(channel,kind,msValue){
  const g=getInputGate(channel);if(!g?.writableShape)return false;let ms=Number(msValue);if(!Number.isFinite(ms))return false;
  if(g.modelRaw===3||(IP_GATE_EXPANDER_MODELS.has(g.modelRaw)&&kind==='hold'))return false;
  const range=kind==='attack'?[IP_GATE_ATTACK_MIN_MS,IP_GATE_ATTACK_MAX_MS]:kind==='hold'?[IP_GATE_HOLD_MIN_MS,IP_GATE_HOLD_MAX_MS]:kind==='release'?[IP_GATE_RELEASE_MIN_MS,IP_GATE_RELEASE_MAX_MS]:null;if(!range)return false;
  ms=Math.max(range[0],Math.min(range[1],ms));const raw=ipTimeRawFromMs(ms);
  const off=kind==='attack'?g.attackOffset:kind==='hold'?g.holdOffset:g.releaseOffset;ipWriteU16(state.current.stage.datBytes,off,raw);
  if(kind==='attack'){g.attackRaw=raw;g.attackMs=ms;}else if(kind==='hold'){g.holdRaw=raw;g.holdMs=ms;}else{g.releaseRaw=raw;g.releaseMs=ms;}
  markStageDirty();return true;
}

function setInputDelayActive(channel,on){const d=getInputDelay(channel);if(!d?.writableShape)return false;const raw=on?0:1;state.current.stage.datBytes[d.bypassOffset]=raw;d.bypassRaw=raw;d.active=!!on;markStageDirty();return true;}
function setInputDelayMs(channel,ms){const d=getInputDelay(channel);if(!d?.writableShape)return false;let v=Number(ms);if(!Number.isFinite(v))return false;v=Math.max(IP_DELAY_MIN_MS,Math.min(IP_DELAY_MAX_MS,v));const raw=Math.round(v*96);ipWriteU16(state.current.stage.datBytes,d.delayOffset,raw);d.delayRaw=raw;d.delayMs=raw/96;markStageDirty();return true;}

function setInputTrimDb(channel,db){const a=getInputAttenuator(channel);if(!a?.writableShape)return false;let v=Number(db);if(!Number.isFinite(v))return false;v=Math.max(IP_TRIM_MIN_DB,Math.min(IP_TRIM_MAX_DB,v));const raw=Math.round(v*256);writeI16BE(state.current.stage.datBytes,a.trimOffset,raw);a.trimRaw=raw;a.trimDb=raw/256;markStageDirty();return true;}
function setInputPolarity(channel,reversed){const a=getInputAttenuator(channel);if(!a?.writableShape)return false;const raw=reversed?1:0;state.current.stage.datBytes[a.polarityOffset]=raw;a.polarityRaw=raw;a.polarityReversed=!!reversed;markStageDirty();return true;}

function setInputStereoWidth(channel,percent){const s=getInputStereoImage(channel);if(!s?.writableShape)return false;let v=Number(percent);if(!Number.isFinite(v))return false;v=Math.max(0,Math.min(100,Math.round(v)));state.current.stage.datBytes[s.widthOffset]=v;s.widthRaw=v;s.widthPercent=v;markStageDirty();return true;}
function setInputStereoMode(channel,rawValue){const s=getInputStereoImage(channel),raw=Number(rawValue);if(!s?.writableShape||!IP_STEREO_IMAGE_MODE_LABELS.has(raw))return false;state.current.stage.datBytes[s.modeOffset]=raw;s.modeRaw=raw;s.modeLabel=IP_STEREO_IMAGE_MODE_LABELS.get(raw);markStageDirty();return true;}

function setStageBoxPreampGain(socket,db){const p=getStageBoxAnalogueInput(socket);if(!p?.writableShape)return false;let v=Number(db);if(!Number.isFinite(v))return false;v=Math.max(IP_PREAMP_GAIN_MIN_DB,Math.min(IP_PREAMP_GAIN_MAX_DB,v));const raw=Math.round(v*256);writeI16BE(state.current.stage.datBytes,p.gainOffset,raw);p.gainRaw=raw;p.gainDb=raw/256;markStageDirty();return true;}
function setStageBoxPreampPad(socket,on){const p=getStageBoxAnalogueInput(socket);if(!p?.writableShape)return false;const raw=on?1:0;state.current.stage.datBytes[p.padOffset]=raw;p.padRaw=raw;p.padOn=!!on;markStageDirty();return true;}
function setStageBoxPreampPhantom(socket,on){const p=getStageBoxAnalogueInput(socket);if(!p?.writableShape)return false;const raw=on?1:0;state.current.stage.datBytes[p.phantomOffset]=raw;p.phantomRaw=raw;p.phantomOn=!!on;markStageDirty();return true;}

function ipRoutingWritableShape(mixer){if(!mixer?.writableShape||mixer.blockSize!==208||mixer.header?.length!==12)return false;return IP_ROUTING_HEADER_208.every((v,i)=>mixer.header[i]===v);}
function getControlledInputRouting(channel){
  const mixer=ensureChannelState()?.mixer,ch=mixer?.channels?.[Number(channel)-1];if(!mixer||!ch)return null;
  const b=state.current.stage.datBytes,base=ch.blockStart,shape=ipRoutingWritableShape(mixer);
  const readLevel=off=>{const raw=readI16BE(b,base+off),inf=raw===IP_SEND_NEG_INF_RAW;return {raw,infinite:inf,db:inf?null:raw/256};};
  return {channel:Number(channel),mixer,ch,writableShape:shape,
    monoGroup1:{offset:base+0,raw:b[base+0],on:b[base+0]===1,known:b[base+0]===0||b[base+0]===1},
    stereoGroup1:{offset:base+4,raw:b[base+4],on:b[base+4]===1,known:b[base+4]===0||b[base+4]===1},
    aux1:{enableOffset:base+29,enableRaw:b[base+29],on:b[base+29]===1,enableKnown:b[base+29]===0||b[base+29]===1,prepostOffset:base+30,prepostRaw:b[base+30],pre:b[base+30]===1,prepostKnown:b[base+30]===0||b[base+30]===1,levelOffset:base+31,...readLevel(31)},
    aux2:{levelOffset:base+35,...readLevel(35)},
    stereoAux1:{levelOffset:base+75,...readLevel(75)}
  };
}
function setControlledRoutingToggle(channel,kind,on){const r=getControlledInputRouting(channel);if(!r?.writableShape)return false;let obj;if(kind==='monoGroup1')obj=r.monoGroup1;else if(kind==='stereoGroup1')obj=r.stereoGroup1;else if(kind==='aux1')obj={offset:r.aux1.enableOffset,known:r.aux1.enableKnown};else return false;if(!obj.known)return false;state.current.stage.datBytes[obj.offset]=on?1:0;markStageDirty();return true;}
function setControlledAux1Pre(channel,pre){const r=getControlledInputRouting(channel);if(!r?.writableShape||!r.aux1.prepostKnown)return false;state.current.stage.datBytes[r.aux1.prepostOffset]=pre?1:0;markStageDirty();return true;}
function setControlledSendLevel(channel,kind,value){
  const r=getControlledInputRouting(channel);if(!r?.writableShape)return false;const target=kind==='aux1'?r.aux1:kind==='aux2'?r.aux2:kind==='stereoAux1'?r.stereoAux1:null;if(!target)return false;
  let raw;if(value==='-inf'||value===-Infinity)raw=IP_SEND_NEG_INF_RAW;else{let db=Number(value);if(!Number.isFinite(db))return false;const min=kind==='aux1'?-30:-20,max=kind==='aux1'?10:0;db=Math.max(min,Math.min(max,db));raw=Math.round(db*256);}writeI16BE(state.current.stage.datBytes,target.levelOffset,raw);markStageDirty();return true;
}
