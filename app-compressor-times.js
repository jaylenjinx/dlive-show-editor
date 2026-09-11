'use strict';

// Controlled dLive 2.12 CH16 Manual RMS attack/release scenes isolate two
// unsigned 16-bit big-endian fields. Both controls use the same logarithmic
// time coordinate: the same time produces the same stored word.
//
// Writes are deliberately restricted to exact scene-proven anchors. The
// approximate inverse below is display-only for untested/intermediate values.
const COMP_TIME_MODEL_VERIFIED=0x01; // Manual RMS

const COMP_ATTACK_MS_TO_RAW=new Map([
  [0.03,0x2261],
  [0.1,0x2E8C],
  [0.2,0x358E],
  [0.5,0x3ED0],
  [1,0x45D2],
  [2,0x4CD3],
  [5,0x5616],
  [10,0x5D18],
  [20,0x6419],
  [50,0x6D5C],
  [100,0x745E],
  [200,0x7B5F],
  [300,0x7F79],
]);
const COMP_RELEASE_MS_TO_RAW=new Map([
  [50,0x6D5C],
  [100,0x745E],
  [200,0x7B5F],
  [500,0x84A2],
  [1000,0x8BA3],
  [2000,0x92A5],
]);
const COMP_ATTACK_RAW_TO_MS=new Map([...COMP_ATTACK_MS_TO_RAW].map(([ms,raw])=>[raw,ms]));
const COMP_RELEASE_RAW_TO_MS=new Map([...COMP_RELEASE_MS_TO_RAW].map(([ms,raw])=>[raw,ms]));

function compReadU16BE(dat,off){return ((dat[off]<<8)|dat[off+1])>>>0;}
function compWriteU16BE(dat,off,v){v=Number(v)&0xFFFF;dat[off]=(v>>8)&255;dat[off+1]=v&255;}
function compTimeEstimateMs(raw){return Math.pow(10,(Number(raw)-17874)/5958);}
function compFormatTimeMs(ms){
  ms=Number(ms);
  if(ms<1)return `${Math.round(ms*1000)} µs`;
  if(ms>=1000)return `${ms/1000} s`;
  return `${ms} ms`;
}
function compTimeRawHex(raw){return raw==null?'—':`${hexByte(raw>>8)} ${hexByte(raw&255)}`;}

const parseInputCompressorStatesBeforeTimes=parseInputCompressorStates;
parseInputCompressorStates=function(dat){
  const out=parseInputCompressorStatesBeforeTimes(dat);
  for(const c of out){
    if(c.stateLength>=14){
      c.attackOffset=c.stateStart+10;
      c.attackRaw=compReadU16BE(dat,c.attackOffset);
      c.attackMs=COMP_ATTACK_RAW_TO_MS.get(c.attackRaw)??compTimeEstimateMs(c.attackRaw);
      c.attackExact=COMP_ATTACK_RAW_TO_MS.has(c.attackRaw);
      c.releaseOffset=c.stateStart+12;
      c.releaseRaw=compReadU16BE(dat,c.releaseOffset);
      c.releaseMs=COMP_RELEASE_RAW_TO_MS.get(c.releaseRaw)??compTimeEstimateMs(c.releaseRaw);
      c.releaseExact=COMP_RELEASE_RAW_TO_MS.has(c.releaseRaw);
      c.timeWritableShape=!!c.writableShape&&c.modelRaw===COMP_TIME_MODEL_VERIFIED;
    }else{
      c.attackOffset=c.releaseOffset=null;
      c.attackRaw=c.releaseRaw=null;
      c.attackMs=c.releaseMs=null;
      c.attackExact=c.releaseExact=false;
      c.timeWritableShape=false;
    }
  }
  return out;
};

function setInputCompressorTimeRaw(channel,kind,raw){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.timeWritableShape)return false;
  const map=kind==='attack'?COMP_ATTACK_RAW_TO_MS:COMP_RELEASE_RAW_TO_MS;
  raw=Number(raw);
  if(!map.has(raw))return false;
  const off=kind==='attack'?comp.attackOffset:comp.releaseOffset;
  compWriteU16BE(state.current.stage.datBytes,off,raw);
  if(kind==='attack'){
    comp.attackRaw=raw;comp.attackMs=map.get(raw);comp.attackExact=true;
  }else{
    comp.releaseRaw=raw;comp.releaseMs=map.get(raw);comp.releaseExact=true;
  }
  markStageDirty();return true;
}

function compTimeSelectOptions(msToRaw){
  return [...msToRaw.entries()].map(([ms,raw])=>`<option value="${raw}">${compFormatTimeMs(ms)}</option>`).join('');
}

function injectCompressorTimesUi(){
  const root=$('#channelStateEditor');if(!root||!state.current?.stage)return;
  const channel=Number(root.dataset.channel||1);
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===channel);
  const panel=root.querySelector('.details-stack > .panel');
  if(!panel||!comp||panel.querySelector('[data-k="comp-attack"]'))return;

  const ratioRow=panel.querySelector('[data-k="comp-ratio"]')?.closest('.peq-field');
  const thresholdRow=panel.querySelector('[data-k="comp-threshold"]')?.closest('.peq-field');
  const compRow=panel.querySelector('[data-k="comp"]')?.closest('.peq-field');
  const anchor=ratioRow||thresholdRow||compRow;

  const attackRow=document.createElement('div');attackRow.className='peq-field';
  attackRow.innerHTML=`
    <span>Compressor attack <small>Manual RMS verified anchors</small></span>
    <select data-k="comp-attack">${compTimeSelectOptions(COMP_ATTACK_MS_TO_RAW)}</select>
    <code>${compTimeRawHex(comp.attackRaw)}</code>`;
  if(anchor)anchor.insertAdjacentElement('afterend',attackRow);else panel.appendChild(attackRow);

  const releaseRow=document.createElement('div');releaseRow.className='peq-field';
  releaseRow.innerHTML=`
    <span>Compressor release <small>Manual RMS verified anchors</small></span>
    <select data-k="comp-release">${compTimeSelectOptions(COMP_RELEASE_MS_TO_RAW)}</select>
    <code>${compTimeRawHex(comp.releaseRaw)}</code>`;
  attackRow.insertAdjacentElement('afterend',releaseRow);

  const atkSel=attackRow.querySelector('[data-k="comp-attack"]');
  const relSel=releaseRow.querySelector('[data-k="comp-release"]');

  if(comp.attackExact)atkSel.value=String(comp.attackRaw);
  else{
    const o=document.createElement('option');o.value='';o.textContent=`Current ≈ ${compFormatTimeMs(Number(comp.attackMs.toPrecision(3)))} (untested raw)`;o.selected=true;atkSel.prepend(o);
  }
  if(comp.releaseExact)relSel.value=String(comp.releaseRaw);
  else{
    const o=document.createElement('option');o.value='';o.textContent=`Current ≈ ${compFormatTimeMs(Number(comp.releaseMs.toPrecision(3)))} (untested raw)`;o.selected=true;relSel.prepend(o);
  }
  if(!comp.timeWritableShape){atkSel.disabled=true;relSel.disabled=true;}

  atkSel.onchange=()=>{
    if(setInputCompressorTimeRaw(channel,'attack',atkSel.value))renderChannelState();
    else toast('Attack write blocked: only exact controlled Manual RMS anchors are enabled.',true);
  };
  relSel.onchange=()=>{
    if(setInputCompressorTimeRaw(channel,'release',relSel.value))renderChannelState();
    else toast('Release write blocked: only exact controlled Manual RMS anchors are enabled.',true);
  };

  const table=panel.querySelector('.config-table');
  if(table){
    const a=document.createElement('div');a.className='config-row';
    a.innerHTML=`<strong>Attack</strong><code>state + 10..11 = ${compTimeRawHex(comp.attackRaw)}</code><span>${comp.attackExact?compFormatTimeMs(comp.attackMs):`≈ ${compFormatTimeMs(Number(comp.attackMs.toPrecision(3)))} · decoded estimate`}${comp.timeWritableShape?' · anchor write enabled':''}</span>`;
    table.appendChild(a);
    const r=document.createElement('div');r.className='config-row';
    r.innerHTML=`<strong>Release</strong><code>state + 12..13 = ${compTimeRawHex(comp.releaseRaw)}</code><span>${comp.releaseExact?compFormatTimeMs(comp.releaseMs):`≈ ${compFormatTimeMs(Number(comp.releaseMs.toPrecision(3)))} · decoded estimate`}${comp.timeWritableShape?' · anchor write enabled':''}</span>`;
    table.appendChild(r);
  }

  const evidence=root.querySelector('.details-stack > .panel:last-child');
  if(evidence&&evidence!==panel&&!evidence.querySelector('.comp-time-evidence')){
    const p=document.createElement('p');p.className='comp-time-evidence';
    p.innerHTML='Controlled Manual RMS scenes isolate <code>attack = state +10..11</code> and <code>release = state +12..13</code>. Both use the same logarithmic time coordinate: <code>50 ms→6D 5C</code>, <code>100 ms→74 5E</code>, <code>200 ms→7B 5F</code> on both controls. Each adjacent scene changes only the target two bytes outside scene-label bytes.';
    evidence.appendChild(p);
  }
}

const renderChannelStateBeforeTimes=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeTimes();injectCompressorTimesUi();};

if(typeof PARAMETER_MAP!=='undefined'){
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-attack'))PARAMETER_MAP.push({
    id:'input-comp-attack',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',
    field:'Compressor attack',offset:'state + 10..11',datatype:'uint16 big-endian logarithmic time coordinate',
    transform:'shared time coordinate with release; exact scene-proven anchors from 30 µs through 300 ms',
    confidence:'verified',write:true,
    evidence:'Controlled CH16 attack scenes 30 µs, 100 µs, 200 µs, 500 µs, 1, 2, 5, 10, 20, 50, 100, 200, 300 ms. Each adjacent pair changes only state +10..11 outside scene-label bytes.',
    notes:'Writer exposes only exact controlled anchors. Approximate inverse time decoding is display-only for other raw values.'
  });
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-release'))PARAMETER_MAP.push({
    id:'input-comp-release',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',
    field:'Compressor release',offset:'state + 12..13',datatype:'uint16 big-endian logarithmic time coordinate',
    transform:'shared time coordinate with attack; exact scene-proven anchors 50, 100, 200, 500, 1000, 2000 ms',
    confidence:'verified',write:true,
    evidence:'Controlled CH16 release scenes 50, 100, 200, 500 ms, 1 s, 2 s. Each adjacent pair changes only state +12..13 outside scene-label bytes.',
    notes:'Writer exposes only exact controlled anchors. Same-time words match attack exactly at 50, 100 and 200 ms.'
  });
}

if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='channel-state');
  if(sec&&!sec.html.includes('Attack and release — verified restricted write')){
    sec.html+=`
      <h2>Attack and release — verified restricted write</h2>
      <pre><code>attack  = state +10..11 (uint16_be)
release = state +12..13 (uint16_be)</code></pre>
      <p>Both fields use the same logarithmic time coordinate. The strongest cross-check is that identical times store identical words on both controls: <code>50 ms = 6D 5C</code>, <code>100 ms = 74 5E</code>, <code>200 ms = 7B 5F</code>.</p>
      <p>Attack controlled anchors span <code>30 µs</code> to <code>300 ms</code>; release anchors span <code>50 ms</code> to <code>2 s</code>. Every adjacent scene changes only the target two bytes outside the scene name.</p>
      <div class="docs-callout"><strong>Conservative writer:</strong> the editor writes only exact controlled time anchors on Manual RMS. An approximate log inverse is used only to display untested intermediate raw values.</div>`;
  }
}
