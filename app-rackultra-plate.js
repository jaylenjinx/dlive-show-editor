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
// Exact typed anchors: Decay carries the same rounding as Spaces' time_log coordinate;
// HF/LF Cut are the canonical PEQ log-frequency coordinate.
const AHFX_PLATE_ANCHORS=[
  ['decay','Decay Time',56,new Map([[0.1,0x91B1],[1,0x8BA3],[5,0x9BE8],[10,0xA2E9],[20,0xA9EB],[30,0xAE04]]),v=>`${v} s`],
  ['lfCut','Output LF Cut',70,new Map([[20,0x29CB],[50,0x4196],[100,0x5396],[200,0x6596],[500,0x7D62],[1000,0x8F62]]),v=>formatHz(v)],
  ['hfCut','Output HF Cut',72,new Map([[1000,0x8F63],[2000,0xA162],[5000,0xB92D],[10000,0xCB2D],[20000,0xDD2D]]),v=>formatHz(v)],
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
function ahfxPlateWriteMapped16(slot,off,map,value){
  const ctx=ahfxPlateCtx(slot),raw=map.get(Number(value));if(!ctx||raw==null)return false;return ahfxPlateWrite16(ctx,off,raw);
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
      ${AHFX_PLATE_ANCHORS.map(([key,label,off,map,fmt])=>`<div class="peq-field"><span>${label} <small>exact controlled anchors</small></span><select data-k="${key}">${ahfxPlateOptions(map,fmt)}</select><code>${ahfxPlateHex16(read16(off))}</code></div>`).join('')}
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
    for(const [key,,off,map] of AHFX_PLATE_ANCHORS){const sel=p.querySelector(`[data-k="${key}"]`);ahfxPlateSetExact(sel,map,read16(off));sel.onchange=()=>{if(sel.value!==''&&ahfxPlateWriteMapped16(fx.slot,off,map,sel.value))renderFx();else if(sel.value!=='')toast(`RackUltra ${key} write blocked.`,true);};}

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
  for(const [key,label,off,map,fmt] of AHFX_PLATE_ANCHORS)rows.push([key,label,`state +${off}..${off+1}`,`exact anchors ${[...map.keys()].map(fmt).join(', ')}`]);
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
