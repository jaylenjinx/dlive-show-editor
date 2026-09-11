'use strict';

// Controlled dLive 2.12 CH16 Manual RMS scenes isolate:
//   state +16..17 = makeup gain, signed int16 big-endian / 256 dB
//   state +18     = knee enum, 00 Normal / 01 Soft
// Both writers remain deliberately guarded to Manual RMS (model 0x01).
const COMP_KNEE_GAIN_MODEL_VERIFIED=0x01;
const COMP_MAKEUP_MIN_VERIFIED_DB=0;
const COMP_MAKEUP_MAX_VERIFIED_DB=18;
const COMP_KNEE_LABELS=new Map([[0x00,'Normal'],[0x01,'Soft']]);

const parseInputCompressorStatesBeforeKneeGain=parseInputCompressorStates;
parseInputCompressorStates=function(dat){
  const out=parseInputCompressorStatesBeforeKneeGain(dat);
  for(const c of out){
    if(c.stateLength>=19){
      c.makeupOffset=c.stateStart+16;
      c.makeupRaw=readI16BE(dat,c.makeupOffset);
      c.makeupDb=c.makeupRaw/256;
      c.kneeOffset=c.stateStart+18;
      c.kneeRaw=dat[c.kneeOffset];
      c.kneeLabel=COMP_KNEE_LABELS.get(c.kneeRaw)||`Unknown 0x${hexByte(c.kneeRaw)}`;
      c.kneeKnown=COMP_KNEE_LABELS.has(c.kneeRaw);
      c.kneeGainWritableShape=!!c.writableShape&&c.modelRaw===COMP_KNEE_GAIN_MODEL_VERIFIED;
    }else{
      c.makeupOffset=c.kneeOffset=null;
      c.makeupRaw=c.makeupDb=c.kneeRaw=null;
      c.kneeLabel=null;c.kneeKnown=false;c.kneeGainWritableShape=false;
    }
  }
  return out;
};

function compressorMakeupRawHex(comp){
  if(comp?.makeupRaw==null)return '—';
  const v=comp.makeupRaw<0?comp.makeupRaw+65536:comp.makeupRaw;
  return `${hexByte(v>>8)} ${hexByte(v&255)}`;
}

function setInputCompressorMakeup(channel,db){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.kneeGainWritableShape)return false;
  let value=Number(db);if(!Number.isFinite(value))return false;
  value=Math.max(COMP_MAKEUP_MIN_VERIFIED_DB,Math.min(COMP_MAKEUP_MAX_VERIFIED_DB,value));
  const raw=Math.round(value*256);
  writeI16BE(state.current.stage.datBytes,comp.makeupOffset,raw);
  comp.makeupRaw=raw;comp.makeupDb=raw/256;
  markStageDirty();return true;
}

function setInputCompressorKnee(channel,raw){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  raw=Number(raw);
  if(!comp?.kneeGainWritableShape||!COMP_KNEE_LABELS.has(raw))return false;
  state.current.stage.datBytes[comp.kneeOffset]=raw;
  comp.kneeRaw=raw;comp.kneeLabel=COMP_KNEE_LABELS.get(raw);comp.kneeKnown=true;
  markStageDirty();return true;
}

function injectCompressorKneeGainUi(){
  const root=$('#channelStateEditor');if(!root||!state.current?.stage)return;
  const channel=Number(root.dataset.channel||1);
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===channel);
  const panel=root.querySelector('.details-stack > .panel');
  if(!panel||!comp||panel.querySelector('[data-k="comp-makeup"]'))return;

  const releaseRow=panel.querySelector('[data-k="comp-release"]')?.closest('.peq-field');
  const attackRow=panel.querySelector('[data-k="comp-attack"]')?.closest('.peq-field');
  const ratioRow=panel.querySelector('[data-k="comp-ratio"]')?.closest('.peq-field');
  const thresholdRow=panel.querySelector('[data-k="comp-threshold"]')?.closest('.peq-field');
  const compRow=panel.querySelector('[data-k="comp"]')?.closest('.peq-field');
  const anchor=releaseRow||attackRow||ratioRow||thresholdRow||compRow;

  const makeupRow=document.createElement('div');makeupRow.className='peq-field';
  makeupRow.innerHTML=`
    <span>Compressor makeup gain <small>Manual RMS verified: 0…+18 dB</small></span>
    <div><input data-k="comp-makeup" type="number" min="${COMP_MAKEUP_MIN_VERIFIED_DB}" max="${COMP_MAKEUP_MAX_VERIFIED_DB}" step="0.1" value="${comp.makeupDb?.toFixed(2)??''}"><b>dB</b></div>
    <code>${compressorMakeupRawHex(comp)}</code>`;
  if(anchor)anchor.insertAdjacentElement('afterend',makeupRow);else panel.appendChild(makeupRow);

  const kneeRow=document.createElement('div');kneeRow.className='peq-field';
  kneeRow.innerHTML=`
    <span>Compressor knee <small>Manual RMS verified enum</small></span>
    <select data-k="comp-knee"><option value="0">Normal</option><option value="1">Soft</option></select>
    <code>${comp.kneeRaw==null?'—':hexByte(comp.kneeRaw)}</code>`;
  makeupRow.insertAdjacentElement('afterend',kneeRow);

  const makeupInput=makeupRow.querySelector('[data-k="comp-makeup"]');
  const kneeSelect=kneeRow.querySelector('[data-k="comp-knee"]');
  if(comp.kneeKnown)kneeSelect.value=String(comp.kneeRaw);
  else{
    const o=document.createElement('option');o.value='';o.textContent=comp.kneeLabel||'Unknown';o.selected=true;kneeSelect.prepend(o);
  }
  if(!comp.kneeGainWritableShape){makeupInput.disabled=true;kneeSelect.disabled=true;}

  makeupInput.onchange=()=>{
    if(setInputCompressorMakeup(channel,makeupInput.value))renderChannelState();
    else toast('Makeup gain write blocked: only controlled Manual RMS records are enabled.',true);
  };
  kneeSelect.onchange=()=>{
    if(setInputCompressorKnee(channel,kneeSelect.value))renderChannelState();
    else toast('Knee write blocked: only Normal/Soft on controlled Manual RMS records are enabled.',true);
  };

  const table=panel.querySelector('.config-table');
  if(table){
    const m=document.createElement('div');m.className='config-row';
    m.innerHTML=`<strong>Makeup gain</strong><code>state + 16..17 = ${compressorMakeupRawHex(comp)}</code><span>${comp.makeupDb?.toFixed(2)??'—'} dB${comp.kneeGainWritableShape?' · verified write':' · read only for this model'}</span>`;
    table.appendChild(m);
    const k=document.createElement('div');k.className='config-row';
    k.innerHTML=`<strong>Knee</strong><code>state + 18 = ${comp.kneeRaw==null?'—':hexByte(comp.kneeRaw)}</code><span>${comp.kneeLabel||'—'}${comp.kneeGainWritableShape&&comp.kneeKnown?' · verified write':' · read only for this model/value'}</span>`;
    table.appendChild(k);
  }

  const evidence=root.querySelector('.details-stack > .panel:last-child');
  if(evidence&&evidence!==panel&&!evidence.querySelector('.comp-knee-gain-evidence')){
    const p=document.createElement('p');p.className='comp-knee-gain-evidence';
    p.innerHTML='Controlled Manual RMS makeup scenes isolate <code>state +16..17</code>: <code>0 dB→00 00</code>, <code>6 dB→06 03</code>, <code>12 dB→0C 03</code>, <code>18 dB→12 00</code>, confirming signed <code>/256 dB</code>. Duplicate knee pairs isolate <code>state +18</code>: <code>00 Normal</code>, <code>01 Soft</code>.';
    evidence.appendChild(p);
  }
}

const renderChannelStateBeforeKneeGain=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeKneeGain();injectCompressorKneeGainUi();};

if(typeof PARAMETER_MAP!=='undefined'){
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-makeup'))PARAMETER_MAP.push({
    id:'input-comp-makeup',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',
    field:'Compressor makeup gain',offset:'state + 16..17',datatype:'int16 big-endian',
    transform:'makeup_dB = raw / 256; canonical raw = round(dB × 256)',
    confidence:'verified',write:true,
    evidence:'Controlled CH16 Manual RMS scenes 0, +6, +12, +18 dB. Adjacent scenes change only state +16..17 outside scene-label bytes.',
    notes:'Writer guarded to Manual RMS/current-format record and directly tested 0…+18 dB range.'
  });
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-knee'))PARAMETER_MAP.push({
    id:'input-comp-knee',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',
    field:'Compressor knee',offset:'state + 18',datatype:'uint8 enum',
    transform:'00 = Normal; 01 = Soft',
    confidence:'verified',write:true,
    evidence:'Two independent Normal/Soft CH16 pairs toggle only state +18 outside scene-label bytes; duplicate Normal scenes are byte-identical and duplicate Soft scenes are byte-identical.',
    notes:'Writer exposes only the two directly verified knee values and is guarded to Manual RMS.'
  });
}

if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='channel-state');
  if(sec&&!sec.html.includes('Makeup gain and knee — verified write')){
    sec.html+=`
      <h2>Makeup gain and knee — verified write</h2>
      <pre><code>makeup gain = state +16..17 (int16_be / 256 dB)
knee        = state +18 (uint8 enum)</code></pre>
      <p>Controlled Manual RMS makeup anchors: <code>0 dB = 00 00</code>, <code>+6 dB = 06 03</code>, <code>+12 dB = 0C 03</code>, <code>+18 dB = 12 00</code>. The small <code>03</code> low-byte offsets are the same physical-control quantisation seen in other dB parameters.</p>
      <p>Knee is a one-byte enum: <code>00 = Normal</code>, <code>01 = Soft</code>. Two duplicate Normal/Soft pairs reproduce exactly and change no other post-label StageBox bytes.</p>
      <div class="docs-callout"><strong>Writer guard:</strong> both controls are currently enabled only on Manual RMS <code>01</code>. Makeup gain is limited to the directly tested <code>0…+18 dB</code> range.</div>`;
  }
}
