'use strict';

// RevEngRD1: controlled UFX3 RackUltra engine 2d00 (Rhythm Delay), Simple mode only.
// Same 262-byte AHFX payload shape as the other RackUltra engines. Advanced mode's
// variable-length per-tap pattern editor (individual tap position/gain/pan, Bar Length,
// Dry Repeat) is a different, open-ended data structure and is not mapped here.
const AHFX_RHYTHM_DELAY_ENGINE='2d00';

// BPM: raw = round(60000 / bpm) — the delay time in ms for one beat at that tempo.
// Confirmed exactly at four points (33, 200, 500, 1000 BPM); Director's range is 33-1000.
const AHFX_RD_BPM_OFF=28,AHFX_RD_BPM_MIN=33,AHFX_RD_BPM_MAX=1000;
// Auto Pan and Drive: linear 0x8000 + 16 x value, 0-100%. Same coordinate as every other
// percentage control across the Spaces/Plate engines.
const AHFX_RD_LINEAR=[
  ['autoPan','Auto Pan',148,0,100],
  ['drive','Drive',144,0,100],
  ['amplitude','Amplitude',38,0,100],
];
// Feedback: raw = 0x8000 + round(dB x 256), a clean continuous formula (no low-byte
// quantisation noise), confirmed at five points. Director's numeric floor is -39 dB;
// typing/dragging below that shows a non-numeric "Off" state (not explored further).
const AHFX_RD_FEEDBACK_OFF=30,AHFX_RD_FEEDBACK_MIN_DB=-39,AHFX_RD_FEEDBACK_MAX_DB=5;
// Global Tap Tempo On/Off.
const AHFX_RD_GTAP_OFF=147;
// Dotted/Triplet groove: one shared three-state enum, not two independent toggles.
const AHFX_RD_GROOVE_OFF=35;
const AHFX_RD_GROOVE=new Map([[0x00,'Triplet'],[0x10,'Straight'],[0x20,'Dotted']]);

function ahfxRdCtx(slot){
  const stage=state.current?.stage,fx=stage?.ahfx?.find(x=>x.slot===Number(slot));
  if(!stage||!fx||fx.engineId!==AHFX_RHYTHM_DELAY_ENGINE||fx.payloadLength!==262)return null;
  return {stage,fx,stateStart:ahfxStateStart(fx)};
}
function ahfxRdRead16(ctx,off){return ahfxReadU16(ctx.stage.datBytes,ctx.stateStart+off);}
function ahfxRdWrite16(ctx,off,raw){writeU16BE(ctx.stage.datBytes,ctx.stateStart+off,raw);markStageDirty();ahfxRefresh();return true;}
function ahfxRdHex16(raw){return `${hexByte(raw>>8)} ${hexByte(raw&255)}`;}
function ahfxRdWriteBpm(slot,bpm){
  const ctx=ahfxRdCtx(slot);let v=Number(bpm);
  if(!ctx||!Number.isFinite(v))return false;v=Math.max(AHFX_RD_BPM_MIN,Math.min(AHFX_RD_BPM_MAX,Math.round(v)));
  return ahfxRdWrite16(ctx,AHFX_RD_BPM_OFF,Math.round(60000/v));
}
function ahfxRdBpmFromRaw(raw){return raw>0?Math.round(60000/raw):null;}
function ahfxRdWriteLinear(slot,key,value){
  const ctx=ahfxRdCtx(slot),spec=AHFX_RD_LINEAR.find(x=>x[0]===key);let v=Number(value);
  if(!ctx||!spec||!Number.isFinite(v))return false;v=Math.max(spec[3],Math.min(spec[4],Math.round(v)));
  return ahfxRdWrite16(ctx,spec[2],0x8000+16*v);
}
function ahfxRdWriteFeedback(slot,db){
  const ctx=ahfxRdCtx(slot);let v=Number(db);
  if(!ctx||!Number.isFinite(v))return false;
  v=Math.max(AHFX_RD_FEEDBACK_MIN_DB,Math.min(AHFX_RD_FEEDBACK_MAX_DB,v));
  return ahfxRdWrite16(ctx,AHFX_RD_FEEDBACK_OFF,0x8000+Math.round(v*256));
}
function ahfxRdWriteEnum8(slot,off,map,value){
  const ctx=ahfxRdCtx(slot),raw=Number(value);if(!ctx||!map.has(raw))return false;
  ctx.stage.datBytes[ctx.stateStart+off]=raw;markStageDirty();ahfxRefresh();return true;
}

function injectRackUltraRhythmDelayControls(){
  const root=$('#ahfxManagers'),stage=state.current?.stage;if(!root||!stage?.ahfx)return;
  const cards=[...root.querySelectorAll('.fx-card')];
  stage.ahfx.forEach((fx,index)=>{
    const ctx=ahfxRdCtx(fx.slot),card=cards[index];if(!ctx||!card||card.querySelector('[data-ahfx-rd]'))return;
    const read16=off=>ahfxRdRead16(ctx,off),read8=off=>ctx.stage.datBytes[ctx.stateStart+off];
    const p=document.createElement('div');p.dataset.ahfxRd='1';p.className='ahfx-verified-controls';
    const bpmRaw=read16(AHFX_RD_BPM_OFF),bpm=ahfxRdBpmFromRaw(bpmRaw);
    const fbRaw=read16(AHFX_RD_FEEDBACK_OFF),fbDb=(fbRaw-0x8000)/256;
    const grooveRaw=read8(AHFX_RD_GROOVE_OFF),gtapRaw=read8(AHFX_RD_GTAP_OFF);
    p.innerHTML=`<div class="manager-head inline"><strong>Rhythm Delay verified controls</strong><span class="confidence verified">VERIFIED WRITE</span></div>
      <div class="peq-field"><span>Tempo <small>continuous verified ${AHFX_RD_BPM_MIN}…${AHFX_RD_BPM_MAX} BPM</small></span><div><input data-k="bpm" type="number" min="${AHFX_RD_BPM_MIN}" max="${AHFX_RD_BPM_MAX}" step="1" value="${bpm}"><b>BPM</b></div><code>${ahfxRdHex16(bpmRaw)}</code></div>
      <div class="peq-field"><span>Global Tap Tempo</span><select data-k="gtap"><option value="0">Off</option><option value="16">On</option></select><code>${hexByte(gtapRaw)}</code></div>
      <div class="peq-field"><span>Groove <small>Dotted/Triplet share one enum</small></span><select data-k="groove">${[...AHFX_RD_GROOVE].map(([raw,label])=>`<option value="${raw}">${label}</option>`).join('')}</select><code>${hexByte(grooveRaw)}</code></div>
      ${AHFX_RD_LINEAR.map(([key,label,off,min,max])=>`<div class="peq-field"><span>${label} <small>continuous verified ${min}…${max}%</small></span><div><input data-k="${key}" type="number" min="${min}" max="${max}" step="1"><b>%</b></div><code>${ahfxRdHex16(read16(off))}</code></div>`).join('')}
      <div class="peq-field"><span>Feedback <small>continuous verified ${AHFX_RD_FEEDBACK_MIN_DB}…${AHFX_RD_FEEDBACK_MAX_DB} dB</small></span><div><input data-k="feedback" type="number" min="${AHFX_RD_FEEDBACK_MIN_DB}" max="${AHFX_RD_FEEDBACK_MAX_DB}" step="0.1" value="${fbDb.toFixed(1)}"><b>dB</b></div><code>${ahfxRdHex16(fbRaw)}</code></div>
      <div class="peq-field readonly"><span>Type preset, Interval, Number of Repeats, Advanced mode pattern <small>not independently swept</small></span><span class="confidence unknown">READ ONLY</span></div>
      <div class="console-note">Amplitude also proportionally scales the Advanced-mode pattern's individual tap gain bytes; those are read only.</div>`;
    card.appendChild(p);

    const bpmInput=p.querySelector('[data-k="bpm"]');
    bpmInput.onchange=()=>{if(ahfxRdWriteBpm(fx.slot,bpmInput.value))renderFx();else toast('RackUltra Tempo write blocked.',true);};
    const gtapSel=p.querySelector('[data-k="gtap"]');
    if(gtapRaw!==0&&gtapRaw!==0x10){const o=document.createElement('option');o.value='';o.textContent=`Current raw ${hexByte(gtapRaw)}`;o.selected=true;gtapSel.prepend(o);}else gtapSel.value=String(gtapRaw);
    gtapSel.onchange=()=>{if(gtapSel.value!==''&&ahfxRdWriteEnum8(fx.slot,AHFX_RD_GTAP_OFF,new Map([[0,'Off'],[16,'On']]),gtapSel.value))renderFx();else if(gtapSel.value!=='')toast('RackUltra Global Tap write blocked.',true);};
    const grooveSel=p.querySelector('[data-k="groove"]');
    if(AHFX_RD_GROOVE.has(grooveRaw))grooveSel.value=String(grooveRaw);else{const o=document.createElement('option');o.value='';o.textContent=`Current raw ${hexByte(grooveRaw)}`;o.selected=true;grooveSel.prepend(o);}
    grooveSel.onchange=()=>{if(grooveSel.value!==''&&ahfxRdWriteEnum8(fx.slot,AHFX_RD_GROOVE_OFF,AHFX_RD_GROOVE,grooveSel.value))renderFx();else if(grooveSel.value!=='')toast('RackUltra Groove write blocked.',true);};
    for(const [key,label,off,min,max] of AHFX_RD_LINEAR){
      const input=p.querySelector(`[data-k="${key}"]`),raw=read16(off),v=(raw-0x8000)/16;
      if(Number.isInteger(v)&&v>=min&&v<=max)input.value=String(v);else{input.disabled=true;input.title=`Current raw ${ahfxRdHex16(raw)} is outside the controlled ${min}–${max} range.`;}
      input.onchange=()=>{if(ahfxRdWriteLinear(fx.slot,key,input.value))renderFx();else toast(`RackUltra ${label} write blocked.`,true);};
    }
    const fbInput=p.querySelector('[data-k="feedback"]');
    fbInput.onchange=()=>{if(ahfxRdWriteFeedback(fx.slot,fbInput.value))renderFx();else toast('RackUltra Feedback write blocked.',true);};
  });
}

const renderFxBeforeRackUltraRd=renderFx;
renderFx=function(){renderFxBeforeRackUltraRd();injectRackUltraRhythmDelayControls();};

if(typeof PARAMETER_MAP!=='undefined'){
  const rows=[
    ['tempo','Tempo (BPM)',`state +${AHFX_RD_BPM_OFF}..${AHFX_RD_BPM_OFF+1}`,`raw=round(60000/BPM); verified ${AHFX_RD_BPM_MIN}…${AHFX_RD_BPM_MAX} BPM`],
    ['global-tap','Global Tap Tempo',`state +${AHFX_RD_GTAP_OFF}`,'10=On;00=Off'],
    ['groove',"Groove (Dotted/Triplet)",`state +${AHFX_RD_GROOVE_OFF}`,'00=Triplet;10=Straight;20=Dotted (one shared enum)'],
    ['feedback','Feedback',`state +${AHFX_RD_FEEDBACK_OFF}..${AHFX_RD_FEEDBACK_OFF+1}`,`raw=0x8000+round(dB×256); verified ${AHFX_RD_FEEDBACK_MIN_DB}…${AHFX_RD_FEEDBACK_MAX_DB} dB`],
  ];
  for(const [key,label,off,min,max] of AHFX_RD_LINEAR)rows.push([key,label,`state +${off}..${off+1}`,`raw=0x8000+16×value; verified ${min}…${max}%`]);
  for(const [id,field,offset,transform] of rows)if(!PARAMETER_MAP.some(x=>x.id===`ahfx-rd-${id}`))PARAMETER_MAP.push({
    id:`ahfx-rd-${id}`,area:'RackUltra',record:'AHFX Manager NN',payload:'262-byte AHFX payload; engine 2d00',field,offset,datatype:'engine-specific controlled field',transform,
    confidence:'verified',write:true,
    evidence:'RevEngRD1: 37 automated Director scenes on UFX Send 3, Simple mode; each adjacent pair changes only the target AHFX field. Feedback and the percentage controls match the same coordinate systems already proven on the Spaces and Plate engines.',
    notes:id==='amplitude'?'Also proportionally scales the Advanced-mode pattern tap gain bytes (read only). Guarded to engine 2d00 and the 262-byte payload.':'Guarded to engine 2d00 and the 262-byte payload.'
  });
}

const rackUltraRdNotice=$('#tabFx .notice');
if(rackUltraRdNotice&&!/Rhythm Delay/.test(rackUltraRdNotice.innerHTML)){
  rackUltraRdNotice.innerHTML+=' RackUltra engine <code>2d00</code> (Rhythm Delay, Simple mode) now has guarded controlled fields: Tempo, Global Tap, Groove, Auto Pan, Drive, Amplitude and Feedback are writable. Type preset, Interval, Number of Repeats and the Advanced-mode pattern editor remain read-only.';
}
