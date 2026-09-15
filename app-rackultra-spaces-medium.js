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

const AHFX_MEDIUM_ECHO={
  e1:{timeOff:96,feedbackOff:98,timeMin:0,timeMax:200,feedback:new Map([[-40,0x5800],[-20,0x6BFD],[-10,0x75FD],[0,0x8003],[10,0x8A00]])},
  e2:{timeOff:108,feedbackOff:110,timeMin:0,timeMax:200,feedback:new Map([[-40,0x5800],[-10,0x75FD],[10,0x8A00]])},
};
const AHFX_MEDIUM_DAMP_LF=new Map([[20,0x29CB],[50,0x4196],[100,0x5396],[200,0x6596],[500,0x7D62],[1000,0x8F63]]);
const AHFX_MEDIUM_DAMP_HF_TYPE=new Map([[0x10,'6 dB'],[0x20,'12 dB'],[0x30,'Shelf']]);
const AHFX_MEDIUM_DAMP_HF_FREQ=new Map([[40,0x3BCB],[100,0x5396],[200,0x6596],[500,0x7D62],[1000,0x8F62],[2000,0xA162],[5000,0xB92D],[10000,0xCB2D],[20000,0xDD2D]]);
const AHFX_MEDIUM_DAMP_HF_SHELF=new Map([[0,0x8000],[-6,0x79FD],[-12,0x73FD],[-15,0x7100]]);
const AHFX_MEDIUM_OUT_HF_TYPE=new Map([[0x10,'6 dB'],[0x20,'12 dB'],[0x30,'Shelf']]);
const AHFX_MEDIUM_OUT_HF_SHELF=new Map([[0,0x8000],[-6,0x7A00],[-12,0x7400],[-15,0x7100]]);

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
  const ctx=ahfxMediumCtx(slot),spec=AHFX_MEDIUM_ECHO[echo],raw=spec?.feedback.get(Number(db));
  if(!ctx||raw==null)return false;return ahfxMediumWrite16(ctx,spec.feedbackOff,raw);
}
function ahfxMediumWriteMapped16(slot,off,map,value){
  const ctx=ahfxMediumCtx(slot),raw=map.get(Number(value));if(!ctx||raw==null)return false;return ahfxMediumWrite16(ctx,off,raw);
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
    const feedbackOptions=(map)=>ahfxMediumOptions(map,v=>`${v>0?'+':''}${v} dB`);
    p.innerHTML=`<div class="manager-head inline"><strong>480 Medium / Spaces verified controls</strong><span class="confidence verified">VERIFIED WRITE</span></div>
      ${[['ll','LL'],['el','EL'],['sl','SL']].map(([key,label])=>`<div class="peq-field"><span>${label} <small>unlabelled fader position</small></span><select data-k="${key}">${posOpts}</select><code>${ahfxMediumHex16(read16(AHFX_MEDIUM_POSITION_OFFSETS[key]))}</code></div>`).join('')}
      <div class="peq-field"><span>Echo 1 Time <small>continuous verified 0…200 ms</small></span><div><input data-k="e1time" type="number" min="0" max="200" step="1" value="${(read16(96)-0x8000)/16}"><b>ms</b></div><code>${ahfxMediumHex16(read16(96))}</code></div>
      <div class="peq-field"><span>Echo 1 Feedback <small>exact controlled anchors</small></span><select data-k="e1fb">${feedbackOptions(AHFX_MEDIUM_ECHO.e1.feedback)}</select><code>${ahfxMediumHex16(read16(98))}</code></div>
      <div class="peq-field"><span>Echo 2 Time <small>continuous verified 0…200 ms</small></span><div><input data-k="e2time" type="number" min="0" max="200" step="1" value="${(read16(108)-0x8000)/16}"><b>ms</b></div><code>${ahfxMediumHex16(read16(108))}</code></div>
      <div class="peq-field"><span>Echo 2 Feedback <small>exact controlled anchors</small></span><select data-k="e2fb">${feedbackOptions(AHFX_MEDIUM_ECHO.e2.feedback)}</select><code>${ahfxMediumHex16(read16(110))}</code></div>
      <div class="peq-field"><span>Damping LF <small>exact frequency anchors</small></span><select data-k="dampLf">${ahfxMediumOptions(AHFX_MEDIUM_DAMP_LF,formatHz)}</select><code>${ahfxMediumHex16(read16(46))}</code></div>
      <div class="peq-field"><span>Damping HF type</span><select data-k="dampHfType">${[...AHFX_MEDIUM_DAMP_HF_TYPE].map(([raw,label])=>`<option value="${raw}">${escapeHtml(label)}</option>`).join('')}</select><code>${hexByte(read8(93))}</code></div>
      <div class="peq-field"><span>Damping HF frequency <small>exact anchors</small></span><select data-k="dampHfFreq">${ahfxMediumOptions(AHFX_MEDIUM_DAMP_HF_FREQ,formatHz)}</select><code>${ahfxMediumHex16(read16(64))}</code></div>
      <div class="peq-field"><span>Damping HF shelf gain <small>exact anchors</small></span><select data-k="dampHfShelf">${ahfxMediumOptions(AHFX_MEDIUM_DAMP_HF_SHELF,v=>`${v} dB`)}</select><code>${ahfxMediumHex16(read16(66))}</code></div>
      <div class="peq-field"><span>Output HF type</span><select data-k="outHfType">${[...AHFX_MEDIUM_OUT_HF_TYPE].map(([raw,label])=>`<option value="${raw}">${escapeHtml(label)}</option>`).join('')}</select><code>${hexByte(read8(83))}</code></div>
      <div class="peq-field"><span>Output HF shelf gain <small>exact anchors</small></span><select data-k="outHfShelf">${ahfxMediumOptions(AHFX_MEDIUM_OUT_HF_SHELF,v=>`${v} dB`)}</select><code>${ahfxMediumHex16(read16(86))}</code></div>
      <div class="console-note">LL, EL and SL are unnumbered console faders. Percentages here mean physical fader position only, not dB or another DSP unit. Echoes 3–6 remain unmapped until their controlled sweeps are available.</div>`;
    card.appendChild(p);

    for(const key of ['ll','el','sl']){
      const sel=p.querySelector(`[data-k="${key}"]`),raw=read16(AHFX_MEDIUM_POSITION_OFFSETS[key]);ahfxMediumSetExact(sel,AHFX_MEDIUM_POSITION_TABLES[key],raw);
      sel.onchange=()=>{if(sel.value!==''&&ahfxMediumWritePosition(fx.slot,key,sel.value))renderFx();else if(sel.value!=='')toast(`RackUltra ${key.toUpperCase()} write blocked.`,true);};
    }
    for(const echo of ['e1','e2']){
      const time=p.querySelector(`[data-k="${echo}time"]`),fb=p.querySelector(`[data-k="${echo}fb"]`),spec=AHFX_MEDIUM_ECHO[echo];
      const timeRaw=read16(spec.timeOff),timeMs=(timeRaw-0x8000)/16;if(timeRaw<0x8000||timeRaw>0x8C80){time.disabled=true;time.title='Current raw is outside the controlled 0–200 ms range.';}else time.value=String(timeMs);
      ahfxMediumSetExact(fb,spec.feedback,read16(spec.feedbackOff));
      time.onchange=()=>{if(ahfxMediumWriteEchoTime(fx.slot,echo,time.value))renderFx();else toast(`RackUltra ${echo.toUpperCase()} time write blocked.`,true);};
      fb.onchange=()=>{if(fb.value!==''&&ahfxMediumWriteEchoFeedback(fx.slot,echo,fb.value))renderFx();else if(fb.value!=='')toast(`RackUltra ${echo.toUpperCase()} feedback write blocked.`,true);};
    }
    const mapped=[
      ['dampLf',46,AHFX_MEDIUM_DAMP_LF],['dampHfFreq',64,AHFX_MEDIUM_DAMP_HF_FREQ],['dampHfShelf',66,AHFX_MEDIUM_DAMP_HF_SHELF],['outHfShelf',86,AHFX_MEDIUM_OUT_HF_SHELF]
    ];
    for(const [key,off,map] of mapped){const sel=p.querySelector(`[data-k="${key}"]`);ahfxMediumSetExact(sel,map,read16(off));sel.onchange=()=>{if(sel.value!==''&&ahfxMediumWriteMapped16(fx.slot,off,map,sel.value))renderFx();else if(sel.value!=='')toast(`RackUltra ${key} write blocked.`,true);};}
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
    ['echo1-time','Echo 1 Time','state +96..97','raw=0x8000+16×milliseconds; verified 0…200 ms'],
    ['echo1-feedback','Echo 1 Feedback','state +98..99','exact anchors −40,−20,−10,0,+10 dB'],
    ['echo2-time','Echo 2 Time','state +108..109','raw=0x8000+16×milliseconds; verified 0…200 ms'],
    ['echo2-feedback','Echo 2 Feedback','state +110..111','exact anchors −40,−10,+10 dB'],
    ['damp-lf','Damping LF frequency','state +46..47','20,50,100,200,500,1000 Hz exact anchors'],
    ['damp-hf-type','Damping HF type','state +93','10=6 dB;20=12 dB;30=Shelf'],
    ['damp-hf-frequency','Damping HF frequency','state +64..65','40 Hz through 20 kHz exact anchors'],
    ['damp-hf-shelf','Damping HF shelf gain','state +66..67','0,−6,−12,−15 dB exact anchors'],
    ['out-hf-type','Output HF type','state +83','10=6 dB;20=12 dB;30=Shelf'],
    ['out-hf-shelf','Output HF shelf gain','state +86..87','0,−6,−12,−15 dB exact anchors'],
  ];
  for(const [id,field,offset,transform] of rows)if(!PARAMETER_MAP.some(x=>x.id===`ahfx-spaces-medium-${id}`))PARAMETER_MAP.push({
    id:`ahfx-spaces-medium-${id}`,area:'RackUltra',record:'AHFX Manager NN',payload:'262-byte AHFX payload; engine 1c04',field,offset,datatype:'engine-specific controlled field',transform,confidence:'verified',write:true,
    evidence:'ReverseEngineer2 controlled UFX1 scenes; adjacent pairs change only the target AHFX field outside the scene-name byte.',notes:'Guarded to engine 1c04. Exact anchors/ranges only.'
  });
}

const rackUltraMediumNotice=$('#tabFx .notice');
if(rackUltraMediumNotice){
  rackUltraMediumNotice.className='notice safe';
  rackUltraMediumNotice.innerHTML='<strong>Partial verified write:</strong> RackUltra engines <code>1c03</code> and <code>1c04</code> now have guarded controlled fields. On <code>1c04</code>, Echo 1/2 time and feedback, damping/output HF controls, Damping LF and LL/EL/SL position anchors are writable. Echoes 3–6 and unmapped DSP bytes remain read-only.';
}
