'use strict';

// Controlled dLive 2.12 CH16 compressor-threshold clones establish two schemes:
// - Manual RMS (0x01) + Opto (0x02): state +8..9, signed int16 BE / 256 dB
// - Bus (0x09): state +51, uint8 quarter-dB coordinate: dB = raw/4 - 15

const COMP_THRESHOLD_MIN_VERIFIED_DB=-46;
const COMP_THRESHOLD_MAX_VERIFIED_DB=18;
const COMP_THRESHOLD_MODELS_VERIFIED=new Set([0x01,0x02]);
const BUS_THRESHOLD_MODEL=0x09;
const BUS_THRESHOLD_MIN_VERIFIED_DB=-15;
const BUS_THRESHOLD_MAX_VERIFIED_DB=15;

const parseInputCompressorStatesBeforeThreshold=parseInputCompressorStates;
parseInputCompressorStates=function(dat){
  const out=parseInputCompressorStatesBeforeThreshold(dat);
  for(const c of out){
    if(c.stateLength>=10){
      c.commonThresholdOffset=c.stateStart+8;
      c.commonThresholdRaw=readI16BE(dat,c.commonThresholdOffset);
      c.commonThresholdDb=c.commonThresholdRaw/256;
    }else{
      c.commonThresholdOffset=null;c.commonThresholdRaw=null;c.commonThresholdDb=null;
    }

    if(c.modelRaw===BUS_THRESHOLD_MODEL&&c.stateLength>51){
      c.thresholdKind='bus';
      c.thresholdOffset=c.stateStart+51;
      c.thresholdRaw=dat[c.thresholdOffset];
      c.thresholdDb=c.thresholdRaw/4-15;
      c.thresholdWritableShape=!!c.writableShape&&c.thresholdRaw>=0&&c.thresholdRaw<=120;
      c.thresholdMinDb=BUS_THRESHOLD_MIN_VERIFIED_DB;
      c.thresholdMaxDb=BUS_THRESHOLD_MAX_VERIFIED_DB;
      c.thresholdStepDb=0.25;
    }else{
      c.thresholdKind='common';
      c.thresholdOffset=c.commonThresholdOffset;
      c.thresholdRaw=c.commonThresholdRaw;
      c.thresholdDb=c.commonThresholdDb;
      c.thresholdWritableShape=!!c.writableShape&&COMP_THRESHOLD_MODELS_VERIFIED.has(c.modelRaw);
      c.thresholdMinDb=COMP_THRESHOLD_MIN_VERIFIED_DB;
      c.thresholdMaxDb=COMP_THRESHOLD_MAX_VERIFIED_DB;
      c.thresholdStepDb=0.1;
    }
  }
  return out;
};

function compressorThresholdRawHex(comp){
  if(comp?.thresholdRaw==null)return '—';
  if(comp.thresholdKind==='bus')return hexByte(comp.thresholdRaw);
  const v=comp.thresholdRaw<0?comp.thresholdRaw+65536:comp.thresholdRaw;
  return `${hexByte(v>>8)} ${hexByte(v&255)}`;
}

function setInputCompressorThreshold(channel,db){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.thresholdWritableShape)return false;
  let value=Number(db);if(!Number.isFinite(value))return false;

  if(comp.thresholdKind==='bus'){
    value=Math.max(BUS_THRESHOLD_MIN_VERIFIED_DB,Math.min(BUS_THRESHOLD_MAX_VERIFIED_DB,value));
    const raw=Math.max(0,Math.min(120,Math.round((value+15)*4)));
    state.current.stage.datBytes[comp.thresholdOffset]=raw;
    comp.thresholdRaw=raw;comp.thresholdDb=raw/4-15;
  }else{
    value=Math.max(COMP_THRESHOLD_MIN_VERIFIED_DB,Math.min(COMP_THRESHOLD_MAX_VERIFIED_DB,value));
    const raw=Math.round(value*256);
    writeI16BE(state.current.stage.datBytes,comp.thresholdOffset,raw);
    comp.thresholdRaw=raw;comp.thresholdDb=raw/256;
    comp.commonThresholdRaw=raw;comp.commonThresholdDb=raw/256;
  }
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
  const isBus=comp.thresholdKind==='bus';
  const rangeLabel=isBus?'Bus verified: −15…+15 dB':'Manual RMS + Opto verified: −46…+18 dB';
  const offsetLabel=isBus?'state + 51':'state + 8..9';
  const row=document.createElement('div');row.className='peq-field';
  row.innerHTML=`
    <span>Compressor threshold <small>${rangeLabel}</small></span>
    <div><input data-k="comp-threshold" type="number" min="${comp.thresholdMinDb}" max="${comp.thresholdMaxDb}" step="${comp.thresholdStepDb}" value="${comp.thresholdDb?.toFixed(2)??''}"><b>dB</b></div>
    <code>${compressorThresholdRawHex(comp)}</code>`;
  if(compRow)compRow.insertAdjacentElement('afterend',row);else panel.appendChild(row);

  const input=row.querySelector('[data-k="comp-threshold"]');
  if(!comp.thresholdWritableShape)input.disabled=true;
  input.onchange=()=>{
    if(setInputCompressorThreshold(channel,input.value))renderChannelState();
    else toast('Compressor threshold write blocked: this compressor model has not been independently verified for threshold writes.',true);
  };

  const table=panel.querySelector('.config-table');
  if(table){
    const detail=document.createElement('div');detail.className='config-row';
    detail.innerHTML=`<strong>Compressor threshold</strong><code>${offsetLabel} = ${compressorThresholdRawHex(comp)}</code><span>${comp.thresholdDb?.toFixed(2)??'—'} dB${comp.thresholdWritableShape?' · verified write':' · read only for this model'}</span>`;
    table.appendChild(detail);
  }

  const banner=$('#tabChannelstate .notice');
  if(banner)banner.innerHTML='<strong>Verified write:</strong> input fader, pan, compressor On/Off, Manual RMS/Opto common threshold and Bus model-specific threshold are isolated with controlled scenes. Other compressor parameters and routing/send fields remain read-only.';

  const confidence=root.querySelector('.peq-toolbar .confidence');
  if(confidence&&decoded?.mixer?.writableShape)confidence.textContent='FADER + PAN + COMP VERIFIED WRITE';

  const evidence=root.querySelector('.details-stack > .panel:last-child');
  if(evidence&&evidence!==panel&&!evidence.querySelector('.comp-threshold-evidence')){
    const p=document.createElement('p');p.className='comp-threshold-evidence';
    p.innerHTML='Manual RMS and Opto threshold scenes isolate <code>state +8..9</code> as signed <code>/256 dB</code>. Bus threshold scenes isolate <code>state +51</code>; corrected anchors <code>−15→00, −9→18, 0→3C, +9→60, +15→78</code> prove <code>dB = raw/4 − 15</code>.';
    evidence.appendChild(p);
  }
}

const renderChannelStateBeforeThreshold=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeThreshold();injectCompressorThresholdUi();};

if(typeof PARAMETER_MAP!=='undefined'){
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-threshold'))PARAMETER_MAP.push({
    id:'input-comp-threshold',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'current-format state length 127 bytes after label',
    field:'Common compressor threshold (Manual RMS / Opto)',offset:'state + 8..9',datatype:'int16 big-endian',
    transform:'threshold_dB = raw / 256; canonical raw = round(dB × 256)',
    confidence:'verified',write:true,
    evidence:'Controlled CH16 Manual RMS clones: −46, −30, −20, −10, 0, +10, +18 dB; independent Opto clones: −46, −20.3, 0, +10.5, +18 dB. Each series changes only state +8..9 outside scene-label bytes.',
    notes:'Writer is guarded to model 0x01 Manual RMS or 0x02 Opto, processor discriminator 0x08 and the verified 127-byte state shape. Verified range −46…+18 dB.'
  });
  if(!PARAMETER_MAP.some(x=>x.id==='input-comp-bus-threshold'))PARAMETER_MAP.push({
    id:'input-comp-bus-threshold',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Bus model 0x09, current-format 127-byte state',
    field:'Bus compressor threshold',offset:'state + 51',datatype:'uint8',
    transform:'threshold_dB = raw / 4 − 15; canonical raw = round((dB + 15) × 4)',
    confidence:'verified',write:true,
    evidence:'Controlled CH16 Bus scenes corrected to −15, −9, 0, +9, +15 dB map exactly to 00,18,3C,60,78. Each adjacent pair changes only state +51 outside scene-label bytes.',
    notes:'Verified Bus range −15…+15 dB. This is model-specific and distinct from the common +8..9 threshold field.'
  });
}

if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='channel-state');
  if(sec&&!sec.html.includes('Compressor threshold — verified write')){
    sec.eyebrow='Fader + pan + compressor verified write';
    sec.html+=`
      <h2>Compressor threshold — verified write</h2>
      <h3>Manual RMS + Opto</h3>
      <pre><code>state + 8..9 = int16_be
threshold_dB = raw / 256</code></pre>
      <p>Manual RMS and independent Opto controlled series isolate the same two-byte field over −46…+18 dB.</p>
      <h3>Bus</h3>
      <pre><code>state + 51 = uint8
threshold_dB = raw / 4 - 15</code></pre>
      <p>Corrected controlled Bus anchors are <code>−15→00</code>, <code>−9→18</code>, <code>0→3C</code>, <code>+9→60</code>, <code>+15→78</code>. Every adjacent pair changes only state byte <code>+51</code>.</p>
      <div class="docs-callout"><strong>Writer guards:</strong> common threshold writes are enabled only for Manual RMS <code>01</code> and Opto <code>02</code>; Bus threshold writes use the separate verified <code>+51</code> field only on model <code>09</code>.</div>`;
  }
}
