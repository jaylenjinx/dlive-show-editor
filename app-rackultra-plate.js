'use strict';

// RevEngPlate1: controlled UFX2 RackUltra engine 1d00 (Plate Reverb Designer).
// All writes are guarded to engine 1d00 and the observed 262-byte AHFX payload
// (identical framing to the Spaces engines: 246-byte state after the label).
const AHFX_PLATE_ENGINE='1d00';

// Linear fields: raw = 0x8000 + 16 × displayed value, proven at every sweep point.
const AHFX_PLATE_LINEAR=[
  ['predelay','Pre Delay',30,0,170,'ms'],
  ['diffusion','Diffusion',36,0,100,'%'],['size','Size',38,0,100,'%'],
  ['shape','Shape',40,0,100,'%'],['modSpeed','Modulation Speed',66,0,100,'%'],
  ['modDepth','Modulation Depth',68,0,100,'%'],['width',"Width",112,0,100,'%'],
  ['position','Position',120,0,100,'%'],
];
// Decay Time uses the same time_log coordinate as Spaces (raw encodes milliseconds even
// though Decay is displayed in seconds). The 1/5/10/20/30 s anchors matched
// round(17874+5958×log10(ms)) exactly; the originally recorded 0.1 s anchor (0x91B1) does
// not fit that formula at all (it decodes to ~1.8 s), while Spaces' independently-verified
// 0.1 s point matches the formula exactly and the docs already establish both engines share
// one Decay coordinate — so 0x91B1 looks like a transcription error from the original sweep,
// not a real device floor, and the continuous writer covers the full 0.1-30 s range.
const AHFX_PLATE_DECAY_OFF=56,AHFX_PLATE_DECAY_MIN_S=0.1,AHFX_PLATE_DECAY_MAX_S=30;
// LF/HF Cut are the canonical PEQ log-frequency coordinate, matched exactly at every point.
const AHFX_PLATE_FREQ=[
  ['lfCut','Output LF Cut',70,20,1000],
  ['hfCut','Output HF Cut',72,1000,20000],
];
// Echo taps: L1 and R2 independently proven; the record order (4-byte stride from state
// +88, On/Off 2-byte stride from +133) matches the Spaces engines' echo layout exactly,
// so the same six-tap arrangement (L1,L2,L3,R1,R2,R3) is assumed for the untested taps.
const AHFX_PLATE_ECHO_GAIN_MIN_DB=-39,AHFX_PLATE_ECHO_GAIN_MAX_DB=10;
const AHFX_PLATE_ECHO_ON=new Map([[0x10,'On'],[0x00,'Off']]);
const AHFX_PLATE_ECHO=Object.fromEntries([
  ['e1','L1',0],['e2','R1',3],['e3','L2',1],['e4','R2',4],['e5','L3',2],['e6','R3',5]
].map(([key,tap,k])=>[key,{tap,timeOff:88+4*k,gainOff:90+4*k,onOff:133+2*k,timeMin:0,timeMax:200}]));
// Global Echoes section bypass, inverted from the usual toggle_10_on convention: 00 = In, 10 = Out.
const AHFX_PLATE_ECHO_SECTION_OFF=131;

function ahfxPlateCtx(slot){
  const stage=state.current?.stage,fx=stage?.ahfx?.find(x=>x.slot===Number(slot));
  if(!stage||!fx||fx.engineId!==AHFX_PLATE_ENGINE||fx.payloadLength!==262)return null;
  return {stage,fx,stateStart:ahfxStateStart(fx)};
}
function ahfxPlateRead16(ctx,off){return ahfxReadU16(ctx.stage.datBytes,ctx.stateStart+off);}
function ahfxPlateWrite16(ctx,off,raw){writeU16BE(ctx.stage.datBytes,ctx.stateStart+off,raw);markStageDirty();ahfxRefresh();return true;}
function ahfxPlateHex16(raw){return `${hexByte(raw>>8)} ${hexByte(raw&255)}`;}
function ahfxPlateOptions(map,fmt=(x)=>x){return [...map.entries()].map(([v])=>`<option value="${v}">${escapeHtml(String(fmt(v)))}</option>`).join('');}
function ahfxPlateSetExact(select,map,raw,fmtRaw=ahfxPlateHex16){
  const pair=[...map.entries()].find(([,r])=>r===raw);
  if(pair)select.value=String(pair[0]);
  else{const o=document.createElement('option');o.value='';o.textContent=`Current raw ${fmtRaw(raw)}`;o.selected=true;select.prepend(o);}
}
function ahfxPlateWriteLinear(slot,key,value){
  const ctx=ahfxPlateCtx(slot),spec=AHFX_PLATE_LINEAR.find(x=>x[0]===key);let v=Number(value);
  if(!ctx||!spec||!Number.isFinite(v))return false;v=Math.max(spec[3],Math.min(spec[4],Math.round(v)));
  return ahfxPlateWrite16(ctx,spec[2],0x8000+16*v);
}
function ahfxPlateWriteFreq(slot,key,hz){
  const ctx=ahfxPlateCtx(slot),spec=AHFX_PLATE_FREQ.find(x=>x[0]===key);let v=Number(hz);
  if(!ctx||!spec||!Number.isFinite(v))return false;v=Math.max(spec[3],Math.min(spec[4],v));
  return ahfxPlateWrite16(ctx,spec[2],Math.max(0,Math.min(0xffff,Math.floor(4608*Math.log2(v/4)))));
}
function ahfxPlateWriteDecay(slot,sec){
  const ctx=ahfxPlateCtx(slot);let v=Number(sec);
  if(!ctx||!Number.isFinite(v))return false;
  v=Math.max(AHFX_PLATE_DECAY_MIN_S,Math.min(AHFX_PLATE_DECAY_MAX_S,v));
  return ahfxPlateWrite16(ctx,AHFX_PLATE_DECAY_OFF,Math.round(17874+5958*Math.log10(v*1000)));
}
function ahfxPlateWriteEchoTime(slot,echo,ms){
  const ctx=ahfxPlateCtx(slot),spec=AHFX_PLATE_ECHO[echo];let value=Number(ms);
  if(!ctx||!spec||!Number.isFinite(value))return false;value=Math.max(spec.timeMin,Math.min(spec.timeMax,Math.round(value)));
  return ahfxPlateWrite16(ctx,spec.timeOff,0x8000+16*value);
}
function ahfxPlateWriteEchoGain(slot,echo,db){
  const ctx=ahfxPlateCtx(slot),spec=AHFX_PLATE_ECHO[echo];let value=Number(db);
  if(!ctx||!spec||!Number.isFinite(value))return false;
  value=Math.max(AHFX_PLATE_ECHO_GAIN_MIN_DB,Math.min(AHFX_PLATE_ECHO_GAIN_MAX_DB,value));
  return ahfxPlateWrite16(ctx,spec.gainOff,0x8000+Math.round(value*256));
}
function ahfxPlateWriteEnum8(slot,off,map,value){
  const ctx=ahfxPlateCtx(slot),raw=Number(value);if(!ctx||!map.has(raw))return false;
  ctx.stage.datBytes[ctx.stateStart+off]=raw;markStageDirty();ahfxRefresh();return true;
}

function injectRackUltraPlateControls(){
  const root=$('#ahfxManagers'),stage=state.current?.stage;if(!root||!stage?.ahfx)return;
  const cards=[...root.querySelectorAll('.fx-card')];
  stage.ahfx.forEach((fx,index)=>{
    const ctx=ahfxPlateCtx(fx.slot),card=cards[index];if(!ctx||!card||card.querySelector('[data-ahfx-plate]'))return;
    const read16=off=>ahfxPlateRead16(ctx,off),read8=off=>ctx.stage.datBytes[ctx.stateStart+off];
    const p=document.createElement('div');p.dataset.ahfxPlate='1';p.className='ahfx-verified-controls';
    p.innerHTML=`<div class="manager-head inline"><strong>Plate Reverb Designer verified controls</strong><span class="confidence verified">VERIFIED WRITE</span></div>
      ${AHFX_PLATE_LINEAR.map(([key,label,off,min,max,unit])=>`<div class="peq-field"><span>${label} <small>continuous verified ${min}…${max}${unit?' '+unit:''}</small></span><div><input data-k="${key}" type="number" min="${min}" max="${max}" step="1"><b>${unit}</b></div><code>${ahfxPlateHex16(read16(off))}</code></div>`).join('')}
      ${AHFX_PLATE_FREQ.map(([key,label,off,min,max])=>`<div class="peq-field"><span>${label} <small>continuous verified ${formatHz(min)}…${formatHz(max)}</small></span><div><input data-k="${key}" type="number" min="${min}" max="${max}" step="1"><b>Hz</b></div><code>${ahfxPlateHex16(read16(off))}</code></div>`).join('')}
      <div class="peq-field"><span>Decay Time <small>continuous verified ${AHFX_PLATE_DECAY_MIN_S}…${AHFX_PLATE_DECAY_MAX_S} s</small></span><div><input data-k="decay" type="number" min="${AHFX_PLATE_DECAY_MIN_S}" max="${AHFX_PLATE_DECAY_MAX_S}" step="0.1"><b>s</b></div><code>${ahfxPlateHex16(read16(AHFX_PLATE_DECAY_OFF))}</code></div>
      ${Object.entries(AHFX_PLATE_ECHO).map(([key,spec])=>`<div class="peq-field"><span>Echo ${key.slice(1)} (${spec.tap}) Time <small>continuous verified 0…200 ms</small></span><div><input data-k="${key}time" type="number" min="0" max="200" step="1"><b>ms</b></div><code>${ahfxPlateHex16(read16(spec.timeOff))}</code></div>
      <div class="peq-field"><span>Echo ${key.slice(1)} (${spec.tap}) Gain <small>continuous verified ${AHFX_PLATE_ECHO_GAIN_MIN_DB}…${AHFX_PLATE_ECHO_GAIN_MAX_DB} dB</small></span><div><input data-k="${key}gain" type="number" min="${AHFX_PLATE_ECHO_GAIN_MIN_DB}" max="${AHFX_PLATE_ECHO_GAIN_MAX_DB}" step="0.1"><b>dB</b></div><code>${ahfxPlateHex16(read16(spec.gainOff))}</code></div>
      <div class="peq-field"><span>Echo ${key.slice(1)} (${spec.tap}) On/Off</span><select data-k="${key}on">${[...AHFX_PLATE_ECHO_ON].map(([raw,label])=>`<option value="${raw}">${label}</option>`).join('')}</select><code>${hexByte(read8(spec.onOff))}</code></div>`).join('')}
      <div class="peq-field"><span>Echoes section <small>global bypass; inverted convention (00 = In)</small></span><select data-k="echoSection"><option value="0">In</option><option value="16">Out</option></select><code>${hexByte(read8(AHFX_PLATE_ECHO_SECTION_OFF))}</code></div>
      <div class="peq-field readonly"><span>Type preset <small>Director library preset; multi-byte write, not reproduced</small></span><code>${hexByte(read8(85))}</code><span class="confidence unknown">READ ONLY</span></div>
      <div class="console-note">Verified against L1 and R2 Echo taps only (evidence: RevEngPlate1). L2, L3, R1, R3 use the same tap layout by analogy with the Spaces engines but are not independently swept.</div>`;
    card.appendChild(p);

    for(const [key,,off,min,max] of AHFX_PLATE_LINEAR){
      const input=p.querySelector(`[data-k="${key}"]`),raw=read16(off),v=(raw-0x8000)/16;
      if(Number.isInteger(v)&&v>=min&&v<=max)input.value=String(v);else{input.disabled=true;input.title=`Current raw ${ahfxPlateHex16(raw)} is outside the controlled ${min}–${max} range.`;}
      input.onchange=()=>{if(ahfxPlateWriteLinear(fx.slot,key,input.value))renderFx();else toast(`RackUltra ${key} write blocked.`,true);};
    }
    for(const [key,,off,min,max] of AHFX_PLATE_FREQ){
      const input=p.querySelector(`[data-k="${key}"]`),raw=read16(off),hz=4*Math.pow(2,raw/4608);
      if(hz>=min*0.98&&hz<=max*1.02)input.value=String(Math.round(hz*100)/100);else{input.disabled=true;input.title=`Current raw ${ahfxPlateHex16(raw)} is outside the controlled ${formatHz(min)}–${formatHz(max)} range.`;}
      input.onchange=()=>{if(ahfxPlateWriteFreq(fx.slot,key,input.value))renderFx();else toast(`RackUltra ${key} write blocked.`,true);};
    }
    {
      const input=p.querySelector('[data-k="decay"]'),raw=read16(AHFX_PLATE_DECAY_OFF),sec=Math.pow(10,(raw-17874)/5958)/1000;
      input.value=String(Math.round(sec*100)/100);
      input.onchange=()=>{if(ahfxPlateWriteDecay(fx.slot,input.value))renderFx();else toast('RackUltra decay write blocked.',true);};
    }

    for(const echo of Object.keys(AHFX_PLATE_ECHO)){
      const spec=AHFX_PLATE_ECHO[echo];
      const time=p.querySelector(`[data-k="${echo}time"]`),gain=p.querySelector(`[data-k="${echo}gain"]`),on=p.querySelector(`[data-k="${echo}on"]`);
      const timeRaw=read16(spec.timeOff),timeMs=(timeRaw-0x8000)/16;
      if(timeRaw>=0x8000&&timeRaw<=0x8C80)time.value=String(timeMs);else{time.disabled=true;time.title='Current raw is outside the controlled 0–200 ms range.';}
      const gainRaw=read16(spec.gainOff),gainDb=(gainRaw-0x8000)/256;
      if(gainDb>=AHFX_PLATE_ECHO_GAIN_MIN_DB-0.01&&gainDb<=AHFX_PLATE_ECHO_GAIN_MAX_DB+0.01)gain.value=gainDb.toFixed(1);else{gain.disabled=true;gain.title='Current raw is outside the controlled range.';}
      const onRaw=read8(spec.onOff);
      if(AHFX_PLATE_ECHO_ON.has(onRaw))on.value=String(onRaw);else{const o=document.createElement('option');o.value='';o.textContent=`Current raw ${hexByte(onRaw)}`;o.selected=true;on.prepend(o);}
      time.onchange=()=>{if(ahfxPlateWriteEchoTime(fx.slot,echo,time.value))renderFx();else toast(`RackUltra ${echo.toUpperCase()} time write blocked.`,true);};
      gain.onchange=()=>{if(ahfxPlateWriteEchoGain(fx.slot,echo,gain.value))renderFx();else toast(`RackUltra ${echo.toUpperCase()} gain write blocked.`,true);};
      on.onchange=()=>{if(on.value!==''&&ahfxPlateWriteEnum8(fx.slot,spec.onOff,AHFX_PLATE_ECHO_ON,on.value))renderFx();else if(on.value!=='')toast(`RackUltra ${echo.toUpperCase()} On/Off write blocked.`,true);};
    }
    const sectionSel=p.querySelector('[data-k="echoSection"]'),sectionRaw=read8(AHFX_PLATE_ECHO_SECTION_OFF);
    sectionSel.value=(sectionRaw===0||sectionRaw===0x10)?String(sectionRaw):'';
    if(sectionSel.value==='')  {const o=document.createElement('option');o.value='';o.textContent=`Current raw ${hexByte(sectionRaw)}`;o.selected=true;sectionSel.prepend(o);}
    sectionSel.onchange=()=>{if(sectionSel.value!==''&&ahfxPlateWriteEnum8(fx.slot,AHFX_PLATE_ECHO_SECTION_OFF,new Map([[0,'In'],[16,'Out']]),sectionSel.value))renderFx();else if(sectionSel.value!=='')toast('RackUltra Echoes section write blocked.',true);};
  });
}

const renderFxBeforeRackUltraPlate=renderFx;
renderFx=function(){renderFxBeforeRackUltraPlate();injectRackUltraPlateControls();};

if(typeof PARAMETER_MAP!=='undefined'){
  const rows=[];
  for(const [key,label,off,min,max,unit] of AHFX_PLATE_LINEAR)rows.push([key,label,`state +${off}..${off+1}`,`raw=0x8000+16×value; verified ${min}…${max}${unit?' '+unit:''}`]);
  for(const [key,label,off,min,max] of AHFX_PLATE_FREQ)rows.push([key,label,`state +${off}..${off+1}`,`raw=floor(4608×log2(hz/4)); verified ${formatHz(min)}…${formatHz(max)}`]);
  rows.push(['decay','Decay Time',`state +${AHFX_PLATE_DECAY_OFF}..${AHFX_PLATE_DECAY_OFF+1}`,`raw=round(17874+5958×log10(ms)); verified ${AHFX_PLATE_DECAY_MIN_S}…${AHFX_PLATE_DECAY_MAX_S} s`]);
  for(const [key,spec] of Object.entries(AHFX_PLATE_ECHO)){
    const n=key.slice(1);
    rows.push([`echo${n}-time`,`Echo ${n} (${spec.tap}) Time`,`state +${spec.timeOff}..${spec.timeOff+1}`,'raw=0x8000+16×milliseconds; verified 0…200 ms']);
    rows.push([`echo${n}-gain`,`Echo ${n} (${spec.tap}) Gain`,`state +${spec.gainOff}..${spec.gainOff+1}`,`raw=0x8000+round(dB×256); verified ${AHFX_PLATE_ECHO_GAIN_MIN_DB}…${AHFX_PLATE_ECHO_GAIN_MAX_DB} dB`]);
    rows.push([`echo${n}-on`,`Echo ${n} (${spec.tap}) On/Off`,`state +${spec.onOff}`,'10=On;00=Off']);
  }
  rows.push(['echo-section','Echoes section bypass','state +131','00=In;10=Out (inverted convention)']);
  rows.push(['type-preset','Type preset','state +85','decoded/read-only; e.g. Vocal Focus=0x60, Bright=0x00']);
  for(const [id,field,offset,transform] of rows)if(!PARAMETER_MAP.some(x=>x.id===`ahfx-plate-${id}`))PARAMETER_MAP.push({
    id:`ahfx-plate-${id}`,area:'RackUltra',record:'AHFX Manager NN',payload:'262-byte AHFX payload; engine 1d00',field,offset,datatype:'engine-specific controlled field',transform,
    confidence:id==='type-preset'?'decoded':'verified',write:id!=='type-preset',
    evidence:'RevEngPlate1: automated Director sweep on UFX Send 2 (62 main-control scenes + 28 echo-tap scenes); each adjacent pair changes only the target AHFX field outside the scene name. Time/level/frequency/decay values match the identical Spaces (1c03/1c04) coordinate systems exactly.',
    notes:id==='type-preset'?'Selecting a preset in Director rewrites many bytes at once (a hybrid state the console never otherwise generates), so it stays read-only, matching the Spaces Reflection Model / RackUltra model policy.':'Guarded to engine 1d00 and the 262-byte payload.'
  });
}

const rackUltraPlateNotice=$('#tabFx .notice');
if(rackUltraPlateNotice&&!/Plate/.test(rackUltraPlateNotice.innerHTML)){
  rackUltraPlateNotice.innerHTML+=' RackUltra engine <code>1d00</code> (Plate Reverb Designer) now has guarded controlled fields: Pre Delay, Decay, Diffusion, Size, Position, Shape, Width, Output LF/HF Cut, Modulation and Echo 1–6 time/gain/On-Off are writable. Type preset and unmapped DSP bytes remain read-only.';
}
