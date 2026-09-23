'use strict';

// ReverseEngineer2: controlled UFX1 RackUltra engine 1c04 (Spaces / 480 Medium).
// All writes are guarded to engine 1c04 and the observed 262-byte AHFX payload.
const AHFX_SPACES_MEDIUM_ENGINE='1c04';

const AHFX_MEDIUM_POSITION_TABLES={
  ll:new Map([[0,0x6C00],[25,0x7123],[50,0x7582],[75,0x79E1],[100,0x8000]]),
  el:new Map([[0,0x6C00],[25,0x7193],[50,0x760E],[75,0x7AA5],[100,0x8000]]),
  sl:new Map([[0,0x6C00],[25,0x730D],[50,0x7A97],[75,0x817A],[100,0x8A00]]),
};
const AHFX_MEDIUM_POSITION_OFFSETS={ll:70,el:68,sl:94};

// ReverseEngineer6: all six echo taps share one 4-byte block layout from state +96
// (time, gain) plus a one-byte On/Off at +127+2k. Tap order in the record is L1,L2,L3,R1,R2,R3;
// Echo 1/2 keep their earlier names (L1/R1), Echo 3-6 are L2,R2,L3,R3.
// Echo feedback anchors matched round(0x8000+dB×256) within ±3 raw units (~0.012 dB) at
// every tested point — the same negligible typed-entry noise already accepted for Plate's
// and Rhythm Delay's gain writers. Promoted to a continuous writer over the tested range.
const AHFX_MEDIUM_ECHO_FEEDBACK_MIN_DB=-40,AHFX_MEDIUM_ECHO_FEEDBACK_MAX_DB=10;
const AHFX_MEDIUM_ECHO_ON=new Map([[0x10,'On'],[0x00,'Off']]);
const AHFX_MEDIUM_ECHO=Object.fromEntries([
  ['e1','L1',0],['e2','R1',3],['e3','L2',1],['e4','R2',4],['e5','L3',2],['e6','R3',5]
].map(([key,tap,k])=>[key,{tap,timeOff:96+4*k,feedbackOff:98+4*k,onOff:127+2*k,timeMin:0,timeMax:200}]));
const AHFX_MEDIUM_DAMP_HF_TYPE=new Map([[0x10,'6 dB'],[0x20,'12 dB'],[0x30,'Shelf']]);
const AHFX_MEDIUM_OUT_HF_TYPE=new Map([[0x10,'6 dB'],[0x20,'12 dB'],[0x30,'Shelf']]);

// ReverseEngineer7: remaining HOME/SPACE/TEXTURE/EQ controls. Offsets match the 1c03 Spaces layout.
// Linear fields store raw = 0x8000 + 16 × displayed value, proven at every sweep point.
const AHFX_MEDIUM_LINEAR=[
  ['predelay','Pre Delay',30,0,170,'ms'],['density','Density',32,0,100,'%'],['impact','Impact',34,0,100,'%'],
  ['diffE','Diffusion Early',36,0,8,''],['diffM','Diffusion Mid',38,0,8,''],['diffL','Diffusion Late',40,0,8,''],
  ['direct','Direct Send',42,0,100,'%'],['width','Width',60,1,30,''],['length','Length',62,1,35,''],
  ['modRate','Modulation Rate',72,0,100,'%'],['modDepth','Modulation Depth',74,0,100,'%'],['spread','Stereo Spread',122,0,100,'%'],
];
// Frequency anchors matched raw = floor(4608 × log2(hz/4)) exactly at every tested point —
// the same canonical coordinate already proven continuous for PEQ/HPF/LPF frequency.
// Promoted from anchor-only selects to continuous number inputs over the tested range.
const AHFX_MEDIUM_FREQ=[
  ['dampLf','Damping LF',46,20,1000],
  ['dampHfFreq','Damping HF frequency',64,40,20000],
  ['outLf','Output LF Cut',76,20,1000],
  ['outHf','Output HF Cut',78,1000,20000],
  ['hfTone','Colour HF Tone',50,2000,20000],
  ['colFreq','Colour Cut/Boost frequency',54,500,20000],
];
// Gain anchors matched round(0x8000+dB×256) within ±3 raw units (~0.012 dB) at every
// tested point, the same negligible typed-entry noise already accepted for Plate's and
// Rhythm Delay's gain writers. Promoted to continuous over the tested range.
const AHFX_MEDIUM_GAIN=[
  ['dampHfShelf','Damping HF shelf gain',66,-15,0],
  ['outHfShelf','Output HF shelf gain',86,-15,0],
  ['colGain','Colour Cut/Boost gain',56,-15,6],
];
// Decay Time uses the same time_log coordinate as PEQ/compressor time fields (the raw
// value encodes milliseconds even though Decay is displayed in seconds). Matches the
// anchors exactly across the full tested 0.1-10 s range.
const AHFX_MEDIUM_DECAY_OFF=58,AHFX_MEDIUM_DECAY_MIN_S=0.1,AHFX_MEDIUM_DECAY_MAX_S=10;

function ahfxMediumCtx(slot){
  const stage=state.current?.stage,fx=stage?.ahfx?.find(x=>x.slot===Number(slot));
  if(!stage||!fx||fx.engineId!==AHFX_SPACES_MEDIUM_ENGINE||fx.payloadLength!==262)return null;
  return {stage,fx,stateStart:ahfxStateStart(fx)};
}
function ahfxMediumRead16(ctx,off){return ahfxReadU16(ctx.stage.datBytes,ctx.stateStart+off);}
function ahfxMediumWrite16(ctx,off,raw){writeU16BE(ctx.stage.datBytes,ctx.stateStart+off,raw);markStageDirty();ahfxRefresh();return true;}
function ahfxMediumHex16(raw){return `${hexByte(raw>>8)} ${hexByte(raw&255)}`;}
function ahfxMediumOptions(map,fmt=(x)=>x){return [...map.entries()].map(([v])=>`<option value="${v}">${escapeHtml(String(fmt(v)))}</option>`).join('');}
function ahfxMediumSetExact(select,map,raw,fmtRaw=ahfxMediumHex16){
  const pair=[...map.entries()].find(([,r])=>r===raw);
  if(pair)select.value=String(pair[0]);
  else{const o=document.createElement('option');o.value='';o.textContent=`Current raw ${fmtRaw(raw)}`;o.selected=true;select.prepend(o);}
}
function ahfxMediumWritePosition(slot,key,position){
  const ctx=ahfxMediumCtx(slot),map=AHFX_MEDIUM_POSITION_TABLES[key],off=AHFX_MEDIUM_POSITION_OFFSETS[key],pos=Number(position),raw=map?.get(pos);
  if(!ctx||raw==null||off==null)return false;return ahfxMediumWrite16(ctx,off,raw);
}
function ahfxMediumWriteEchoTime(slot,echo,ms){
  const ctx=ahfxMediumCtx(slot),spec=AHFX_MEDIUM_ECHO[echo];let value=Number(ms);
  if(!ctx||!spec||!Number.isFinite(value))return false;value=Math.max(spec.timeMin,Math.min(spec.timeMax,Math.round(value)));
  return ahfxMediumWrite16(ctx,spec.timeOff,0x8000+16*value);
}
function ahfxMediumWriteEchoFeedback(slot,echo,db){
  const ctx=ahfxMediumCtx(slot),spec=AHFX_MEDIUM_ECHO[echo];let v=Number(db);
  if(!ctx||!spec||!Number.isFinite(v))return false;
  v=Math.max(AHFX_MEDIUM_ECHO_FEEDBACK_MIN_DB,Math.min(AHFX_MEDIUM_ECHO_FEEDBACK_MAX_DB,v));
  return ahfxMediumWrite16(ctx,spec.feedbackOff,0x8000+Math.round(v*256));
}
function ahfxMediumWriteLinear(slot,key,value){
  const ctx=ahfxMediumCtx(slot),spec=AHFX_MEDIUM_LINEAR.find(x=>x[0]===key);let v=Number(value);
  if(!ctx||!spec||!Number.isFinite(v))return false;v=Math.max(spec[3],Math.min(spec[4],Math.round(v)));
  return ahfxMediumWrite16(ctx,spec[2],0x8000+16*v);
}
function ahfxMediumWriteFreq(slot,key,hz){
  const ctx=ahfxMediumCtx(slot),spec=AHFX_MEDIUM_FREQ.find(x=>x[0]===key);let v=Number(hz);
  if(!ctx||!spec||!Number.isFinite(v))return false;v=Math.max(spec[3],Math.min(spec[4],v));
  return ahfxMediumWrite16(ctx,spec[2],Math.max(0,Math.min(0xffff,Math.floor(4608*Math.log2(v/4)))));
}
function ahfxMediumWriteGainDb(slot,key,db){
  const ctx=ahfxMediumCtx(slot),spec=AHFX_MEDIUM_GAIN.find(x=>x[0]===key);let v=Number(db);
  if(!ctx||!spec||!Number.isFinite(v))return false;v=Math.max(spec[3],Math.min(spec[4],v));
  return ahfxMediumWrite16(ctx,spec[2],0x8000+Math.round(v*256));
}
function ahfxMediumWriteDecay(slot,sec){
  const ctx=ahfxMediumCtx(slot);let v=Number(sec);
  if(!ctx||!Number.isFinite(v))return false;
  v=Math.max(AHFX_MEDIUM_DECAY_MIN_S,Math.min(AHFX_MEDIUM_DECAY_MAX_S,v));
  return ahfxMediumWrite16(ctx,AHFX_MEDIUM_DECAY_OFF,Math.round(17874+5958*Math.log10(v*1000)));
}
function ahfxMediumWriteEnum8(slot,off,map,value){
  const ctx=ahfxMediumCtx(slot),raw=Number(value);if(!ctx||!map.has(raw))return false;
  ctx.stage.datBytes[ctx.stateStart+off]=raw;markStageDirty();ahfxRefresh();return true;
}

function injectRackUltraMediumControls(){
  const root=$('#ahfxManagers'),stage=state.current?.stage;if(!root||!stage?.ahfx)return;
  const cards=[...root.querySelectorAll('.fx-card')];
  stage.ahfx.forEach((fx,index)=>{
    const ctx=ahfxMediumCtx(fx.slot),card=cards[index];if(!ctx||!card||card.querySelector('[data-ahfx-medium]'))return;
    const read16=off=>ahfxMediumRead16(ctx,off),read8=off=>ctx.stage.datBytes[ctx.stateStart+off];
    const p=document.createElement('div');p.dataset.ahfxMedium='1';p.className='ahfx-verified-controls';
    const posOpts='<option value="0">Min</option><option value="25">25%</option><option value="50">50%</option><option value="75">75%</option><option value="100">Max</option>';
    p.innerHTML=`<div class="manager-head inline"><strong>480 Medium / Spaces verified controls</strong><span class="confidence verified">VERIFIED WRITE</span></div>
      ${[['ll','LL'],['el','EL'],['sl','SL']].map(([key,label])=>`<div class="peq-field"><span>${label} <small>unlabelled fader position</small></span><select data-k="${key}">${posOpts}</select><code>${ahfxMediumHex16(read16(AHFX_MEDIUM_POSITION_OFFSETS[key]))}</code></div>`).join('')}
      ${Object.entries(AHFX_MEDIUM_ECHO).map(([key,spec])=>`<div class="peq-field"><span>Echo ${key.slice(1)} (${spec.tap}) Time <small>continuous verified 0…200 ms</small></span><div><input data-k="${key}time" type="number" min="0" max="200" step="1"><b>ms</b></div><code>${ahfxMediumHex16(read16(spec.timeOff))}</code></div>
      <div class="peq-field"><span>Echo ${key.slice(1)} (${spec.tap}) Gain <small>continuous verified ${AHFX_MEDIUM_ECHO_FEEDBACK_MIN_DB}…${AHFX_MEDIUM_ECHO_FEEDBACK_MAX_DB} dB</small></span><div><input data-k="${key}fb" type="number" min="${AHFX_MEDIUM_ECHO_FEEDBACK_MIN_DB}" max="${AHFX_MEDIUM_ECHO_FEEDBACK_MAX_DB}" step="1"><b>dB</b></div><code>${ahfxMediumHex16(read16(spec.feedbackOff))}</code></div>
      <div class="peq-field"><span>Echo ${key.slice(1)} (${spec.tap}) On/Off</span><select data-k="${key}on">${[...AHFX_MEDIUM_ECHO_ON].map(([raw,label])=>`<option value="${raw}">${label}</option>`).join('')}</select><code>${hexByte(read8(spec.onOff))}</code></div>`).join('')}
      <div class="peq-field"><span>Damping HF type</span><select data-k="dampHfType">${[...AHFX_MEDIUM_DAMP_HF_TYPE].map(([raw,label])=>`<option value="${raw}">${escapeHtml(label)}</option>`).join('')}</select><code>${hexByte(read8(93))}</code></div>
      <div class="peq-field"><span>Output HF type</span><select data-k="outHfType">${[...AHFX_MEDIUM_OUT_HF_TYPE].map(([raw,label])=>`<option value="${raw}">${escapeHtml(label)}</option>`).join('')}</select><code>${hexByte(read8(83))}</code></div>
      ${AHFX_MEDIUM_LINEAR.map(([key,label,off,min,max,unit])=>`<div class="peq-field"><span>${label} <small>continuous verified ${min}…${max}${unit?' '+unit:''}</small></span><div><input data-k="${key}" type="number" min="${min}" max="${max}" step="1"><b>${unit}</b></div><code>${ahfxMediumHex16(read16(off))}</code></div>`).join('')}
      ${AHFX_MEDIUM_FREQ.map(([key,label,off,min,max])=>`<div class="peq-field"><span>${label} <small>continuous verified ${formatHz(min)}…${formatHz(max)}</small></span><div><input data-k="${key}" type="number" min="${min}" max="${max}" step="1"><b>Hz</b></div><code>${ahfxMediumHex16(read16(off))}</code></div>`).join('')}
      ${AHFX_MEDIUM_GAIN.map(([key,label,off,min,max])=>`<div class="peq-field"><span>${label} <small>continuous verified ${min}…${max} dB</small></span><div><input data-k="${key}" type="number" min="${min}" max="${max}" step="1"><b>dB</b></div><code>${ahfxMediumHex16(read16(off))}</code></div>`).join('')}
      <div class="peq-field"><span>Decay Time <small>continuous verified ${AHFX_MEDIUM_DECAY_MIN_S}…${AHFX_MEDIUM_DECAY_MAX_S} s</small></span><div><input data-k="decay" type="number" min="${AHFX_MEDIUM_DECAY_MIN_S}" max="${AHFX_MEDIUM_DECAY_MAX_S}" step="0.1"><b>s</b></div><code>${ahfxMediumHex16(read16(AHFX_MEDIUM_DECAY_OFF))}</code></div>
      <div class="console-note">LL, EL and SL are unnumbered console faders. Percentages here mean physical fader position only, not dB or another DSP unit. Echo 1–6 map to the Director Echoes page taps L1, R1, L2, R2, L3, R3.</div>`;
    card.appendChild(p);

    for(const key of ['ll','el','sl']){
      const sel=p.querySelector(`[data-k="${key}"]`),raw=read16(AHFX_MEDIUM_POSITION_OFFSETS[key]);ahfxMediumSetExact(sel,AHFX_MEDIUM_POSITION_TABLES[key],raw);
      sel.onchange=()=>{if(sel.value!==''&&ahfxMediumWritePosition(fx.slot,key,sel.value))renderFx();else if(sel.value!=='')toast(`RackUltra ${key.toUpperCase()} write blocked.`,true);};
    }
    for(const echo of Object.keys(AHFX_MEDIUM_ECHO)){
      const time=p.querySelector(`[data-k="${echo}time"]`),fb=p.querySelector(`[data-k="${echo}fb"]`),spec=AHFX_MEDIUM_ECHO[echo];
      const timeRaw=read16(spec.timeOff),timeMs=(timeRaw-0x8000)/16;if(timeRaw<0x8000||timeRaw>0x8C80){time.disabled=true;time.title='Current raw is outside the controlled 0–200 ms range.';}else time.value=String(timeMs);
      const fbRaw=read16(spec.feedbackOff),fbDb=(fbRaw-0x8000)/256;fb.value=String(Math.round(fbDb*100)/100);
      time.onchange=()=>{if(ahfxMediumWriteEchoTime(fx.slot,echo,time.value))renderFx();else toast(`RackUltra ${echo.toUpperCase()} time write blocked.`,true);};
      fb.onchange=()=>{if(ahfxMediumWriteEchoFeedback(fx.slot,echo,fb.value))renderFx();else toast(`RackUltra ${echo.toUpperCase()} gain write blocked.`,true);};
      const on=p.querySelector(`[data-k="${echo}on"]`),onRaw=read8(spec.onOff);
      if(AHFX_MEDIUM_ECHO_ON.has(onRaw))on.value=String(onRaw);else{const o=document.createElement('option');o.value='';o.textContent=`Current raw ${hexByte(onRaw)}`;o.selected=true;on.prepend(o);}
      on.onchange=()=>{if(on.value!==''&&ahfxMediumWriteEnum8(fx.slot,spec.onOff,AHFX_MEDIUM_ECHO_ON,on.value))renderFx();else if(on.value!=='')toast(`RackUltra ${echo.toUpperCase()} On/Off write blocked.`,true);};
    }
    for(const [key,,off,min,max] of AHFX_MEDIUM_LINEAR){
      const input=p.querySelector(`[data-k="${key}"]`),raw=read16(off),v=(raw-0x8000)/16;
      if(Number.isInteger(v)&&v>=min&&v<=max)input.value=String(v);else{input.disabled=true;input.title=`Current raw ${ahfxMediumHex16(raw)} is outside the controlled ${min}–${max} range.`;}
      input.onchange=()=>{if(ahfxMediumWriteLinear(fx.slot,key,input.value))renderFx();else toast(`RackUltra ${key} write blocked.`,true);};
    }
    for(const [key,,off,min,max] of AHFX_MEDIUM_FREQ){
      const input=p.querySelector(`[data-k="${key}"]`),raw=read16(off),hz=4*Math.pow(2,raw/4608);
      if(hz>=min*0.98&&hz<=max*1.02)input.value=String(Math.round(hz*100)/100);else{input.disabled=true;input.title=`Current raw ${ahfxMediumHex16(raw)} is outside the controlled ${formatHz(min)}–${formatHz(max)} range.`;}
      input.onchange=()=>{if(ahfxMediumWriteFreq(fx.slot,key,input.value))renderFx();else toast(`RackUltra ${key} write blocked.`,true);};
    }
    for(const [key,,off,min,max] of AHFX_MEDIUM_GAIN){
      const input=p.querySelector(`[data-k="${key}"]`),raw=read16(off),db=(raw-0x8000)/256;
      input.value=String(Math.round(db*100)/100);
      input.onchange=()=>{if(ahfxMediumWriteGainDb(fx.slot,key,input.value))renderFx();else toast(`RackUltra ${key} write blocked.`,true);};
    }
    {
      const input=p.querySelector('[data-k="decay"]'),raw=read16(AHFX_MEDIUM_DECAY_OFF),sec=Math.pow(10,(raw-17874)/5958)/1000;
      input.value=String(Math.round(sec*100)/100);
      input.onchange=()=>{if(ahfxMediumWriteDecay(fx.slot,input.value))renderFx();else toast('RackUltra decay write blocked.',true);};
    }
    for(const [key,off,map] of [['dampHfType',93,AHFX_MEDIUM_DAMP_HF_TYPE],['outHfType',83,AHFX_MEDIUM_OUT_HF_TYPE]]){
      const sel=p.querySelector(`[data-k="${key}"]`),raw=read8(off);if(map.has(raw))sel.value=String(raw);else{const o=document.createElement('option');o.value='';o.textContent=`Current raw ${hexByte(raw)}`;o.selected=true;sel.prepend(o);}
      sel.onchange=()=>{if(sel.value!==''&&ahfxMediumWriteEnum8(fx.slot,off,map,sel.value))renderFx();else if(sel.value!=='')toast(`RackUltra ${key} write blocked.`,true);};
    }
  });
}
const renderFxBeforeRackUltraMedium=renderFx;
renderFx=function(){renderFxBeforeRackUltraMedium();injectRackUltraMediumControls();};

if(typeof PARAMETER_MAP!=='undefined'){
  const rows=[
    ['ll-position','LL fader position','state +70..71','0/25/50/75/100% physical-position anchors'],
    ['el-position','EL fader position','state +68..69','0/25/50/75/100% physical-position anchors'],
    ['sl-position','SL fader position','state +94..95','0/25/50/75/100% physical-position anchors'],
    ['damp-hf-type','Damping HF type','state +93','10=6 dB;20=12 dB;30=Shelf'],
    ['out-hf-type','Output HF type','state +83','10=6 dB;20=12 dB;30=Shelf'],
  ];
  for(const [key,spec] of Object.entries(AHFX_MEDIUM_ECHO)){
    const n=key.slice(1);
    rows.push([`echo${n}-time`,`Echo ${n} (${spec.tap}) Time`,`state +${spec.timeOff}..${spec.timeOff+1}`,'raw=0x8000+16×milliseconds; verified 0…200 ms']);
    rows.push([`echo${n}-feedback`,`Echo ${n} (${spec.tap}) Gain`,`state +${spec.feedbackOff}..${spec.feedbackOff+1}`,`raw=0x8000+round(dB×256); verified ${AHFX_MEDIUM_ECHO_FEEDBACK_MIN_DB}…${AHFX_MEDIUM_ECHO_FEEDBACK_MAX_DB} dB`]);
    rows.push([`echo${n}-on`,`Echo ${n} (${spec.tap}) On/Off`,`state +${spec.onOff}`,'10=On;00=Off']);
  }
  for(const [key,label,off,min,max,unit] of AHFX_MEDIUM_LINEAR)rows.push([key,label,`state +${off}..${off+1}`,`raw=0x8000+16×value; verified ${min}…${max}${unit?' '+unit:''}`]);
  for(const [key,label,off,min,max] of AHFX_MEDIUM_FREQ)rows.push([key,label,`state +${off}..${off+1}`,`raw=floor(4608×log2(hz/4)); verified ${formatHz(min)}…${formatHz(max)}`]);
  for(const [key,label,off,min,max] of AHFX_MEDIUM_GAIN)rows.push([key,label,`state +${off}..${off+1}`,`raw=0x8000+round(dB×256); verified ${min}…${max} dB`]);
  rows.push(['decay','Decay Time',`state +${AHFX_MEDIUM_DECAY_OFF}..${AHFX_MEDIUM_DECAY_OFF+1}`,`raw=round(17874+5958×log10(ms)); verified ${AHFX_MEDIUM_DECAY_MIN_S}…${AHFX_MEDIUM_DECAY_MAX_S} s`]);
  const continuousIds=new Set([...AHFX_MEDIUM_LINEAR,...AHFX_MEDIUM_FREQ,...AHFX_MEDIUM_GAIN].map(x=>x[0]).concat('decay'));
  for(const [id,field,offset,transform] of rows)if(!PARAMETER_MAP.some(x=>x.id===`ahfx-spaces-medium-${id}`))PARAMETER_MAP.push({
    id:`ahfx-spaces-medium-${id}`,area:'RackUltra',record:'AHFX Manager NN',payload:'262-byte AHFX payload; engine 1c04',field,offset,datatype:'engine-specific controlled field',transform,confidence:'verified',write:true,
    evidence:continuousIds.has(id)?'ReverseEngineer7 Director-automated UFX1 sweeps (scenes 203–296); each adjacent pair changes only the target AHFX field outside the scene name.':id.startsWith('echo')?'ReverseEngineer6 Director-automated UFX1 sweeps (all six taps) plus ReverseEngineer2 Echo 1/2; adjacent pairs change only the target AHFX field outside the scene name.':'ReverseEngineer2 controlled UFX1 scenes; adjacent pairs change only the target AHFX field outside the scene-name byte.',notes:'Guarded to engine 1c04. Continuous fields reuse the canonical freq_log/offset_db/time_log coordinates already proven elsewhere in the format.'
  });
}

const rackUltraMediumNotice=$('#tabFx .notice');
if(rackUltraMediumNotice){
  rackUltraMediumNotice.className='notice safe';
  rackUltraMediumNotice.innerHTML='<strong>Partial verified write:</strong> RackUltra engines <code>1c03</code> and <code>1c04</code> now have guarded controlled fields. On <code>1c04</code>, Echo 1–6, Pre Delay, Decay, Size, Diffusion, Modulation, Direct Send, Spread, Colour and Output EQ controls, damping controls and LL/EL/SL position anchors are writable. Reflection model and the remaining unmapped DSP bytes stay read-only.';
}
