'use strict';

// Controlled dLive 2.12 CH16 Manual RMS scenes isolate the parallel block:
//   state +3..4 = parallel wet level, signed int16 big-endian / 256 dB
//   state +5..6 = parallel dry level, signed int16 big-endian / 256 dB
//   state +7    = parallel enable, 00 Off / 01 On
// Wet/dry use 0x8001 (-32767) as the explicit -infinity sentinel.
// Writers remain deliberately guarded to Manual RMS (model 0x01).
const COMP_PARALLEL_MODEL_VERIFIED=0x01;
const COMP_PARALLEL_MIN_VERIFIED_DB=-40;
const COMP_PARALLEL_MAX_VERIFIED_DB=0;
const COMP_PARALLEL_NEG_INF_RAW=-32767; // 0x8001

const parseInputCompressorStatesBeforeParallel=parseInputCompressorStates;
parseInputCompressorStates=function(dat){
  const out=parseInputCompressorStatesBeforeParallel(dat);
  for(const c of out){
    if(c.stateLength>=8){
      c.parallelWetOffset=c.stateStart+3;
      c.parallelWetRaw=readI16BE(dat,c.parallelWetOffset);
      c.parallelWetInfinite=c.parallelWetRaw===COMP_PARALLEL_NEG_INF_RAW;
      c.parallelWetDb=c.parallelWetInfinite?null:c.parallelWetRaw/256;

      c.parallelDryOffset=c.stateStart+5;
      c.parallelDryRaw=readI16BE(dat,c.parallelDryOffset);
      c.parallelDryInfinite=c.parallelDryRaw===COMP_PARALLEL_NEG_INF_RAW;
      c.parallelDryDb=c.parallelDryInfinite?null:c.parallelDryRaw/256;

      c.parallelEnableOffset=c.stateStart+7;
      c.parallelEnableRaw=dat[c.parallelEnableOffset];
      c.parallelActive=c.parallelEnableRaw===1;
      c.parallelEnableKnown=c.parallelEnableRaw===0||c.parallelEnableRaw===1;
      c.parallelWritableShape=!!c.writableShape&&c.modelRaw===COMP_PARALLEL_MODEL_VERIFIED&&c.parallelEnableKnown;
    }else{
      c.parallelWetOffset=c.parallelDryOffset=c.parallelEnableOffset=null;
      c.parallelWetRaw=c.parallelDryRaw=c.parallelEnableRaw=null;
      c.parallelWetDb=c.parallelDryDb=null;
      c.parallelWetInfinite=c.parallelDryInfinite=false;
      c.parallelActive=false;c.parallelEnableKnown=false;c.parallelWritableShape=false;
    }
  }
  return out;
};

function compressorParallelRawHex(raw){
  if(raw==null)return '—';
  const v=raw<0?raw+65536:raw;
  return `${hexByte(v>>8)} ${hexByte(v&255)}`;
}
function compressorParallelDisplay(db,infinite){return infinite?'−∞':`${Number(db).toFixed(2)} dB`;}

function setInputCompressorParallelEnable(channel,on){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.parallelWritableShape)return false;
  const raw=on?1:0;
  state.current.stage.datBytes[comp.parallelEnableOffset]=raw;
  comp.parallelEnableRaw=raw;comp.parallelActive=!!on;comp.parallelEnableKnown=true;
  markStageDirty();return true;
}

function setInputCompressorParallelLevel(channel,kind,value){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.parallelWritableShape)return false;
  const off=kind==='wet'?comp.parallelWetOffset:comp.parallelDryOffset;
  let raw;
  if(value==='-inf'||value===-Infinity){
    raw=COMP_PARALLEL_NEG_INF_RAW;
  }else{
    let db=Number(value);if(!Number.isFinite(db))return false;
    db=Math.max(COMP_PARALLEL_MIN_VERIFIED_DB,Math.min(COMP_PARALLEL_MAX_VERIFIED_DB,db));
    raw=Math.round(db*256);
  }
  writeI16BE(state.current.stage.datBytes,off,raw);
  const infinite=raw===COMP_PARALLEL_NEG_INF_RAW;
  if(kind==='wet'){
    comp.parallelWetRaw=raw;comp.parallelWetInfinite=infinite;comp.parallelWetDb=infinite?null:raw/256;
  }else{
    comp.parallelDryRaw=raw;comp.parallelDryInfinite=infinite;comp.parallelDryDb=infinite?null:raw/256;
  }
  markStageDirty();return true;
}

function parallelLevelEditorHtml(key,label,comp,kind){
  const inf=kind==='wet'?comp.parallelWetInfinite:comp.parallelDryInfinite;
  const db=kind==='wet'?comp.parallelWetDb:comp.parallelDryDb;
  const raw=kind==='wet'?comp.parallelWetRaw:comp.parallelDryRaw;
  return `
    <span>${label} <small>Manual RMS verified: −∞ or −40…0 dB</small></span>
    <div><input data-k="${key}" type="number" min="${COMP_PARALLEL_MIN_VERIFIED_DB}" max="${COMP_PARALLEL_MAX_VERIFIED_DB}" step="0.1" value="${inf?'':Number(db).toFixed(2)}" placeholder="−∞"><b>dB</b><button type="button" data-k="${key}-inf">−∞</button></div>
    <code>${compressorParallelRawHex(raw)}</code>`;
}

function injectCompressorParallelUi(){
  const root=$('#channelStateEditor');if(!root||!state.current?.stage)return;
  const channel=Number(root.dataset.channel||1);
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===channel);
  const panel=root.querySelector('.details-stack > .panel');
  if(!panel||!comp||panel.querySelector('[data-k="comp-parallel"]'))return;

  const compRow=panel.querySelector('[data-k="comp"]')?.closest('.peq-field');
  const thresholdRow=panel.querySelector('[data-k="comp-threshold"]')?.closest('.peq-field');

  const enableRow=document.createElement('div');enableRow.className='peq-field';
  enableRow.innerHTML=`
    <span>Parallel <small>Manual RMS verified</small></span>
    <select data-k="comp-parallel"><option value="1">On</option><option value="0">Off</option></select>
    <code>${comp.parallelEnableRaw==null?'—':hexByte(comp.parallelEnableRaw)}</code>`;

  const wetRow=document.createElement('div');wetRow.className='peq-field';
  wetRow.innerHTML=parallelLevelEditorHtml('comp-parallel-wet','Parallel Wet',comp,'wet');
  const dryRow=document.createElement('div');dryRow.className='peq-field';
  dryRow.innerHTML=parallelLevelEditorHtml('comp-parallel-dry','Parallel Dry',comp,'dry');

  if(thresholdRow){
    thresholdRow.insertAdjacentElement('beforebegin',enableRow);
  }else if(compRow){
    compRow.insertAdjacentElement('afterend',enableRow);
  }else panel.appendChild(enableRow);
  enableRow.insertAdjacentElement('afterend',wetRow);
  wetRow.insertAdjacentElement('afterend',dryRow);

  const enableSel=enableRow.querySelector('[data-k="comp-parallel"]');
  const wetInput=wetRow.querySelector('[data-k="comp-parallel-wet"]');
  const dryInput=dryRow.querySelector('[data-k="comp-parallel-dry"]');
  const wetInf=wetRow.querySelector('[data-k="comp-parallel-wet-inf"]');
  const dryInf=dryRow.querySelector('[data-k="comp-parallel-dry-inf"]');

  if(comp.parallelEnableKnown)enableSel.value=String(comp.parallelEnableRaw);
  else{
    const o=document.createElement('option');o.value='';o.textContent='Unknown';o.selected=true;enableSel.prepend(o);
  }
  if(!comp.parallelWritableShape){enableSel.disabled=true;wetInput.disabled=true;dryInput.disabled=true;wetInf.disabled=true;dryInf.disabled=true;}

  enableSel.onchange=()=>{
    if(setInputCompressorParallelEnable(channel,enableSel.value==='1'))renderChannelState();
    else toast('Parallel On/Off write blocked: only controlled Manual RMS records are enabled.',true);
  };
  wetInput.onchange=()=>{
    if(setInputCompressorParallelLevel(channel,'wet',wetInput.value))renderChannelState();
    else toast('Parallel Wet write blocked: verified finite range is −40…0 dB on Manual RMS.',true);
  };
  dryInput.onchange=()=>{
    if(setInputCompressorParallelLevel(channel,'dry',dryInput.value))renderChannelState();
    else toast('Parallel Dry write blocked: verified finite range is −40…0 dB on Manual RMS.',true);
  };
  wetInf.onclick=()=>{if(setInputCompressorParallelLevel(channel,'wet','-inf'))renderChannelState();};
  dryInf.onclick=()=>{if(setInputCompressorParallelLevel(channel,'dry','-inf'))renderChannelState();};

  const table=panel.querySelector('.config-table');
  if(table){
    const e=document.createElement('div');e.className='config-row';
    e.innerHTML=`<strong>Parallel</strong><code>state + 7 = ${comp.parallelEnableRaw==null?'—':hexByte(comp.parallelEnableRaw)}</code><span>${comp.parallelEnableKnown?(comp.parallelActive?'On':'Off'):'Unknown'}${comp.parallelWritableShape?' · verified write':' · read only for this model'}</span>`;
    table.appendChild(e);
    const w=document.createElement('div');w.className='config-row';
    w.innerHTML=`<strong>Parallel Wet</strong><code>state + 3..4 = ${compressorParallelRawHex(comp.parallelWetRaw)}</code><span>${compressorParallelDisplay(comp.parallelWetDb,comp.parallelWetInfinite)}${comp.parallelWritableShape?' · verified write':''}</span>`;
    table.appendChild(w);
    const d=document.createElement('div');d.className='config-row';
    d.innerHTML=`<strong>Parallel Dry</strong><code>state + 5..6 = ${compressorParallelRawHex(comp.parallelDryRaw)}</code><span>${compressorParallelDisplay(comp.parallelDryDb,comp.parallelDryInfinite)}${comp.parallelWritableShape?' · verified write':''}</span>`;
    table.appendChild(d);
  }

  const evidence=root.querySelector('.details-stack > .panel:last-child');
  if(evidence&&evidence!==panel&&!evidence.querySelector('.comp-parallel-evidence')){
    const p=document.createElement('p');p.className='comp-parallel-evidence';
    p.innerHTML='Controlled Manual RMS parallel scenes isolate <code>Wet = state +3..4</code>, <code>Dry = state +5..6</code>, and <code>On/Off = state +7</code>. Wet/Dry anchors are <code>−∞→80 01</code>, <code>−40→D7 FD</code>, <code>−20→EB FD</code>, <code>−10→F5 FD</code>, <code>−5→FA FD</code>, <code>0→00 00</code>. Duplicate On/Off pairs toggle only <code>01/00</code> at state <code>+7</code>.';
    evidence.appendChild(p);
  }
}

const renderChannelStateBeforeParallel=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeParallel();injectCompressorParallelUi();};

if(typeof PARAMETER_MAP!=='undefined'){
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-parallel-wet'))PARAMETER_MAP.push({
    id:'input-comp-parallel-wet',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',
    field:'Parallel Wet level',offset:'state + 3..4',datatype:'int16 big-endian',
    transform:'0x8001 = −∞; otherwise dB = raw / 256',
    confidence:'verified',write:true,
    evidence:'Controlled CH16 Wet scenes −∞, −40, −20, −10, −5, 0 dB. Every adjacent pair changes only state +3..4 outside scene-label bytes.',
    notes:'Writer guarded to Manual RMS. Finite writes are limited to directly tested −40…0 dB plus the explicit −∞ sentinel.'
  });
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-parallel-dry'))PARAMETER_MAP.push({
    id:'input-comp-parallel-dry',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',
    field:'Parallel Dry level',offset:'state + 5..6',datatype:'int16 big-endian',
    transform:'0x8001 = −∞; otherwise dB = raw / 256',
    confidence:'verified',write:true,
    evidence:'Controlled CH16 Dry scenes −∞, −40, −20, −10, −5, 0 dB. Every adjacent pair changes only state +5..6 outside scene-label bytes.',
    notes:'Writer guarded to Manual RMS. Finite writes are limited to directly tested −40…0 dB plus the explicit −∞ sentinel.'
  });
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-parallel-enable'))PARAMETER_MAP.push({
    id:'input-comp-parallel-enable',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',
    field:'Parallel On/Off',offset:'state + 7',datatype:'uint8',
    transform:'00 = Off; 01 = On',
    confidence:'verified',write:true,
    evidence:'Two independent CH16 On/Off pairs toggle only state +7 outside scene-label bytes.',
    notes:'Writer is guarded to the verified current-format Manual RMS record shape.'
  });
}

if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='channel-state');
  if(sec&&!sec.html.includes('Parallel compression — verified write')){
    sec.html+=`
      <h2>Parallel compression — verified write</h2>
      <pre><code>parallel wet = state +3..4 (int16_be / 256 dB; 8001 = −∞)
parallel dry = state +5..6 (int16_be / 256 dB; 8001 = −∞)
parallel on  = state +7      (00 Off / 01 On)</code></pre>
      <p>Controlled Manual RMS Wet and Dry series cover <code>−∞, −40, −20, −10, −5, 0 dB</code>. Each adjacent scene changes only the target two bytes outside the scene label. Two independent On/Off pairs toggle only state <code>+7</code>.</p>
      <div class="docs-callout"><strong>Writer guard:</strong> Parallel writes are currently enabled only on Manual RMS <code>01</code>. Finite Wet/Dry writes are limited to the directly tested <code>−40…0 dB</code> range plus the proven <code>0x8001</code> −∞ sentinel.</div>`;
  }
}
