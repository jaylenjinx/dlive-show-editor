'use strict';

// Additional compressor mappings from the second controlled parameter-sweep
// batch: Manual Peak cross-checks and Opto model-specific controls.
const COMP_MANUAL_PEAK_MODEL=0x00;
const COMP_MP_THRESHOLD_MIN_DB=-40;
const COMP_MP_THRESHOLD_MAX_DB=0;
const COMP_MP_RATIO_RAW_TO_LABEL=new Map([[0x10,'2:1'],[0x26,'20:1']]);
const COMP_MP_ATTACK_RAW_TO_MS=new Map([[0x2261,0.03],[0x745E,100]]);
const COMP_MP_RELEASE_RAW_TO_MS=new Map([[0x6D5C,50],[0x8BA3,1000]]);
const COMP_MP_GAIN_MIN_DB=0;
const COMP_MP_GAIN_MAX_DB=12;

const COMP_OPTO_MODEL=0x02;
const COMP_OPTO_ATTACK_LABELS=new Map([[0,'Fast'],[1,'Medium'],[2,'Slow']]);
const COMP_OPTO_RECOVERY_LABELS=new Map([[0,'Fast'],[1,'Medium'],[2,'Slow']]);
const COMP_OPTO_RATIO_RAW_TO_LABEL=new Map([[0x00,'1.2:1'],[0x0D,'1.5:1'],[0x11,'2:1'],[0x16,'3:1'],[0x1C,'4:1'],[0x25,'6:1'],[0x28,'10:1']]);
const COMP_OPTO_GAIN_MIN_DB=-18;
const COMP_OPTO_GAIN_MAX_DB=18;

const parseInputCompressorStatesBeforeExtraModels=parseInputCompressorStates;
parseInputCompressorStates=function(dat){
  const out=parseInputCompressorStatesBeforeExtraModels(dat);
  for(const c of out){
    if(c.modelRaw===COMP_MANUAL_PEAK_MODEL&&c.stateLength>=19){
      c.thresholdWritableShape=!!c.writableShape;
      c.thresholdMinDb=COMP_MP_THRESHOLD_MIN_DB;c.thresholdMaxDb=COMP_MP_THRESHOLD_MAX_DB;c.thresholdStepDb=0.1;
      c.mpRatioKnown=COMP_MP_RATIO_RAW_TO_LABEL.has(c.ratioRaw);
      if(c.mpRatioKnown)c.ratioLabel=COMP_MP_RATIO_RAW_TO_LABEL.get(c.ratioRaw);
      c.mpRatioWritableShape=!!c.writableShape;
      c.mpAttackExact=COMP_MP_ATTACK_RAW_TO_MS.has(c.attackRaw);c.mpReleaseExact=COMP_MP_RELEASE_RAW_TO_MS.has(c.releaseRaw);
      if(c.mpAttackExact){c.attackMs=COMP_MP_ATTACK_RAW_TO_MS.get(c.attackRaw);c.attackExact=true;}
      if(c.mpReleaseExact){c.releaseMs=COMP_MP_RELEASE_RAW_TO_MS.get(c.releaseRaw);c.releaseExact=true;}
      c.mpTimeWritableShape=!!c.writableShape;
      c.mpGainWritableShape=!!c.writableShape;
    }else{
      c.mpRatioKnown=false;c.mpRatioWritableShape=false;c.mpAttackExact=false;c.mpReleaseExact=false;c.mpTimeWritableShape=false;c.mpGainWritableShape=false;
    }

    if(c.modelRaw===COMP_OPTO_MODEL&&c.stateLength>=23){
      c.optoAttackOffset=c.stateStart+19;c.optoAttackRaw=dat[c.optoAttackOffset];c.optoAttackLabel=COMP_OPTO_ATTACK_LABELS.get(c.optoAttackRaw)||`Unknown 0x${hexByte(c.optoAttackRaw)}`;
      c.optoRecoveryOffset=c.stateStart+20;c.optoRecoveryRaw=dat[c.optoRecoveryOffset];c.optoRecoveryLabel=COMP_OPTO_RECOVERY_LABELS.get(c.optoRecoveryRaw)||`Unknown 0x${hexByte(c.optoRecoveryRaw)}`;
      c.optoBurnOffset=c.stateStart+21;c.optoBurnRaw=dat[c.optoBurnOffset];c.optoBurnKnown=c.optoBurnRaw===0||c.optoBurnRaw===1;c.optoBurnActive=c.optoBurnRaw===1;
      c.optoTransientOffset=c.stateStart+22;c.optoTransientRaw=dat[c.optoTransientOffset];c.optoTransientKnown=c.optoTransientRaw===0||c.optoTransientRaw===1;c.optoTransientActive=c.optoTransientRaw===1;
      c.optoRatioOffset=c.stateStart+15;c.optoRatioRaw=dat[c.optoRatioOffset];c.optoRatioLabel=COMP_OPTO_RATIO_RAW_TO_LABEL.get(c.optoRatioRaw)||`Raw 0x${hexByte(c.optoRatioRaw)}`;c.optoRatioKnown=COMP_OPTO_RATIO_RAW_TO_LABEL.has(c.optoRatioRaw);
      c.optoGainOffset=c.stateStart+16;c.optoGainRaw=readI16BE(dat,c.optoGainOffset);c.optoGainDb=c.optoGainRaw/256;
      c.ratioLabel=c.optoRatioLabel;
      c.optoWritableShape=!!c.writableShape&&COMP_OPTO_ATTACK_LABELS.has(c.optoAttackRaw)&&COMP_OPTO_RECOVERY_LABELS.has(c.optoRecoveryRaw)&&c.optoBurnKnown&&c.optoTransientKnown;
      c.optoRatioWritableShape=!!c.writableShape;
      c.optoGainWritableShape=!!c.writableShape;
    }else{
      c.optoAttackOffset=c.optoRecoveryOffset=c.optoBurnOffset=c.optoTransientOffset=c.optoRatioOffset=c.optoGainOffset=null;
      c.optoAttackRaw=c.optoRecoveryRaw=c.optoBurnRaw=c.optoTransientRaw=c.optoRatioRaw=c.optoGainRaw=null;
      c.optoAttackLabel=c.optoRecoveryLabel=c.optoRatioLabel=null;c.optoBurnKnown=c.optoTransientKnown=c.optoRatioKnown=false;
      c.optoBurnActive=c.optoTransientActive=false;c.optoGainDb=null;c.optoWritableShape=c.optoRatioWritableShape=c.optoGainWritableShape=false;
    }
  }
  return out;
};

const setInputCompressorThresholdBeforeExtraModels=setInputCompressorThreshold;
setInputCompressorThreshold=function(channel,db){
  const comp=ensureChannelState()?.compressors?.find(c=>c.channel===Number(channel));
  if(comp?.modelRaw!==COMP_MANUAL_PEAK_MODEL)return setInputCompressorThresholdBeforeExtraModels(channel,db);
  if(!comp.writableShape||comp.commonThresholdOffset==null)return false;
  let value=Number(db);if(!Number.isFinite(value))return false;value=Math.max(COMP_MP_THRESHOLD_MIN_DB,Math.min(COMP_MP_THRESHOLD_MAX_DB,value));
  const raw=Math.round(value*256);writeI16BE(state.current.stage.datBytes,comp.commonThresholdOffset,raw);
  comp.commonThresholdRaw=raw;comp.commonThresholdDb=raw/256;comp.thresholdRaw=raw;comp.thresholdDb=raw/256;markStageDirty();return true;
};

const setInputCompressorRatioRawBeforeExtraModels=setInputCompressorRatioRaw;
setInputCompressorRatioRaw=function(channel,rawValue){
  const comp=ensureChannelState()?.compressors?.find(c=>c.channel===Number(channel));
  if(comp?.modelRaw!==COMP_MANUAL_PEAK_MODEL)return setInputCompressorRatioRawBeforeExtraModels(channel,rawValue);
  const raw=Number(rawValue);if(!comp.writableShape||!COMP_MP_RATIO_RAW_TO_LABEL.has(raw))return false;
  state.current.stage.datBytes[comp.stateStart+15]=raw;comp.ratioRaw=raw;comp.ratioLabel=COMP_MP_RATIO_RAW_TO_LABEL.get(raw);comp.mpRatioKnown=true;markStageDirty();return true;
};

const setInputCompressorTimeRawBeforeExtraModels=setInputCompressorTimeRaw;
setInputCompressorTimeRaw=function(channel,kind,rawValue){
  const comp=ensureChannelState()?.compressors?.find(c=>c.channel===Number(channel));
  if(comp?.modelRaw!==COMP_MANUAL_PEAK_MODEL)return setInputCompressorTimeRawBeforeExtraModels(channel,kind,rawValue);
  if(!comp.writableShape)return false;const raw=Number(rawValue),map=kind==='attack'?COMP_MP_ATTACK_RAW_TO_MS:kind==='release'?COMP_MP_RELEASE_RAW_TO_MS:null;if(!map?.has(raw))return false;
  const off=kind==='attack'?comp.stateStart+10:comp.stateStart+12;writeU16BE(state.current.stage.datBytes,off,raw);
  if(kind==='attack'){comp.attackRaw=raw;comp.attackMs=map.get(raw);comp.attackExact=true;comp.mpAttackExact=true;}else{comp.releaseRaw=raw;comp.releaseMs=map.get(raw);comp.releaseExact=true;comp.mpReleaseExact=true;}
  markStageDirty();return true;
};

const setInputCompressorMakeupBeforeExtraModels=setInputCompressorMakeup;
setInputCompressorMakeup=function(channel,db){
  const comp=ensureChannelState()?.compressors?.find(c=>c.channel===Number(channel));
  if(comp?.modelRaw!==COMP_MANUAL_PEAK_MODEL)return setInputCompressorMakeupBeforeExtraModels(channel,db);
  if(!comp.writableShape||comp.makeupOffset==null)return false;let value=Number(db);if(!Number.isFinite(value))return false;value=Math.max(COMP_MP_GAIN_MIN_DB,Math.min(COMP_MP_GAIN_MAX_DB,value));
  const raw=Math.round(value*256);writeI16BE(state.current.stage.datBytes,comp.makeupOffset,raw);comp.makeupRaw=raw;comp.makeupDb=raw/256;markStageDirty();return true;
};

function setInputCompressorOptoMode(channel,kind,rawValue){
  const comp=ensureChannelState()?.compressors?.find(c=>c.channel===Number(channel));if(!comp?.optoWritableShape)return false;const raw=Number(rawValue);
  const map=kind==='attack'?COMP_OPTO_ATTACK_LABELS:kind==='recovery'?COMP_OPTO_RECOVERY_LABELS:null;if(!map?.has(raw))return false;
  const off=kind==='attack'?comp.optoAttackOffset:comp.optoRecoveryOffset;state.current.stage.datBytes[off]=raw;
  if(kind==='attack'){comp.optoAttackRaw=raw;comp.optoAttackLabel=map.get(raw);}else{comp.optoRecoveryRaw=raw;comp.optoRecoveryLabel=map.get(raw);}markStageDirty();return true;
}
function setInputCompressorOptoToggle(channel,kind,on){
  const comp=ensureChannelState()?.compressors?.find(c=>c.channel===Number(channel));if(!comp?.optoWritableShape)return false;const raw=on?1:0;
  if(kind==='burn'){if(!comp.optoBurnKnown)return false;state.current.stage.datBytes[comp.optoBurnOffset]=raw;comp.optoBurnRaw=raw;comp.optoBurnActive=!!on;}
  else if(kind==='transient'){if(!comp.optoTransientKnown)return false;state.current.stage.datBytes[comp.optoTransientOffset]=raw;comp.optoTransientRaw=raw;comp.optoTransientActive=!!on;}
  else return false;markStageDirty();return true;
}
function setInputCompressorOptoRatio(channel,rawValue){
  const comp=ensureChannelState()?.compressors?.find(c=>c.channel===Number(channel)),raw=Number(rawValue);if(!comp?.optoRatioWritableShape||!COMP_OPTO_RATIO_RAW_TO_LABEL.has(raw))return false;
  state.current.stage.datBytes[comp.optoRatioOffset]=raw;comp.optoRatioRaw=raw;comp.optoRatioLabel=COMP_OPTO_RATIO_RAW_TO_LABEL.get(raw);comp.optoRatioKnown=true;comp.ratioRaw=raw;comp.ratioLabel=comp.optoRatioLabel;markStageDirty();return true;
}
function setInputCompressorOptoGain(channel,db){
  const comp=ensureChannelState()?.compressors?.find(c=>c.channel===Number(channel));if(!comp?.optoGainWritableShape)return false;let value=Number(db);if(!Number.isFinite(value))return false;value=Math.max(COMP_OPTO_GAIN_MIN_DB,Math.min(COMP_OPTO_GAIN_MAX_DB,value));
  const raw=Math.round(value*256);writeI16BE(state.current.stage.datBytes,comp.optoGainOffset,raw);comp.optoGainRaw=raw;comp.optoGainDb=raw/256;comp.makeupRaw=raw;comp.makeupDb=raw/256;markStageDirty();return true;
}

if(typeof PARAMETER_MAP!=='undefined'){
  const threshold=PARAMETER_MAP.find(x=>x.id==='input-comp-threshold');if(threshold){threshold.field='Common compressor threshold (Manual Peak / Manual RMS / Opto)';threshold.payload='current-format 127-byte compressor state; model-specific guards';threshold.evidence+=' Manual Peak cross-check scenes −40 and 0 dB independently confirm the same +8..9 signed /256 field.';threshold.notes='Writer: Manual Peak −40…0 dB; Manual RMS/Opto −46…+18 dB.';}
  const ratio=PARAMETER_MAP.find(x=>x.id==='input-comp-ratio');if(ratio){ratio.payload='current-format 127-byte compressor state; model-specific guards';ratio.evidence+=' Manual Peak scenes independently confirm +15 with 2:1→10 and 20:1→26.';ratio.notes='Manual RMS exposes its seven tested choices; Manual Peak exposes only independently tested 2:1 and 20:1.';}
  const attack=PARAMETER_MAP.find(x=>x.id==='input-comp-attack');if(attack){attack.payload='current-format 127-byte compressor state; model-specific guards';attack.evidence+=' Manual Peak independently confirms +10..11 at 30 µs→2261 and 100 ms→745E.';attack.notes='Manual RMS uses its full anchor table; Manual Peak writer is restricted to 30 µs and 100 ms.';}
  const release=PARAMETER_MAP.find(x=>x.id==='input-comp-release');if(release){release.payload='current-format 127-byte compressor state; model-specific guards';release.evidence+=' Manual Peak independently confirms +12..13 at 50 ms→6D5C and 1 s→8BA3.';release.notes='Manual RMS uses its full anchor table; Manual Peak writer is restricted to 50 ms and 1 s.';}
  const makeup=PARAMETER_MAP.find(x=>x.id==='input-comp-makeup');if(makeup){makeup.payload='current-format 127-byte compressor state; model-specific guards';makeup.evidence+=' Manual Peak independently confirms +16..17 at 0 and +12 dB.';makeup.notes='Manual RMS writer range 0…+18 dB; Manual Peak writer range 0…+12 dB.';}
  const rows=[
    {id:'input-comp-opto-attack-mode',area:'Input compressor / Opto',record:'Compressor, Input Channel NN',payload:'Opto model 0x02, 127-byte state',field:'Opto Attack mode',offset:'state +19',datatype:'uint8 enum',transform:'00 Fast; 01 Medium; 02 Slow',confidence:'verified',write:true,evidence:'CH16 controlled Opto scenes isolate +19 across Fast/Medium/Slow.',notes:'Model 0x02 only.'},
    {id:'input-comp-opto-recovery-mode',area:'Input compressor / Opto',record:'Compressor, Input Channel NN',payload:'Opto model 0x02, 127-byte state',field:'Opto Recovery mode',offset:'state +20',datatype:'uint8 enum',transform:'00 Fast; 01 Medium; 02 Slow',confidence:'verified',write:true,evidence:'CH16 controlled Opto scenes isolate +20 across Fast/Medium/Slow.',notes:'Model 0x02 only.'},
    {id:'input-comp-opto-burn',area:'Input compressor / Opto',record:'Compressor, Input Channel NN',payload:'Opto model 0x02, 127-byte state',field:'Opto Burn',offset:'state +21',datatype:'uint8',transform:'00 Off; 01 On',confidence:'verified',write:true,evidence:'CH16 Burn On/Off pair toggles only +21.',notes:'Model 0x02 only.'},
    {id:'input-comp-opto-transient',area:'Input compressor / Opto',record:'Compressor, Input Channel NN',payload:'Opto model 0x02, 127-byte state',field:'Opto Transient',offset:'state +22',datatype:'uint8',transform:'00 Off; 01 On',confidence:'verified',write:true,evidence:'CH16 Transient On/Off pair toggles only +22.',notes:'Model 0x02 only.'},
    {id:'input-comp-opto-ratio',area:'Input compressor / Opto',record:'Compressor, Input Channel NN',payload:'Opto model 0x02, 127-byte state',field:'Opto Ratio',offset:'state +15',datatype:'uint8 discrete table',transform:'00=1.2:1;0D=1.5:1;11=2:1;16=3:1;1C=4:1;25=6:1;28=10:1',confidence:'verified',write:true,evidence:'Seven adjacent CH16 Opto ratio scenes isolate only +15.',notes:'Opto table differs from Manual RMS even though the byte offset is shared.'},
    {id:'input-comp-opto-gain',area:'Input compressor / Opto',record:'Compressor, Input Channel NN',payload:'Opto model 0x02, 127-byte state',field:'Opto Gain',offset:'state +16..17',datatype:'int16 big-endian',transform:'gain_dB=raw/256',confidence:'verified',write:true,evidence:'CH16 −18,−10,0,+10,+18 dB sweep isolates +16..17; default 0 dB is 0000.',notes:'Writer range −18…+18 dB.'}
  ];
  for(const row of rows)if(!PARAMETER_MAP.some(x=>x.id===row.id))PARAMETER_MAP.push(row);
}
