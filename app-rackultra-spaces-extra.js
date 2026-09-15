'use strict';

// ReverseEngineer batch 4: additional verified UFX1 480 Large / Spaces fields.
// Guarded to AHFX engine 1c03 and the observed 262-byte payload.
const AHFX_SPACES_EXTRA={
  mode:{off:29,kind:'enum',options:[[0x10,'Large Hall'],[0x20,'Medium Hall'],[0x30,'Small Hall'],[0x40,'Room'],[0x60,'Classic Large'],[0x50,'Classic Medium'],[0x70,'Classic Small'],[0x80,'Classic Room']]},
  ds:{off:42,kind:'linear',min:0,max:100},
  width:{off:60,kind:'linear',min:1,max:30},
  length:{off:62,kind:'linear',min:1,max:35},
  el:{off:68,kind:'anchors',options:[[0x6C00,'Low'],[0x7646,'Mid'],[0x8000,'High']]},
  ll:{off:70,kind:'anchors',options:[[0x6C00,'Low'],[0x767E,'Medium'],[0x8000,'High']]},
  lowCut:{off:76,kind:'freq',options:[[20,0x29CB],[500,0x7D62],[1000,0x8F63]]},
  highCut:{off:78,kind:'freq',options:[[1000,0x8F63],[10000,0xCB2D],[20000,0xDD2E]]},
  sl:{off:94,kind:'anchors',options:[[0x6C00,'Low'],[0x7B69,'Mid'],[0x8A00,'High']]},
  spread:{off:122,kind:'linear',min:0,max:100},
  echo:{off:125,kind:'toggle'},
  echo1:{off:127,kind:'toggle'},
  echo2:{off:133,kind:'toggle'},
  sizeLink:{off:147,kind:'toggle'},
};
function ahfxExtraHex16(v){return `${hexByte(v>>8)} ${hexByte(v&255)}`;}
function ahfxExtraGet(slot){
  const stage=state.current?.stage,fx=stage?.ahfx?.find(x=>x.slot===Number(slot));
  if(!stage||!fx||fx.engineId!==AHFX_SPACES_LARGE_ENGINE||fx.payloadLength!==262)return null;
  const s=ahfxStateStart(fx),read16=off=>ahfxReadU16(stage.datBytes,s+off),read8=off=>stage.datBytes[s+off];
  const values={};
  for(const [key,spec] of Object.entries(AHFX_SPACES_EXTRA)){
    const raw=spec.kind==='enum'||spec.kind==='toggle'?read8(spec.off):read16(spec.off);
    values[key]={raw,value:spec.kind==='linear'?(raw-0x8000)/16:null};
  }
  return {stage,fx,stateStart:s,values};
}
function ahfxExtraWrite(slot,key,value){
  const ctx=ahfxExtraGet(slot),spec=AHFX_SPACES_EXTRA[key];if(!ctx||!spec)return false;
  let raw;
  if(spec.kind==='linear'){
    let v=Number(value);if(!Number.isFinite(v))return false;v=Math.max(spec.min,Math.min(spec.max,Math.round(v)));raw=0x8000+v*16;
    writeU16BE(ctx.stage.datBytes,ctx.stateStart+spec.off,raw);
  }else if(spec.kind==='freq'){
    raw=new Map(spec.options).get(Number(value));if(raw==null)return false;writeU16BE(ctx.stage.datBytes,ctx.stateStart+spec.off,raw);
  }else if(spec.kind==='anchors'){
    raw=Number(value);if(!new Map(spec.options).has(raw))return false;writeU16BE(ctx.stage.datBytes,ctx.stateStart+spec.off,raw);
  }else if(spec.kind==='enum'){
    raw=Number(value);if(!new Map(spec.options).has(raw))return false;ctx.stage.datBytes[ctx.stateStart+spec.off]=raw;
  }else if(spec.kind==='toggle'){
    raw=value===true||value===1||value==='1'?0x10:value===false||value===0||value==='0'?0x00:null;if(raw==null)return false;ctx.stage.datBytes[ctx.stateStart+spec.off]=raw;
  }else return false;
  markStageDirty();ahfxRefresh();return true;
}
function ahfxExtraSelectOptions(key){
  const spec=AHFX_SPACES_EXTRA[key];
  if(spec.kind==='freq')return spec.options.map(([value])=>`<option value="${value}">${formatHz(value)}</option>`).join('');
  return spec.options.map(([value,label])=>`<option value="${value}">${escapeHtml(label)}</option>`).join('');
}
function ahfxExtraSetCurrent(select,key,raw){
  const spec=AHFX_SPACES_EXTRA[key];
  let value=null;
  if(spec.kind==='freq')value=spec.options.find(([,r])=>r===raw)?.[0]??null;
  else value=spec.options?.find(([v])=>v===raw)?.[0]??null;
  if(value!=null)select.value=String(value);
  else{const o=document.createElement('option');o.value='';o.textContent=`Current raw ${raw>255?ahfxExtraHex16(raw):hexByte(raw)}`;o.selected=true;select.prepend(o);}
}
function ahfxExtraToggle(raw){
  const s=document.createElement('select');s.innerHTML='<option value="1">On / In</option><option value="0">Off / Out</option>';
  if(raw===0x10)s.value='1';else if(raw===0x00)s.value='0';else{const o=document.createElement('option');o.value='';o.textContent=`Current raw ${hexByte(raw)}`;o.selected=true;s.prepend(o);}
  return s;
}
function injectRackUltraBatch4Controls(){
  const root=$('#ahfxManagers'),stage=state.current?.stage;if(!root||!stage?.ahfx)return;
  const cards=[...root.querySelectorAll('.fx-card')];
  stage.ahfx.forEach((fx,index)=>{
    const ctx=ahfxExtraGet(fx.slot),card=cards[index];if(!ctx||!card||card.querySelector('[data-ahfx-batch4]'))return;
    const v=ctx.values,p=document.createElement('div');p.dataset.ahfxBatch4='1';p.className='ahfx-verified-controls';
    p.innerHTML=`<div class="manager-head inline"><strong>480 Large additional verified controls</strong><span class="confidence verified">BATCH 4</span></div>
      <div class="peq-field"><span>Space model <small>exact enum</small></span><select data-k="mode">${ahfxExtraSelectOptions('mode')}</select><code>${hexByte(v.mode.raw)}</code></div>
      <div class="peq-field"><span>Low Cut <small>exact anchors</small></span><select data-k="lowCut">${ahfxExtraSelectOptions('lowCut')}</select><code>${ahfxExtraHex16(v.lowCut.raw)}</code></div>
      <div class="peq-field"><span>High Cut <small>exact anchors</small></span><select data-k="highCut">${ahfxExtraSelectOptions('highCut')}</select><code>${ahfxExtraHex16(v.highCut.raw)}</code></div>
      <div class="peq-field"><span>Size Link</span><span data-k="sizeLink"></span><code>${hexByte(v.sizeLink.raw)}</code></div>
      ${[['width','Width'],['length','Length'],['ds','DS'],['spread','Spread']].map(([k,label])=>{const s=AHFX_SPACES_EXTRA[k];return `<div class="peq-field"><span>${label} <small>linear ${s.min}…${s.max}</small></span><input data-k="${k}" type="number" min="${s.min}" max="${s.max}" step="1" value="${Number(v[k].value.toFixed(3))}"><code>${ahfxExtraHex16(v[k].raw)}</code></div>`;}).join('')}
      ${[['el','EL'],['ll','LL'],['sl','SL']].map(([k,label])=>`<div class="peq-field"><span>${label} <small>exact Low/Mid/High anchors</small></span><select data-k="${k}">${ahfxExtraSelectOptions(k)}</select><code>${ahfxExtraHex16(v[k].raw)}</code></div>`).join('')}
      <div class="peq-field"><span>Echo section</span><span data-k="echo"></span><code>${hexByte(v.echo.raw)}</code></div>
      <div class="peq-field"><span>Echo 1</span><span data-k="echo1"></span><code>${hexByte(v.echo1.raw)}</code></div>
      <div class="peq-field"><span>Echo 2</span><span data-k="echo2"></span><code>${hexByte(v.echo2.raw)}</code></div>
      <div class="console-note">DS, EL, LL and SL retain the scene abbreviations because their binary fields are proven but the full UI label semantics are not.</div>`;
    card.appendChild(p);
    for(const k of ['mode','lowCut','highCut','el','ll','sl']){const s=p.querySelector(`[data-k="${k}"]`);ahfxExtraSetCurrent(s,k,v[k].raw);s.onchange=()=>{if(s.value!==''&&ahfxExtraWrite(fx.slot,k,s.value))renderFx();else if(s.value!=='')toast(`RackUltra ${k} write blocked.`,true);};}
    for(const k of ['width','length','ds','spread']){const i=p.querySelector(`[data-k="${k}"]`);i.onchange=()=>{if(ahfxExtraWrite(fx.slot,k,i.value))renderFx();else toast(`RackUltra ${k} write blocked.`,true);};}
    for(const k of ['sizeLink','echo','echo1','echo2']){const host=p.querySelector(`[data-k="${k}"]`),s=ahfxExtraToggle(v[k].raw);host.appendChild(s);s.onchange=()=>{if(s.value!==''&&ahfxExtraWrite(fx.slot,k,s.value))renderFx();else if(s.value!=='')toast(`RackUltra ${k} write blocked.`,true);};}
  });
}
const renderFxBeforeRackUltraBatch4=renderFx;
renderFx=function(){renderFxBeforeRackUltraBatch4();injectRackUltraBatch4Controls();};

if(typeof PARAMETER_MAP!=='undefined'){
  const rows=[
    ['mode','Space/model selector','state +29','10 Large Hall;20 Medium Hall;30 Small Hall;40 Room;60 Classic Large;50 Classic Medium;70 Classic Small;80 Classic Room'],
    ['ds','DS','state +42..43','raw=0x8000+16×value; 0…100'],
    ['width','Width','state +60..61','raw=0x8000+16×value; 1…30'],
    ['length','Length','state +62..63','raw=0x8000+16×value; 1…35'],
    ['el','EL','state +68..69','Low=6C00;Mid=7646;High=8000'],
    ['ll','LL','state +70..71','Low=6C00;Medium=767E;High=8000'],
    ['lowCut','Low Cut','state +76..77','20Hz=29CB;500Hz=7D62;1k=8F63'],
    ['highCut','High Cut','state +78..79','1k=8F63;10k=CB2D;20k=DD2E'],
    ['sl','SL','state +94..95','Low=6C00;Mid=7B69;High=8A00'],
    ['spread','Spread','state +122..123','raw=0x8000+16×value; 0…100'],
    ['echo','Echo section In/Out','state +125','10=In;00=Out'],
    ['echo1','Echo 1 On/Off','state +127','10=On;00=Off'],
    ['echo2','Echo 2 On/Off','state +133','10=On;00=Off'],
    ['sizeLink','Size Link','state +147','10=On;00=Off'],
  ];
  for(const [id,field,offset,transform] of rows)if(!PARAMETER_MAP.some(x=>x.id===`ahfx-spaces-large-${id}`))PARAMETER_MAP.push({
    id:`ahfx-spaces-large-${id}`,area:'RackUltra',record:'AHFX Manager NN',payload:'262-byte AHFX payload; engine 1c03',
    field,offset,datatype:'engine-specific controlled field',transform,confidence:'verified',write:true,
    evidence:'ReverseEngineer batch 4 controlled UFX1 scenes; adjacent pairs change only this AHFX field outside the scene label.',
    notes:'Guarded to engine 1c03. Exact anchors/ranges only.'
  });
}
const rackUltraBatch4Notice=$('#tabFx .notice');
if(rackUltraBatch4Notice){
  rackUltraBatch4Notice.className='notice safe';
  rackUltraBatch4Notice.innerHTML='<strong>Partial verified write:</strong> engine <code>1c03</code> (480 Large / Spaces) now has guarded Pre Delay, Decay, Cut filters, model/mode, Size Link, Width/Length, DS, Spread, EL/LL/SL anchors and Echo writers. Other RackUltra engines and unmapped DSP bytes remain read-only.';
}
if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='rackultra');
  if(sec&&!sec.html.includes('480 Large batch 4'))sec.html+=`<h2>480 Large batch 4</h2><pre><code>Mode/model        state +29
DS                state +42..43
Width             state +60..61
Length            state +62..63
EL                state +68..69
LL                state +70..71
Low Cut           state +76..77
High Cut          state +78..79
SL                state +94..95
Spread            state +122..123
Echo In/Out       state +125
Echo 1 On/Off     state +127
Echo 2 On/Off     state +133
Size Link         state +147</code></pre><p>Width, Length, DS and Spread use <code>raw = 0x8000 + 16 × value</code> over their controlled ranges. Cut frequencies use exact scene-proven words. EL/LL/SL remain exact Low/Mid/High tables until their full UI semantics are independently established.</p>`;
}
