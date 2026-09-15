'use strict';

// Controlled dLive 2.12 Gate sidechain scenes (CH16) isolate the SCF Gate
// filter record and the separate sidechain-source record. Frequency writes are
// restricted to exact scene-proven anchors; filter type/BPF fields are decoded
// but not written until independent one-parameter scenes exist.
const GATE_SC_LO_HZ_TO_RAW=new Map([
  [20,0x29CB],[100,0x5396],[500,0x7D62],[1000,0x8F62],[2000,0xA162],[5000,0xB92D]
]);
const GATE_SC_HI_HZ_TO_RAW=new Map([
  [120,0x5853],[200,0x6596],[500,0x7D62],[1000,0x8F62],[2000,0xA162],[5000,0xB92D],[10000,0xCB2D],[20000,0xDD2D]
]);
const GATE_SC_LO_RAW_TO_HZ=new Map([...GATE_SC_LO_HZ_TO_RAW].map(([hz,raw])=>[raw,hz]));
const GATE_SC_HI_RAW_TO_HZ=new Map([...GATE_SC_HI_HZ_TO_RAW].map(([hz,raw])=>[raw,hz]));
const GATE_SC_SOURCE_TYPE_LABELS=new Map([[0x01,'Input'],[0x02,'Mono Group'],[0x03,'Stereo Group'],[0x04,'Mono Aux'],[0x05,'Stereo Aux'],[0x08,'Main'],[0x0A,'Mono Matrix'],[0x0B,'Stereo Matrix']]);
const GATE_SC_SOURCE_TESTED=[
  {type:0x01,index:0x00,label:'Input 1'},
  {type:0x01,index:0x0F,label:'Input 16 / Self on CH16'},
  {type:0x02,index:0x00,label:'Mono Group 1'},
  {type:0x03,index:0x00,label:'Stereo Group 1'},
  {type:0x04,index:0x00,label:'Mono Aux 1'},
  {type:0x05,index:0x00,label:'Stereo Aux 1'},
  {type:0x08,index:0x00,label:'Main'},
  {type:0x0A,index:0x00,label:'Mono Matrix 1'},
  {type:0x0B,index:0x00,label:'Stereo Matrix 1'}
];

function gateScReadU16(dat,off){return ((dat[off]<<8)|dat[off+1])>>>0;}
function gateScWriteU16(dat,off,v){v=Number(v)&0xffff;dat[off]=(v>>8)&255;dat[off+1]=v&255;}
function gateScRawHex(raw){return raw==null?'—':`${hexByte(raw>>8)} ${hexByte(raw&255)}`;}
function gateScSourceValue(type,index){return `${Number(type)}:${Number(index)}`;}

function parseInputGateSidechainFilters(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`SCF Gate, Input Channel ${String(channel).padStart(2,'0')}`;
    const r=ipParseRecord(dat,label,23);if(!r)continue;
    const s=r.stateStart;
    const loRaw=gateScReadU16(dat,s+3),hiRaw=gateScReadU16(dat,s+12),bpfRaw=gateScReadU16(dat,s+21);
    const filterRaw=dat[s+19];
    out.push({...r,channel,discriminator:dat[s],
      loFreqOffset:s+3,loFreqRaw:loRaw,loFreqHz:GATE_SC_LO_RAW_TO_HZ.get(loRaw)??peqFrequencyFromRaw(loRaw),loFreqExact:GATE_SC_LO_RAW_TO_HZ.has(loRaw),
      loTypeOffset:s+7,loTypeRaw:dat[s+7],
      hiFreqOffset:s+12,hiFreqRaw:hiRaw,hiFreqHz:GATE_SC_HI_RAW_TO_HZ.get(hiRaw)??peqFrequencyFromRaw(hiRaw),hiFreqExact:GATE_SC_HI_RAW_TO_HZ.has(hiRaw),
      hiTypeOffset:s+16,hiTypeRaw:dat[s+16],
      filterOffset:s+19,filterRaw,filterKnown:filterRaw===0||filterRaw===1,filterActive:filterRaw===0,
      middleOffset:s+20,middleRaw:dat[s+20],
      bpfFreqOffset:s+21,bpfFreqRaw:bpfRaw,bpfFreqHz:peqFrequencyFromRaw(bpfRaw),
      writableShape:dat[s]===0x04&&(filterRaw===0||filterRaw===1)});
  }
  return out;
}

function parseInputGateSidechainSources(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`Gate side chain source, Input Channel ${String(channel).padStart(2,'0')}`;
    const r=ipParseRecord(dat,label,3);if(!r)continue;
    const s=r.stateStart,typeRaw=dat[s+1],indexRaw=dat[s+2];
    out.push({...r,channel,discriminator:dat[s],typeRaw,indexRaw,
      typeLabel:GATE_SC_SOURCE_TYPE_LABELS.get(typeRaw)||`Unknown 0x${hexByte(typeRaw)}`,
      currentTested:GATE_SC_SOURCE_TESTED.find(x=>x.type===typeRaw&&x.index===indexRaw)||null,
      writableShape:dat[s]===0x01&&GATE_SC_SOURCE_TYPE_LABELS.has(typeRaw)});
  }
  return out;
}

function ensureInputGateSidechains(){
  const stage=state.current?.stage;if(!stage)return null;
  if(!stage.inputGateSidechainFilters)stage.inputGateSidechainFilters=parseInputGateSidechainFilters(stage.datBytes);
  if(!stage.inputGateSidechainSources)stage.inputGateSidechainSources=parseInputGateSidechainSources(stage.datBytes);
  return {filters:stage.inputGateSidechainFilters,sources:stage.inputGateSidechainSources};
}
function getInputGateSidechainFilter(channel){return ensureInputGateSidechains()?.filters?.find(x=>x.channel===Number(channel))||null;}
function getInputGateSidechainSource(channel){return ensureInputGateSidechains()?.sources?.find(x=>x.channel===Number(channel))||null;}

function setInputGateSidechainFilterActive(channel,on){
  const sc=getInputGateSidechainFilter(channel);if(!sc?.writableShape||!sc.filterKnown)return false;
  const raw=on?0:1;state.current.stage.datBytes[sc.filterOffset]=raw;sc.filterRaw=raw;sc.filterActive=!!on;markStageDirty();return true;
}
function setInputGateSidechainFrequency(channel,kind,hzValue){
  const sc=getInputGateSidechainFilter(channel);if(!sc?.writableShape)return false;
  const hz=Number(hzValue),map=kind==='lo'?GATE_SC_LO_HZ_TO_RAW:kind==='hi'?GATE_SC_HI_HZ_TO_RAW:null;if(!map)return false;
  const raw=map.get(hz);if(raw==null)return false;
  const off=kind==='lo'?sc.loFreqOffset:sc.hiFreqOffset;gateScWriteU16(state.current.stage.datBytes,off,raw);
  if(kind==='lo'){sc.loFreqRaw=raw;sc.loFreqHz=hz;sc.loFreqExact=true;}else{sc.hiFreqRaw=raw;sc.hiFreqHz=hz;sc.hiFreqExact=true;}
  markStageDirty();return true;
}
function setInputGateSidechainSource(channel,typeValue,indexValue){
  const src=getInputGateSidechainSource(channel),type=Number(typeValue),index=Number(indexValue);
  if(!src?.writableShape||!GATE_SC_SOURCE_TESTED.some(x=>x.type===type&&x.index===index))return false;
  state.current.stage.datBytes[src.stateStart+1]=type;state.current.stage.datBytes[src.stateStart+2]=index;
  src.typeRaw=type;src.indexRaw=index;src.typeLabel=GATE_SC_SOURCE_TYPE_LABELS.get(type);src.currentTested=GATE_SC_SOURCE_TESTED.find(x=>x.type===type&&x.index===index)||null;
  markStageDirty();return true;
}

if(typeof PARAMETER_MAP!=='undefined'){
  const rows=[
    {id:'input-gate-sc-lo-freq',area:'Input gate sidechain',record:'SCF Gate, Input Channel NN',payload:'23-byte state, discriminator 04',field:'SC low-filter frequency',offset:'state +3..4',datatype:'uint16 big-endian log-frequency coordinate',transform:'exact controlled anchors only',confidence:'verified',write:true,evidence:'CH16 20,100,500 Hz,1k,2k,5k scenes isolate +3..4.',notes:'Gate-specific exact table; 5 kHz stores B9 2D.'},
    {id:'input-gate-sc-hi-freq',area:'Input gate sidechain',record:'SCF Gate, Input Channel NN',payload:'23-byte state, discriminator 04',field:'SC high-filter frequency',offset:'state +12..13',datatype:'uint16 big-endian log-frequency coordinate',transform:'exact controlled anchors only',confidence:'verified',write:true,evidence:'CH16 120,200,500 Hz,1k,2k,5k,10k,20k scenes isolate +12..13.',notes:'Gate-specific exact table; 20 kHz stores DD 2D.'},
    {id:'input-gate-sc-filter',area:'Input gate sidechain',record:'SCF Gate, Input Channel NN',payload:'23-byte state, discriminator 04',field:'SC Filter In/Out',offset:'state +19',datatype:'uint8',transform:'00=In/active, 01=Out/bypassed',confidence:'verified',write:true,evidence:'Two independent CH16 pairs toggle only +19: 00/01/00/01.',notes:'Semantics mirror the independently verified compressor SC filter layout.'},
    {id:'input-gate-sc-source',area:'Input gate sidechain',record:'Gate side chain source, Input Channel NN',payload:'3-byte state',field:'Sidechain source',offset:'state +0..2',datatype:'[01,type,index]',transform:'01 TT II; II zero-based',confidence:'verified',write:true,evidence:'CH16 Self/Input1/Input16/Mono+Stereo Group1/Mono+Stereo Aux1/Main/Mono+Stereo Matrix1 scenes.',notes:'Writer exposes only exact tested type/index pairs. Self and Input16 are identical on CH16.'}
  ];
  for(const row of rows)if(!PARAMETER_MAP.some(x=>x.id===row.id))PARAMETER_MAP.push(row);
}
