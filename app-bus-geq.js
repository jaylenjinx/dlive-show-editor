'use strict';

// Bus graphic EQ ("NEQ" tab in Director): `Graphic EQ, {Mono|Stereo} {Group|Aux|Matrix} Channel NN [Left|Right]`,
// 169-byte state. Decoded from controlled Director 2.12 changes on Mono Aux 1 (2026-11-01, scenes 281–297):
//   +0        discriminator 03
//   +1..56    28 graphic band gains, uint16 BE, raw = 0x8000 + dB×256 (31 Hz … 16 kHz, ±12 dB)
//   +57       In/Out (00 In, 01 Out)
//   +58       type: 00 Constant-Q, 01 Proportional-Q, 02 Digi-GEQ, 03 Hybrid, 04 NEQ12
//   +59…      NEQ12: 12 bands × 9 bytes [gain int16 dB×256][freq u16 freq_log][width u8][3 unmapped][band Out u8]
// Switching type to NEQ12 in Director zeroes the 28 graphic gains; the editor leaves them as they are.
const GEQ_BANDS=['31','40','50','63','80','100','125','160','200','250','315','400','500','630','800','1k','1k25','1k6','2k','2k5','3k15','4k','5k','6k3','8k','10k','12k5','16k'];
const GEQ_TYPES=new Map([[0,'Constant-Q'],[1,'Proportional-Q'],[2,'Digi-GEQ'],[3,'Hybrid'],[4,'NEQ12']]);
const GEQ_STATE_LENGTH=169,GEQ_GAIN_MIN_DB=-12,GEQ_GAIN_MAX_DB=12,NEQ12_BASE=59,NEQ12_STRIDE=9;

function busGeqRecords(bus){
  const dat=state.current?.stage?.datBytes;if(!dat||!bus)return [];
  const k=bus.kind,sides=bus.stereo?['Left','Right']:[null];
  return sides.map(s=>busFindRecord(dat,busLabel('Graphic EQ',k.mono,k.stereo,bus.n,s))).filter(r=>r&&r.stateLength===GEQ_STATE_LENGTH&&dat[r.stateStart]===0x03);
}
function busGeqView(bus){
  const recs=busGeqRecords(bus);if(!recs.length||recs.length!==(bus.stereo?2:1))return null;
  const dat=state.current.stage.datBytes,s=recs[0].stateStart;
  const gains=GEQ_BANDS.map((_,i)=>(readU16BE(dat,s+1+i*2)-0x8000)/256);
  const neq=Array.from({length:12},(_,i)=>{const o=s+NEQ12_BASE+i*NEQ12_STRIDE;return {gainDb:readI16BE(dat,o)/256,freqHz:4*Math.pow(2,readU16BE(dat,o+2)/4608),width:dat[o+4],active:dat[o+8]===0};});
  return {active:dat[s+57]===0,type:dat[s+58],gains,neq};
}
function busGeqWrite(bus,fn){const recs=busGeqRecords(bus);if(!recs.length)return false;const d=state.current.stage.datBytes;for(const r of recs)fn(d,r.stateStart);markStageDirty();return true;}
function setBusGeqGain(bus,band,db){
  const b=Number(band),v=Number(db);if(!(b>=1&&b<=28)||!Number.isFinite(v))return false;
  const raw=0x8000+Math.round(Math.max(GEQ_GAIN_MIN_DB,Math.min(GEQ_GAIN_MAX_DB,v))*256);
  return busGeqWrite(bus,(d,s)=>writeU16BE(d,s+1+(b-1)*2,raw));
}
function setBusGeqActive(bus,on){return busGeqWrite(bus,(d,s)=>{d[s+57]=on?0:1;});}
function setBusGeqType(bus,type){const t=Number(type);if(!GEQ_TYPES.has(t))return false;return busGeqWrite(bus,(d,s)=>{d[s+58]=t;});}
function setBusNeq12Band(bus,band,field,value){
  const b=Number(band);if(!(b>=1&&b<=12))return false;const off=NEQ12_BASE+(b-1)*NEQ12_STRIDE;
  if(field==='gain'){const v=Number(value);if(!Number.isFinite(v))return false;const raw=Math.round(Math.max(-15,Math.min(15,v))*256);return busGeqWrite(bus,(d,s)=>writeI16BE(d,s+off,raw));}
  if(field==='freq'){const hz=Number(value);if(!(hz>=20&&hz<=20000))return false;const raw=Math.floor(4608*Math.log2(hz/4));return busGeqWrite(bus,(d,s)=>writeU16BE(d,s+off+2,raw));}
  if(field==='active')return busGeqWrite(bus,(d,s)=>{d[s+off+8]=value?0:1;});
  return false;
}

function renderBusGeq(){
  const root=$('#busEditor');if(!root)return;
  const sel=root.querySelector('.peq-channel-select');const bus=sel&&busById(sel.value);
  root.querySelector('#busGeqPanel')?.remove();
  if(!bus)return;
  const v=busGeqView(bus);
  const panel=document.createElement('section');panel.className='panel';panel.id='busGeqPanel';
  if(!v){panel.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} graphic EQ</h2></div><div class="notice warn">Graphic EQ record not found or not the expected 169-byte shape.</div>`;root.querySelector('.details-stack')?.appendChild(panel);return;}
  const redraw=ok=>{if(ok)renderBusGeq();else toast('Graphic EQ write blocked.',true);};
  const isNeq=v.type===4;
  panel.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} graphic EQ</h2><span class="confidence verified">VERIFIED WRITE</span></div>
    ${busField('GEQ','',`<select data-k="in"><option value="1">In</option><option value="0">Out</option></select>`)}
    ${busField('Type','',`<select data-k="type">${[...GEQ_TYPES].map(([r,l])=>`<option value="${r}">${l}</option>`).join('')}</select>`)}
    ${isNeq?v.neq.map((b,i)=>busField(`Band ${i+1}`,'width byte read only',`<select data-k="na${i}"><option value="1">In</option><option value="0">Out</option></select> <input data-k="nf${i}" type="number" min="20" max="20000" step="1" style="width:6em"><b>Hz</b> <input data-k="ng${i}" type="number" min="-15" max="15" step="0.1" style="width:5em"><b>dB</b>`)).join('')
      :`<div class="geq-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">${GEQ_BANDS.map((n,i)=>`<label style="display:flex;flex-direction:column;font-size:11px">${n}<input data-k="g${i}" type="number" min="-12" max="12" step="0.5"></label>`).join('')}</div>`}`;
  root.querySelector('.details-stack')?.appendChild(panel);
  const q=k=>panel.querySelector(`[data-k="${k}"]`);
  q('in').value=v.active?'1':'0';q('in').onchange=()=>redraw(setBusGeqActive(bus,q('in').value==='1'));
  q('type').value=String(v.type);q('type').onchange=()=>redraw(setBusGeqType(bus,q('type').value));
  if(isNeq)v.neq.forEach((b,i)=>{
    q(`na${i}`).value=b.active?'1':'0';q(`nf${i}`).value=String(Math.round(b.freqHz));q(`ng${i}`).value=b.gainDb.toFixed(1);
    q(`na${i}`).onchange=()=>redraw(setBusNeq12Band(bus,i+1,'active',q(`na${i}`).value==='1'));
    q(`nf${i}`).onchange=()=>redraw(setBusNeq12Band(bus,i+1,'freq',q(`nf${i}`).value));
    q(`ng${i}`).onchange=()=>redraw(setBusNeq12Band(bus,i+1,'gain',q(`ng${i}`).value));
  });
  else v.gains.forEach((g,i)=>{q(`g${i}`).value=g.toFixed(1);q(`g${i}`).onchange=()=>redraw(setBusGeqGain(bus,i+1,q(`g${i}`).value));});
}
const renderBusesBeforeGeq=renderBuses;
renderBuses=function(){
  renderBusesBeforeGeq();renderBusGeq();
  const sel=$('#busEditor .peq-channel-select');if(sel)sel.addEventListener('change',()=>renderBusGeq());
};

if(typeof PARAMETER_MAP!=='undefined'){
  const rows=[
    ['bus-geq-gain','Graphic EQ band gain (28 bands)','state +1+2×(band−1), uint16','dB = (raw − 0x8000)/256, ±12 dB'],
    ['bus-geq-inout','Graphic EQ In/Out','state +57','00 In, 01 Out'],
    ['bus-geq-type','Graphic EQ type','state +58','00 Constant-Q, 01 Proportional-Q, 02 Digi-GEQ, 03 Hybrid, 04 NEQ12'],
    ['bus-neq12-band','NEQ12 band gain/frequency/Out','state +59+9×(band−1): gain int16, freq u16, width u8, …, Out u8 (+8)','gain dB×256; freq_log; 00 In / 01 Out']
  ];
  for(const [id,field,offset,transform] of rows)if(!PARAMETER_MAP.some(x=>x.id===id))PARAMETER_MAP.push({id,area:'Bus processing',record:'Graphic EQ, {Mono|Stereo} {Group|Aux|Matrix|Main} Channel NN [Left|Right]',payload:'169-byte state',field,offset,datatype:'per-field',transform,confidence:'verified',write:true,evidence:'Controlled Director changes on Mono Aux 1 NEQ (fader drags, type menu, In button, NEQ12 band fields).',notes:'Stereo buses write both records. NEQ12 width byte and three per-band bytes are unmapped.'});
}
