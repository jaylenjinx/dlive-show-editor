'use strict';

// Controlled dLive 2.12 CH16 compressor-threshold clones isolate state +8..+9.
// Encoding is signed int16 big-endian / 256 dB. The supplied experiment used
// compressor model byte 0x01, so threshold writes remain deliberately guarded
// to that model until other models are independently tested.

const COMP_THRESHOLD_MIN_VERIFIED_DB=-46;
const COMP_THRESHOLD_MAX_VERIFIED_DB=18;
const COMP_THRESHOLD_MODEL_VERIFIED=0x01;

const parseInputCompressorStatesBeforeThreshold=parseInputCompressorStates;
parseInputCompressorStates=function(dat){
  const out=parseInputCompressorStatesBeforeThreshold(dat);
  for(const c of out){
    if(c.stateLength>=10){
      c.thresholdOffset=c.stateStart+8;
      c.thresholdRaw=readI16BE(dat,c.thresholdOffset);
      c.thresholdDb=c.thresholdRaw/256;
      c.thresholdWritableShape=!!c.writableShape&&c.modelRaw===COMP_THRESHOLD_MODEL_VERIFIED;
    }else{
      c.thresholdOffset=null;c.thresholdRaw=null;c.thresholdDb=null;c.thresholdWritableShape=false;
    }
  }
  return out;
};

function compressorThresholdRawHex(comp){
  if(comp?.thresholdRaw==null)return '—';
  const v=comp.thresholdRaw<0?comp.thresholdRaw+65536:comp.thresholdRaw;
  return `${hexByte(v>>8)} ${hexByte(v&255)}`;
}

function setInputCompressorThreshold(channel,db){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.thresholdWritableShape)return false;
  let value=Number(db);if(!Number.isFinite(value))return false;
  value=Math.max(COMP_THRESHOLD_MIN_VERIFIED_DB,Math.min(COMP_THRESHOLD_MAX_VERIFIED_DB,value));
  const raw=Math.round(value*256);
  writeI16BE(state.current.stage.datBytes,comp.thresholdOffset,raw);
  comp.thresholdRaw=raw;comp.thresholdDb=raw/256;
  markStageDirty();return true;
}

function injectCompressorThresholdUi(){
  const root=$('#channelStateEditor');if(!root||!state.current?.stage)return;
  const channel=Number(root.dataset.channel||1);
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===channel);
  const panel=root.querySelector('.details-stack > .panel');
  if(!panel||!comp||panel.querySelector('[data-k="comp-threshold"]'))return;

  const compRow=panel.querySelector('[data-k="comp"]')?.closest('.peq-field');
  const row=document.createElement('div');row.className='peq-field';
  row.innerHTML=`
    <span>Compressor threshold <small>verified on model 0x01: −46…+18 dB</small></span>
    <div><input data-k="comp-threshold" type="number" min="${COMP_THRESHOLD_MIN_VERIFIED_DB}" max="${COMP_THRESHOLD_MAX_VERIFIED_DB}" step="0.1" value="${comp.thresholdDb?.toFixed(2)??''}"><b>dB</b></div>
    <code>${compressorThresholdRawHex(comp)}</code>`;
  if(compRow)compRow.insertAdjacentElement('afterend',row);else panel.appendChild(row);

  const input=row.querySelector('[data-k="comp-threshold"]');
  if(!comp.thresholdWritableShape)input.disabled=true;
  input.onchange=()=>{
    if(setInputCompressorThreshold(channel,input.value))renderChannelState();
    else toast('Compressor threshold write blocked: only the controlled model 0x01/current record shape is enabled.',true);
  };

  const table=panel.querySelector('.config-table');
  if(table){
    const detail=document.createElement('div');detail.className='config-row';
    detail.innerHTML=`<strong>Compressor threshold</strong><code>state + 8..9 = ${compressorThresholdRawHex(comp)}</code><span>${comp.thresholdDb?.toFixed(2)??'—'} dB${comp.thresholdWritableShape?' · verified write':' · read only for this model'}</span>`;
    table.appendChild(detail);
  }

  const banner=$('#tabChannelstate .notice');
  if(banner)banner.innerHTML='<strong>Verified write:</strong> input fader, pan, compressor On/Off and compressor threshold (verified model 0x01) are isolated with controlled scene clones. Other compressor parameters and routing/send fields remain read-only.';

  const confidence=root.querySelector('.peq-toolbar .confidence');
  if(confidence&&decoded?.mixer?.writableShape)confidence.textContent='FADER + PAN + COMP VERIFIED WRITE';

  const evidence=root.querySelector('.details-stack > .panel:last-child');
  if(evidence&&evidence!==panel&&!evidence.querySelector('.comp-threshold-evidence')){
    const p=document.createElement('p');p.className='comp-threshold-evidence';
    p.innerHTML='Controlled threshold scenes <code>−46, −30, −20, −10, 0, +10, +18 dB</code> isolate compressor state bytes <code>+8..9</code>. The field is signed big-endian fixed point: <code>dB = int16 / 256</code>.';
    evidence.appendChild(p);
  }
}

const renderChannelStateBeforeThreshold=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeThreshold();injectCompressorThresholdUi();};

// Keep the interactive canonical registry in sync with the verified writer.
if(typeof PARAMETER_MAP!=='undefined'&&!PARAMETER_MAP.some(x=>x.id==='input-comp-threshold')){
  PARAMETER_MAP.push({
    id:'input-comp-threshold',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'current-format state length 127 bytes after label',
    field:'Compressor threshold',offset:'state + 8..9',datatype:'int16 big-endian',
    transform:'threshold_dB = raw / 256; canonical raw = round(dB × 256)',
    confidence:'verified',write:true,
    evidence:'Controlled CH16 clones: −46, −30, −20, −10, 0, +10, +18 dB. Every adjacent pair changes only state +8..9 outside scene-label bytes.',
    notes:'Writer is deliberately guarded to compressor model byte 0x01, processor discriminator 0x08 and the verified 127-byte state shape. Verified range −46…+18 dB.'
  });
}

// Extend the built-in Channel State documentation without duplicating the base page.
if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='channel-state');
  if(sec&&!sec.html.includes('Compressor threshold — verified write')){
    sec.eyebrow='Fader + pan + compressor verified write';
    sec.html+=`
      <h2>Compressor threshold — verified write</h2>
      <pre><code>state + 8..9 = int16_be
threshold_dB = raw / 256</code></pre>
      <table class="docs-table"><thead><tr><th>Scene</th><th>Raw</th><th>Decoded</th></tr></thead><tbody>
        <tr><td>−46 dB</td><td><code>D2 00</code></td><td>−46.00 dB</td></tr>
        <tr><td>−30 dB</td><td><code>E1 FD</code></td><td>≈ −30.01 dB</td></tr>
        <tr><td>−20 dB</td><td><code>EB FD</code></td><td>≈ −20.01 dB</td></tr>
        <tr><td>−10 dB</td><td><code>F5 FD</code></td><td>≈ −10.01 dB</td></tr>
        <tr><td>0 dB</td><td><code>00 03</code></td><td>≈ +0.01 dB</td></tr>
        <tr><td>+10 dB</td><td><code>0A 03</code></td><td>≈ +10.01 dB</td></tr>
        <tr><td>+18 dB</td><td><code>12 00</code></td><td>+18.00 dB</td></tr>
      </tbody></table>
      <p>The tiny <code>FD</code>/<code>03</code> fractions show normal control quantisation around the labelled integer values; the encoding is the same signed <code>/256 dB</code> convention used elsewhere.</p>
      <div class="docs-callout"><strong>Writer guard:</strong> threshold writing is enabled only for the controlled compressor model byte <code>01</code> in the verified current-format record. Other compressor models remain read-only until separately tested.</div>`;
  }
}
