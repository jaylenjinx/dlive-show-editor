'use strict';

// Controlled dLive 2.12 CH16 Manual RMS attack/release scenes isolate two
// unsigned 16-bit big-endian fields. Both controls use the same logarithmic
// time coordinate: the same time produces the same stored word.
//
// Every tested anchor matches raw = round(17874 + 5958 × log10(ms)) within ±1 raw
// unit (the same time_log coordinate proven continuous on the RackUltra Decay Time
// fields), so both controls are continuous writers over their tested ranges.
const COMP_TIME_MODEL_VERIFIED=0x01; // Manual RMS
const COMP_ATTACK_MIN_MS=0.03,COMP_ATTACK_MAX_MS=300;
const COMP_RELEASE_MIN_MS=50,COMP_RELEASE_MAX_MS=2000;

function compReadU16BE(dat,off){return ((dat[off]<<8)|dat[off+1])>>>0;}
function compWriteU16BE(dat,off,v){v=Number(v)&0xFFFF;dat[off]=(v>>8)&255;dat[off+1]=v&255;}
function compTimeEstimateMs(raw){return Math.pow(10,(Number(raw)-17874)/5958);}
function compTimeRawFromMs(ms){return Math.max(0,Math.min(0xffff,Math.round(17874+5958*Math.log10(ms))));}
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
      c.attackMs=compTimeEstimateMs(c.attackRaw);
      c.releaseOffset=c.stateStart+12;
      c.releaseRaw=compReadU16BE(dat,c.releaseOffset);
      c.releaseMs=compTimeEstimateMs(c.releaseRaw);
      c.timeWritableShape=!!c.writableShape&&c.modelRaw===COMP_TIME_MODEL_VERIFIED;
    }else{
      c.attackOffset=c.releaseOffset=null;
      c.attackRaw=c.releaseRaw=null;
      c.attackMs=c.releaseMs=null;
      c.timeWritableShape=false;
    }
  }
  return out;
};

function setInputCompressorTime(channel,kind,msValue){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.timeWritableShape)return false;
  let ms=Number(msValue);if(!Number.isFinite(ms))return false;
  const min=kind==='attack'?COMP_ATTACK_MIN_MS:COMP_RELEASE_MIN_MS,max=kind==='attack'?COMP_ATTACK_MAX_MS:COMP_RELEASE_MAX_MS;
  ms=Math.max(min,Math.min(max,ms));
  const raw=compTimeRawFromMs(ms);
  const off=kind==='attack'?comp.attackOffset:comp.releaseOffset;
  compWriteU16BE(state.current.stage.datBytes,off,raw);
  if(kind==='attack'){
    comp.attackRaw=raw;comp.attackMs=ms;
  }else{
    comp.releaseRaw=raw;comp.releaseMs=ms;
  }
  markStageDirty();return true;
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
    <span>Compressor attack <small>continuous verified ${COMP_ATTACK_MIN_MS} ms…${COMP_ATTACK_MAX_MS} ms</small></span>
    <div><input data-k="comp-attack" type="number" min="${COMP_ATTACK_MIN_MS}" max="${COMP_ATTACK_MAX_MS}" step="0.01"><b>ms</b></div>
    <code>${compTimeRawHex(comp.attackRaw)}</code>`;
  if(anchor)anchor.insertAdjacentElement('afterend',attackRow);else panel.appendChild(attackRow);

  const releaseRow=document.createElement('div');releaseRow.className='peq-field';
  releaseRow.innerHTML=`
    <span>Compressor release <small>continuous verified ${COMP_RELEASE_MIN_MS} ms…${COMP_RELEASE_MAX_MS} ms</small></span>
    <div><input data-k="comp-release" type="number" min="${COMP_RELEASE_MIN_MS}" max="${COMP_RELEASE_MAX_MS}" step="1"><b>ms</b></div>
    <code>${compTimeRawHex(comp.releaseRaw)}</code>`;
  attackRow.insertAdjacentElement('afterend',releaseRow);

  const atkSel=attackRow.querySelector('[data-k="comp-attack"]');
  const relSel=releaseRow.querySelector('[data-k="comp-release"]');

  if(comp.attackMs>=COMP_ATTACK_MIN_MS*0.98&&comp.attackMs<=COMP_ATTACK_MAX_MS*1.02)atkSel.value=String(Number(comp.attackMs.toPrecision(4)));
  else{atkSel.disabled=true;atkSel.title=`Current ≈ ${compFormatTimeMs(Number(comp.attackMs.toPrecision(3)))} is outside the controlled range.`;}
  if(comp.releaseMs>=COMP_RELEASE_MIN_MS*0.98&&comp.releaseMs<=COMP_RELEASE_MAX_MS*1.02)relSel.value=String(Number(comp.releaseMs.toPrecision(4)));
  else{relSel.disabled=true;relSel.title=`Current ≈ ${compFormatTimeMs(Number(comp.releaseMs.toPrecision(3)))} is outside the controlled range.`;}
  if(!comp.timeWritableShape){atkSel.disabled=true;relSel.disabled=true;}

  atkSel.onchange=()=>{
    if(setInputCompressorTime(channel,'attack',atkSel.value))renderChannelState();
    else toast('Attack write blocked.',true);
  };
  relSel.onchange=()=>{
    if(setInputCompressorTime(channel,'release',relSel.value))renderChannelState();
    else toast('Release write blocked.',true);
  };

  const table=panel.querySelector('.config-table');
  if(table){
    const a=document.createElement('div');a.className='config-row';
    a.innerHTML=`<strong>Attack</strong><code>state + 10..11 = ${compTimeRawHex(comp.attackRaw)}</code><span>${compFormatTimeMs(Number(comp.attackMs.toPrecision(3)))}${comp.timeWritableShape?' · write enabled':''}</span>`;
    table.appendChild(a);
    const r=document.createElement('div');r.className='config-row';
    r.innerHTML=`<strong>Release</strong><code>state + 12..13 = ${compTimeRawHex(comp.releaseRaw)}</code><span>${compFormatTimeMs(Number(comp.releaseMs.toPrecision(3)))}${comp.timeWritableShape?' · write enabled':''}</span>`;
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
    transform:`raw=round(17874+5958×log10(ms)); verified ${COMP_ATTACK_MIN_MS} ms…${COMP_ATTACK_MAX_MS} ms`,
    confidence:'verified',write:true,
    evidence:'Controlled CH16 attack scenes 30 µs, 100 µs, 200 µs, 500 µs, 1, 2, 5, 10, 20, 50, 100, 200, 300 ms. Each adjacent pair changes only state +10..11 outside scene-label bytes; every point matches the canonical time_log coordinate within ±1 raw unit.',
    notes:'Same time_log coordinate proven continuous on the RackUltra Decay Time fields.'
  });
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-release'))PARAMETER_MAP.push({
    id:'input-comp-release',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',
    field:'Compressor release',offset:'state + 12..13',datatype:'uint16 big-endian logarithmic time coordinate',
    transform:`raw=round(17874+5958×log10(ms)); verified ${COMP_RELEASE_MIN_MS} ms…${COMP_RELEASE_MAX_MS} ms`,
    confidence:'verified',write:true,
    evidence:'Controlled CH16 release scenes 50, 100, 200, 500 ms, 1 s, 2 s. Each adjacent pair changes only state +12..13 outside scene-label bytes; every point matches the canonical time_log coordinate within ±1 raw unit.',
    notes:'Same-time words match attack exactly at 50, 100 and 200 ms.'
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
      <p>Attack controlled anchors span <code>30 µs</code> to <code>300 ms</code>; release anchors span <code>50 ms</code> to <code>2 s</code>. Every adjacent scene changes only the target two bytes outside the scene name, and every anchor matches <code>raw = round(17874 + 5958 × log10(ms))</code> within ±1 raw unit — the same time_log coordinate proven continuous on the RackUltra Decay Time fields.</p>
      <div class="docs-callout"><strong>Writer:</strong> both attack and release are continuous on Manual RMS over their tested ranges.</div>`;
  }
}
