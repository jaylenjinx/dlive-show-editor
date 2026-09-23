'use strict';

// First verified RackUltra DSP writes from controlled UFX1 480 Large / Spaces
// scenes. The generic AHFX manager parser remains unchanged; this module adds
// guarded engine-specific field access for engine 1c03 only.
const AHFX_SPACES_LARGE_ENGINE='1c03';
const AHFX_SPACES_PREDELAY_STATE_OFFSET=30;
const AHFX_SPACES_DECAY_STATE_OFFSET=58;
const AHFX_SPACES_PREDELAY_MIN_MS=0;
const AHFX_SPACES_PREDELAY_MAX_MS=170;
// Decay Time uses the same time_log coordinate as the other Spaces/Plate engines (raw
// encodes milliseconds even though the display is seconds). All three controlled anchors
// matched round(17874+5958×log10(ms)) within ±1 raw unit (~0.0002 dB-equivalent), the same
// negligible typed-entry noise already accepted elsewhere, so the writer is continuous.
const AHFX_SPACES_DECAY_MIN_S=0.1,AHFX_SPACES_DECAY_MAX_S=60;

function ahfxStateStart(fx){
  const label=`AHFX Manager ${String(fx.slot).padStart(2,'0')}`;
  return fx.pos+label.length+1;
}
function ahfxReadU16(dat,off){return ((dat[off]<<8)|dat[off+1])>>>0;}
function ahfxRefresh(){if(state.current?.stage)state.current.stage.ahfx=parseAhfxManagers(state.current.stage.datBytes);}
function ahfxSpacesFields(fx){
  const stage=state.current?.stage;if(!stage||!fx||fx.engineId!==AHFX_SPACES_LARGE_ENGINE||fx.payloadLength!==262)return null;
  const s=ahfxStateStart(fx),preRaw=ahfxReadU16(stage.datBytes,s+AHFX_SPACES_PREDELAY_STATE_OFFSET),decayRaw=ahfxReadU16(stage.datBytes,s+AHFX_SPACES_DECAY_STATE_OFFSET);
  return {stateStart:s,preDelayOffset:s+AHFX_SPACES_PREDELAY_STATE_OFFSET,preDelayRaw:preRaw,preDelayMs:(preRaw-0x8000)/16,
    decayOffset:s+AHFX_SPACES_DECAY_STATE_OFFSET,decayRaw,decaySeconds:Math.pow(10,(decayRaw-17874)/5958)/1000,
    writableShape:preRaw>=0x8000&&preRaw<=0x8AA0};
}
function setAhfxSpacesPreDelay(slot,ms){
  const stage=state.current?.stage,fx=stage?.ahfx?.find(x=>x.slot===Number(slot));const fields=ahfxSpacesFields(fx);if(!fields?.writableShape)return false;
  let value=Number(ms);if(!Number.isFinite(value))return false;value=Math.max(AHFX_SPACES_PREDELAY_MIN_MS,Math.min(AHFX_SPACES_PREDELAY_MAX_MS,Math.round(value)));
  const raw=0x8000+value*16;writeU16BE(stage.datBytes,fields.preDelayOffset,raw);markStageDirty();ahfxRefresh();return true;
}
function setAhfxSpacesDecay(slot,sec){
  const stage=state.current?.stage,fx=stage?.ahfx?.find(x=>x.slot===Number(slot));const fields=ahfxSpacesFields(fx);if(!fields?.writableShape)return false;
  let value=Number(sec);if(!Number.isFinite(value))return false;value=Math.max(AHFX_SPACES_DECAY_MIN_S,Math.min(AHFX_SPACES_DECAY_MAX_S,value));
  const raw=Math.round(17874+5958*Math.log10(value*1000));writeU16BE(stage.datBytes,fields.decayOffset,raw);markStageDirty();ahfxRefresh();return true;
}

function injectVerifiedRackUltraControls(){
  const root=$('#ahfxManagers'),stage=state.current?.stage;if(!root||!stage?.ahfx)return;
  const cards=[...root.querySelectorAll('.fx-card')];
  stage.ahfx.forEach((fx,index)=>{
    if(fx.engineId!==AHFX_SPACES_LARGE_ENGINE)return;const card=cards[index],fields=ahfxSpacesFields(fx);if(!card||!fields||card.querySelector('[data-ahfx-spaces-controls]'))return;
    const panel=document.createElement('div');panel.dataset.ahfxSpacesControls='1';panel.className='ahfx-verified-controls';
    panel.innerHTML=`<div class="manager-head inline"><strong>480 Large verified controls</strong><span class="confidence verified">VERIFIED WRITE</span></div>
      <div class="peq-field"><span>Pre Delay <small>continuous verified transform 0…170 ms</small></span><div><input data-k="ahfx-pre" type="number" min="0" max="170" step="1" value="${Number(fields.preDelayMs.toFixed(3))}"><b>ms</b></div><code>${hexByte(fields.preDelayRaw>>8)} ${hexByte(fields.preDelayRaw&255)}</code></div>
      <div class="peq-field"><span>Decay Time <small>continuous verified ${AHFX_SPACES_DECAY_MIN_S}…${AHFX_SPACES_DECAY_MAX_S} s</small></span><div><input data-k="ahfx-decay" type="number" min="${AHFX_SPACES_DECAY_MIN_S}" max="${AHFX_SPACES_DECAY_MAX_S}" step="0.1" value="${Math.round(fields.decaySeconds*100)/100}"><b>s</b></div><code>${hexByte(fields.decayRaw>>8)} ${hexByte(fields.decayRaw&255)}</code></div>`;
    card.appendChild(panel);
    const pre=panel.querySelector('[data-k="ahfx-pre"]'),decay=panel.querySelector('[data-k="ahfx-decay"]');
    pre.onchange=()=>{if(setAhfxSpacesPreDelay(fx.slot,pre.value))renderFx();else toast('RackUltra Pre Delay write blocked by engine/shape validation.',true);};
    decay.onchange=()=>{if(setAhfxSpacesDecay(fx.slot,decay.value))renderFx();else toast('RackUltra Decay write blocked by engine/shape validation.',true);};
  });
}

const renderFxBeforeVerifiedRackUltra=renderFx;
renderFx=function(){renderFxBeforeVerifiedRackUltra();injectVerifiedRackUltraControls();};

if(typeof PARAMETER_MAP!=='undefined'){
  const opaque=PARAMETER_MAP.find(x=>x.id==='ahfx-dsp');if(opaque){opaque.notes='DSP payload remains generally opaque, but engine 1c03 (480 Large / Spaces) now has verified Pre Delay and restricted Decay writers.';}
  const rows=[
    {id:'ahfx-spaces-large-predelay',area:'RackUltra',record:'AHFX Manager NN',payload:'262-byte AHFX payload; engine 1c03',field:'480 Large / Spaces Pre Delay',offset:'state +30..31 (payload +46..47)',datatype:'uint16 big-endian',transform:'raw = 0x8000 + 16 × preDelay_ms',confidence:'verified',write:true,evidence:'Controlled UFX1 engine 1c03 scenes store 0 ms=8000, 85 ms=8550, 170 ms=8AA0.',notes:'Writer 0…170 ms, integer-ms UI; engine ID and payload length guarded.'},
    {id:'ahfx-spaces-large-decay',area:'RackUltra',record:'AHFX Manager NN',payload:'262-byte AHFX payload; engine 1c03',field:'480 Large / Spaces Decay Time',offset:'state +58..59 (payload +74..75)',datatype:'uint16 big-endian logarithmic time coordinate',transform:`raw=round(17874+5958×log10(ms)); verified ${AHFX_SPACES_DECAY_MIN_S}…${AHFX_SPACES_DECAY_MAX_S} s`,confidence:'verified',write:true,evidence:'Three controlled UFX1 decay scenes change only state +58..59 while Pre Delay is reset to its baseline; all three anchors match the canonical time_log coordinate within ±1 raw unit.',notes:'Same time_log coordinate proven continuous on the Spaces medium and Plate Reverb engines.'}
  ];
  for(const row of rows)if(!PARAMETER_MAP.some(x=>x.id===row.id))PARAMETER_MAP.push(row);
}

// Keep the existing RackUltra inspector and in-app docs aligned with the first
// verified DSP writes without replacing the general read-only/raw inspector.
const rackUltraNotice=$('#tabFx .notice');
if(rackUltraNotice){
  rackUltraNotice.className='notice safe';
  rackUltraNotice.innerHTML='<strong>Partial verified write:</strong> RackUltra records remain generally decoded/read-only, but engine <code>1c03</code> (480 Large / Spaces) now has guarded continuous Pre Delay and Decay Time writers. Other AHFX DSP bytes are preserved.';
}
if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='rackultra');
  if(sec&&!sec.html.includes('480 Large verified writes')){
    sec.eyebrow='Partial verified write';
    sec.html+=`<h2>480 Large verified writes</h2><p>Controlled UFX1 scenes on engine <code>1c03</code> isolate two DSP fields in the 262-byte <code>AHFX Manager NN</code> payload.</p><pre><code>Pre Delay = state +30..31 = payload +46..47
raw = 0x8000 + 16 × delay_ms
0 ms = 80 00, 85 ms = 85 50, 170 ms = 8A A0

Decay Time = state +58..59 = payload +74..75
raw = round(17874 + 5958 × log10(decay_ms)); 0.10 s = 74 5E, ~2.45 s = 94 B2, ~60 s = B5 07</code></pre><div class="docs-callout"><strong>Writer guards:</strong> Pre Delay is enabled only for engine <code>1c03</code> with the observed 262-byte payload and range 0–170 ms. Decay is continuous over 0.1–60 s using the same log-time coordinate proven on the Spaces medium and Plate engines. Every other AHFX DSP field remains read-only.</div>`;
  }
}
