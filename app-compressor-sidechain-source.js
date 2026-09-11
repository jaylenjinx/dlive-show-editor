'use strict';

// Controlled dLive 2.12 CH16 scenes isolate the remaining compressor-sidechain fields.
// Compressor state +125..126 = BPF frequency.
// Separate record `Compressor side chain source, Input Channel NN` = 01 TT II,
// where TT is a source type and II is a zero-based index.
const COMP_SC_BPF_MODEL_VERIFIED=0x01;
const COMP_SC_BPF_HZ_TO_RAW=new Map([[50,0x4197],[100,0x5396],[200,0x6596],[500,0x7D62],[1000,0x8F62],[2000,0xA162],[5000,0xB92D],[10000,0xCB2D],[12000,0xCFEA]]);
const COMP_SC_BPF_RAW_TO_HZ=new Map([...COMP_SC_BPF_HZ_TO_RAW].map(([hz,raw])=>[raw,hz]));
const COMP_SC_SOURCE_TYPE_LABELS=new Map([[0x01,'Input'],[0x02,'Mono Group'],[0x03,'Stereo Group'],[0x04,'Mono Aux'],[0x05,'Stereo Aux'],[0x08,'Main'],[0x0A,'Mono Matrix'],[0x0B,'Stereo Matrix']]);
const COMP_SC_SOURCE_TESTED=[
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

const parseInputCompressorStatesBeforeScBpf=parseInputCompressorStates;
parseInputCompressorStates=function(dat){
  const out=parseInputCompressorStatesBeforeScBpf(dat);
  for(const c of out){
    if(c.stateLength>=127){
      c.scBpfFreqOffset=c.stateStart+125;
      c.scBpfFreqRaw=readU16BE(dat,c.scBpfFreqOffset);
      c.scBpfFreqHz=COMP_SC_BPF_RAW_TO_HZ.get(c.scBpfFreqRaw)??peqFrequencyFromRaw(c.scBpfFreqRaw);
      c.scBpfFreqExact=COMP_SC_BPF_RAW_TO_HZ.has(c.scBpfFreqRaw);
      c.scBpfWritableShape=!!c.writableShape&&c.modelRaw===COMP_SC_BPF_MODEL_VERIFIED;
    }else{
      c.scBpfFreqOffset=null;c.scBpfFreqRaw=null;c.scBpfFreqHz=null;c.scBpfFreqExact=false;c.scBpfWritableShape=false;
    }
  }
  return out;
};

function parseInputCompressorSidechainSources(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`Compressor side chain source, Input Channel ${String(channel).padStart(2,'0')}`;
    const sig=asciiBytes(label),pos=indexOfBytes(dat,sig);if(pos<2)continue;
    const payloadLength=readU16BE(dat,pos-2),nul=pos+sig.length;
    if(dat[nul]!==0||pos+payloadLength>dat.length)continue;
    const stateStart=nul+1,stateEnd=pos+payloadLength,stateLength=stateEnd-stateStart;if(stateLength!==3)continue;
    const discriminator=dat[stateStart],typeRaw=dat[stateStart+1],indexRaw=dat[stateStart+2];
    const typeLabel=COMP_SC_SOURCE_TYPE_LABELS.get(typeRaw)||`Unknown 0x${hexByte(typeRaw)}`;
    const currentTested=COMP_SC_SOURCE_TESTED.find(x=>x.type===typeRaw&&x.index===indexRaw)||null;
    out.push({channel,label,frameStart:pos-2,pos,payloadLength,stateStart,stateEnd,stateLength,discriminator,typeRaw,indexRaw,typeLabel,currentTested,writableShape:discriminator===0x01&&COMP_SC_SOURCE_TYPE_LABELS.has(typeRaw),raw:dat.slice(stateStart,stateEnd)});
  }
  return out;
}
function ensureInputCompressorSidechainSources(){const stage=state.current?.stage;if(!stage)return [];if(!stage.compressorSidechainSources)stage.compressorSidechainSources=parseInputCompressorSidechainSources(stage.datBytes);return stage.compressorSidechainSources;}
function getInputCompressorSidechainSource(channel){return ensureInputCompressorSidechainSources().find(x=>x.channel===Number(channel))||null;}

function setInputCompressorSidechainBpfFrequency(channel,hzValue){
  const comp=ensureChannelState()?.compressors?.find(c=>c.channel===Number(channel));
  const hz=Number(hzValue),raw=COMP_SC_BPF_HZ_TO_RAW.get(hz);if(!comp?.scBpfWritableShape||raw==null)return false;
  writeU16BE(state.current.stage.datBytes,comp.scBpfFreqOffset,raw);comp.scBpfFreqRaw=raw;comp.scBpfFreqHz=hz;comp.scBpfFreqExact=true;markStageDirty();return true;
}
function setInputCompressorSidechainSource(channel,typeValue,indexValue){
  const src=getInputCompressorSidechainSource(channel),type=Number(typeValue),index=Number(indexValue);
  if(!src?.writableShape||!COMP_SC_SOURCE_TESTED.some(x=>x.type===type&&x.index===index))return false;
  state.current.stage.datBytes[src.stateStart+1]=type;state.current.stage.datBytes[src.stateStart+2]=index;
  src.typeRaw=type;src.indexRaw=index;src.typeLabel=COMP_SC_SOURCE_TYPE_LABELS.get(type);src.currentTested=COMP_SC_SOURCE_TESTED.find(x=>x.type===type&&x.index===index)||null;markStageDirty();return true;
}
function compScBpfOptions(){return [...COMP_SC_BPF_HZ_TO_RAW.keys()].map(hz=>`<option value="${hz}">${formatHz(hz)}</option>`).join('');}
function compScSourceValue(type,index){return `${type}:${index}`;}
function compScSourceOptions(){return COMP_SC_SOURCE_TESTED.map(x=>`<option value="${compScSourceValue(x.type,x.index)}">${x.label}</option>`).join('');}

function injectCompressorSidechainBpfSourceUi(){
  const root=$('#channelStateEditor');if(!root||!state.current?.stage)return;
  const channel=Number(root.dataset.channel||1),comp=ensureChannelState()?.compressors?.find(c=>c.channel===channel),src=getInputCompressorSidechainSource(channel);
  const panel=root.querySelector('.details-stack > .panel');if(!panel||!comp||panel.querySelector('[data-k="comp-sc-bpf-freq"]'))return;
  const filterRow=panel.querySelector('[data-k="comp-sc-filter"]')?.closest('.peq-field');
  if(src&&filterRow){
    const row=document.createElement('div');row.className='peq-field';row.innerHTML=`<span>Sidechain source <small>exact tested selections only</small></span><select data-k="comp-sc-source">${compScSourceOptions()}</select><code>${hexByte(src.discriminator)} ${hexByte(src.typeRaw)} ${hexByte(src.indexRaw)}</code>`;filterRow.insertAdjacentElement('beforebegin',row);
    const sel=row.querySelector('[data-k="comp-sc-source"]'),current=compScSourceValue(src.typeRaw,src.indexRaw);
    if(COMP_SC_SOURCE_TESTED.some(x=>compScSourceValue(x.type,x.index)===current))sel.value=current;else{const o=document.createElement('option');o.value='';o.textContent=`Current ${src.typeLabel} ${src.indexRaw+1} (untested)`;o.selected=true;sel.prepend(o);}if(!src.writableShape)sel.disabled=true;
    sel.onchange=()=>{const [type,index]=sel.value.split(':').map(Number);if(setInputCompressorSidechainSource(channel,type,index))renderChannelState();else toast('Sidechain source write blocked: use an exact controlled source selection.',true);};
  }
  const middleRow=panel.querySelector('[data-k="comp-sc-middle"]')?.closest('.peq-field');
  if(middleRow){
    const row=document.createElement('div');row.className='peq-field';row.innerHTML=`<span>SC BPF frequency <small>verified anchors: 50 Hz–12 kHz</small></span><select data-k="comp-sc-bpf-freq">${compScBpfOptions()}</select><code>${comp.scBpfFreqRaw==null?'—':`${hexByte(comp.scBpfFreqRaw>>8)} ${hexByte(comp.scBpfFreqRaw&255)}`}</code>`;middleRow.insertAdjacentElement('afterend',row);
    const sel=row.querySelector('[data-k="comp-sc-bpf-freq"]');if(comp.scBpfFreqExact)sel.value=String(COMP_SC_BPF_RAW_TO_HZ.get(comp.scBpfFreqRaw));else{const o=document.createElement('option');o.value='';o.textContent=`Current ≈ ${formatHz(peqFrequencyFromRaw(comp.scBpfFreqRaw))} (untested raw)`;o.selected=true;sel.prepend(o);}if(!comp.scBpfWritableShape)sel.disabled=true;
    sel.onchange=()=>{if(setInputCompressorSidechainBpfFrequency(channel,sel.value))renderChannelState();else toast('BPF frequency write blocked: use an exact controlled anchor.',true);};
  }
}
const renderChannelStateBeforeScBpfSource=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeScBpfSource();injectCompressorSidechainBpfSourceUi();};

if(typeof PARAMETER_MAP!=='undefined'){
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-sc-bpf-freq'))PARAMETER_MAP.push({id:'input-comp-sc-bpf-freq',area:'Input compressor sidechain',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01',field:'Sidechain BPF frequency',offset:'state + 125..126',datatype:'uint16 big-endian log frequency',transform:'same frequency coordinate family; exact controlled anchors only',confidence:'verified',write:true,evidence:'CH16 50,100,200,500 Hz, 1k,2k,5k,10k,12k scenes isolate only +125..126.',notes:'Writer restricted to exact tested anchors and Manual RMS.'});
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-sc-source'))PARAMETER_MAP.push({id:'input-comp-sc-source',area:'Input compressor sidechain',record:'Compressor side chain source, Input Channel NN',payload:'3-byte state',field:'Sidechain source',offset:'state +0..2',datatype:'[discriminator,type,index]',transform:'01 TT II; II is zero-based',confidence:'verified',write:true,evidence:'CH16 Self, Input 1/16, Mono/Stereo Group 1, Mono/Stereo Aux 1, Main, Mono/Stereo Matrix 1. Self and Input 16 both serialize as 01 01 0F.',notes:'Writer exposes only exact tested type/index pairs.'});
}

if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='channel-state');if(sec&&!sec.html.includes('BPF frequency and sidechain source'))sec.html+=`<h2>BPF frequency and sidechain source</h2><pre><code>BPF frequency = compressor state +125..126\nsource record  = Compressor side chain source, Input Channel NN\n                 01 TT II</code></pre><p>BPF anchors: <code>50 Hz=41 97</code>, <code>100=53 96</code>, <code>200=65 96</code>, <code>500=7D 62</code>, <code>1k=8F 62</code>, <code>2k=A1 62</code>, <code>5k=B9 2D</code>, <code>10k=CB 2D</code>, <code>12k=CF EA</code>. Source type IDs match the already-proven strip-assignment IDs. On CH16, Self and Input 16 are byte-identical: <code>01 01 0F</code>.</p><div class="docs-callout"><strong>Writer guard:</strong> BPF uses exact anchors only; Source uses exact tested type/index pairs only.</div>`;
}
