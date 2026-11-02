'use strict';

// Input source patching and output socket patching, both held in the StageBox scene's
// "Channel Mapper" record (10,380-byte state). Decoded from controlled Director 2.12 changes
// (DM48 MixRack, S5000 surface): Processing › Preamp › Source Select for inputs, and the
// I/O › Outputs patch grid for outputs. See docs/patching.md.
//
// Inputs: 128 entries of 13 bytes starting at state +1:
//   [ABCD enable] [A type, A index u16] [B …] [C …] [D …]
// Outputs: one 3-byte [source type, source index u16] entry per output socket, in per-bank tables.
const CM_LABEL='Channel Mapper';
const CM_INPUT_BASE=1,CM_INPUT_STRIDE=13,CM_INPUT_COUNT=128;
const CM_UNASSIGNED=0x14;

// Input source types (A source). Index is zero-based within the type.
const CM_INPUT_SOURCE_TYPES=new Map([
  [0x00,'MixRack Sockets'],
  [0x01,'Surface (Local / DX 5/6 / I/O 4 / I/O 5 / USB)'],
  [0x02,'MixRack I/O Port 1'],
  [0x03,'MixRack I/O Port 2'],
  [0x04,'MixRack I/O Port 3'],
  [0x05,'MixRack DX 1/2'],
  [0x06,'MixRack DX 3/4'],
  [0x1C,'Rack FX'],
  [0x14,'Unassigned']
]);
// Surface sources share type 0x01; on an S5000 the index ranges start at these values.
const CM_SURFACE_INDEX_BASES=[[0,'Surface Sockets'],[12,'Surface DX 5/6'],[44,'Surface I/O Port 4'],[172,'Surface I/O Port 5'],[300,'USB']];

// Output source types. Stereo sources use index = 2×(n−1) + side (0 = Left, 1 = Right).
// Mono Group 0x0C comes from shows that use it (Stereo Groups 1–2 L/R then 0C 00/01 on consecutive sockets).
const CM_OUTPUT_SOURCE_TYPES=new Map([
  [0x00,{label:'MixRack socket (tie)',stereo:false}],
  [0x07,{label:'Input direct out',stereo:false}],
  [0x0C,{label:'Mono Group',stereo:false}],
  [0x0D,{label:'Stereo Group',stereo:true}],
  [0x0E,{label:'Mono Aux',stereo:false}],
  [0x0F,{label:'Stereo Aux',stereo:true}],
  [0x10,{label:'Main (LR, C, LFE, sL, sR order)',stereo:false}],
  [0x11,{label:'Mono Matrix',stereo:false}],
  [0x12,{label:'Stereo Matrix',stereo:true}],
  [0x13,{label:'PAFL (stereo)',stereo:true}],
  [0x14,{label:'Unassigned',stereo:false}],
  [0x1C,{label:'Rack FX output',stereo:false}],
  [0x1E,{label:'Wedge monitor',stereo:false}],
  [0x21,{label:'IEM monitor',stereo:true}],
  [0x2D,{label:'UltraFX output (2 per unit)',stereo:false}]
]);
// Output tables: state offset of output 1 for each bank (each entry 3 bytes).
// Every bank uses the same 3-byte [type][index] entries. Located with one controlled MON 1 patch per bank
// (DM48 MixRack + S5000 surface); the tables tile contiguously, which fixes their sizes.
const CM_OUTPUT_BANKS=[
  {key:'mrLocal',label:'MixRack Local',base:6632,count:32,verified:true},
  {key:'mrIo1',label:'MixRack I/O Port 1',base:6923,count:128,verified:true},
  {key:'mrIo2',label:'MixRack I/O Port 2',base:7307,count:128,verified:true},
  {key:'mrIo3',label:'MixRack I/O Port 3',base:7691,count:128,verified:true},
  {key:'mrDx12',label:'MixRack DX 1/2',base:8075,count:32,verified:true},
  {key:'mrDx34',label:'MixRack DX 3/4',base:8171,count:32,verified:true},
  {key:'mrMe',label:'MixRack ME',base:8267,count:40,verified:true},
  {key:'sfLocal',label:'Surface Local',base:3332,count:16,verified:true},
  {key:'sfDx56',label:'Surface DX 5/6',base:3380,count:32,verified:true},
  {key:'sfIo4',label:'Surface I/O Port 4',base:3476,count:128,verified:true},
  {key:'sfIo5',label:'Surface I/O Port 5',base:3860,count:128,verified:true},
  {key:'sfUsb',label:'Surface USB',base:4244,count:2,verified:true}
];

function cmRecord(){
  const dat=state.current?.stage?.datBytes;if(!dat)return null;
  const r=ipParseRecord(dat,CM_LABEL,null);if(!r||r.stateLength<8300)return null;
  return {...r,dat};
}
function cmInputSource(ch){
  const r=cmRecord();if(!r||ch<1||ch>CM_INPUT_COUNT)return null;
  const o=r.stateStart+CM_INPUT_BASE+(ch-1)*CM_INPUT_STRIDE;
  return {channel:ch,offset:o,abcd:r.dat[o]===1,type:r.dat[o+1],index:readU16BE(r.dat,o+2)};
}
function cmSurfaceLabel(index){
  let best=CM_SURFACE_INDEX_BASES[0];for(const b of CM_SURFACE_INDEX_BASES)if(index>=b[0])best=b;
  return `${best[1]} ${index-best[0]+1}`;
}
function cmInputSourceLabel(src){
  if(!src)return '—';
  if(src.type===CM_UNASSIGNED)return 'Unassigned';
  if(src.type===0x01)return cmSurfaceLabel(src.index);
  const t=CM_INPUT_SOURCE_TYPES.get(src.type);
  return t?`${t} ${src.index+1}`:`Type 0x${hexByte(src.type)} #${src.index}`;
}
// Write source A for an input. socket is 1-based within the type (raw surface index+1 for 0x01).
function setInputSource(ch,type,socket){
  const src=cmInputSource(ch);if(!src)return false;
  type=Number(type);if(!CM_INPUT_SOURCE_TYPES.has(type))return false;
  let idx=type===CM_UNASSIGNED?0:Number(socket)-1;if(!Number.isInteger(idx)||idx<0||idx>0x0FFF)return false;
  const d=state.current.stage.datBytes;d[src.offset+1]=type;writeU16BE(d,src.offset+2,idx);markStageDirty();return true;
}

function cmOutput(bankKey,socket){
  const r=cmRecord(),b=CM_OUTPUT_BANKS.find(x=>x.key===bankKey);if(!r||!b||socket<1||socket>b.count)return null;
  const o=r.stateStart+b.base+(socket-1)*3;
  return {bank:b,socket,offset:o,type:r.dat[o],index:readU16BE(r.dat,o+1)};
}
function cmOutputSourceLabel(out){
  if(!out)return '—';
  const t=CM_OUTPUT_SOURCE_TYPES.get(out.type);if(!t)return `Type 0x${hexByte(out.type)} #${out.index}`;
  if(out.type===CM_UNASSIGNED)return 'Unassigned';
  if(out.type===0x10)return `Main ${['L','R','C','LFE','sL','sR'][out.index]??out.index+1}`;
  if(t.stereo)return `${t.label} ${(out.index>>1)+1} ${out.index&1?'R':'L'}`;
  return `${t.label} ${out.index+1}`;
}
// Patch an output socket. For stereo source types pass side 'L' or 'R'; n is the 1-based source number.
function setOutputPatch(bankKey,socket,type,n,side){
  const out=cmOutput(bankKey,Number(socket));if(!out||!out.bank.verified)return false;
  type=Number(type);const t=CM_OUTPUT_SOURCE_TYPES.get(type);if(!t)return false;
  let idx=0;
  if(type!==CM_UNASSIGNED){
    n=Number(n);if(!Number.isInteger(n)||n<1)return false;
    idx=t.stereo?2*(n-1)+(side==='R'?1:0):n-1;
  }
  const d=state.current.stage.datBytes;d[out.offset]=type;writeU16BE(d,out.offset+1,idx);markStageDirty();return true;
}

// ---- Inserts ----
// Insert A/B return sources: 128-entry tables of [type][index u16] (same types as input sources;
// Rack FX return index = 2×(unit−1) + side). Insert sends are written into the destination's
// table as type 08 (Insert A send) / 09 (Insert B send) with index = input − 1: an output socket
// for socket inserts, or both inputs of a Rack FX unit (table at +6731, L/R per unit, normally
// fed by FX sends, type 1D). `Insert N, Input Channel NN` +1 is 00 when assigned, 01 when not.
const CM_INSERT_RETURN_BASE={A:2564,B:2948};
const CM_INSERT_SEND_TYPE={A:0x08,B:0x09};
const CM_RACKFX_INPUT_BASE=6731,CM_RACKFX_UNITS=16;
function cmInsertState(ch,slot){
  const r=cmRecord();if(!r||!CM_INSERT_RETURN_BASE[slot]||ch<1||ch>CM_INPUT_COUNT)return null;
  const o=r.stateStart+CM_INSERT_RETURN_BASE[slot]+(ch-1)*3;
  return {returnOffset:o,returnType:r.dat[o],returnIndex:readU16BE(r.dat,o+1)};
}
function cmInsertSendSlots(){
  const r=cmRecord();if(!r)return [];
  const out=[];for(let s=1;s<=CM_OUTPUT_BANKS[0].count;s++)out.push(r.stateStart+CM_OUTPUT_BANKS[0].base+(s-1)*3);
  for(let u=0;u<CM_RACKFX_UNITS*2;u++)out.push(r.stateStart+CM_RACKFX_INPUT_BASE+u*3);
  return out;
}
// target: null (unassign), {kind:'socket',send:n,ret:m} (MixRack output n / input socket m) or {kind:'rackfx',unit:u}
function setInputInsert(ch,slot,target){
  const st=cmInsertState(ch,slot);if(!st)return false;
  const d=state.current.stage.datBytes,ty=CM_INSERT_SEND_TYPE[slot];
  const ins=ipParseRecord(d,`Insert ${slot==='A'?1:2}, Input Channel ${String(ch).padStart(2,'0')}`,3);if(!ins)return false;
  if(target&&target.kind==='socket'&&!(target.send>=1&&target.send<=CM_OUTPUT_BANKS[0].count&&target.ret>=1&&target.ret<=128))return false;
  if(target&&target.kind==='rackfx'&&!(target.unit>=1&&target.unit<=CM_RACKFX_UNITS))return false;
  if(target&&!['socket','rackfx'].includes(target.kind))return false;
  // drop any existing send of this insert
  for(const o of cmInsertSendSlots())if(d[o]===ty&&readU16BE(d,o+1)===ch-1){d[o]=CM_UNASSIGNED;writeU16BE(d,o+1,0);}
  if(!target){d[st.returnOffset]=CM_UNASSIGNED;writeU16BE(d,st.returnOffset+1,0);d[ins.stateStart+1]=1;markStageDirty();return true;}
  const r=cmRecord();
  if(target.kind==='socket'){
    const so=r.stateStart+CM_OUTPUT_BANKS[0].base+(target.send-1)*3;d[so]=ty;writeU16BE(d,so+1,ch-1);
    d[st.returnOffset]=0x00;writeU16BE(d,st.returnOffset+1,target.ret-1);
  }else{
    for(const side of [0,1]){const so=r.stateStart+CM_RACKFX_INPUT_BASE+((target.unit-1)*2+side)*3;d[so]=ty;writeU16BE(d,so+1,ch-1);}
    d[st.returnOffset]=0x1C;writeU16BE(d,st.returnOffset+1,(target.unit-1)*2);
  }
  d[ins.stateStart+1]=0;markStageDirty();return true;
}

function cmInsertLabel(ch,slot){
  const st=cmInsertState(ch,slot);if(!st||st.returnType===CM_UNASSIGNED)return '—';
  if(st.returnType===0x1C)return `Rack FX ${(st.returnIndex>>1)+1}`;
  return escapeHtml(cmInputSourceLabel({type:st.returnType,index:st.returnIndex}))+' (return)';
}

// ---- UI ----
function renderPatching(){
  const root=$('#patchEditor');if(!root)return;root.innerHTML='';
  if(!cmRecord()){root.innerHTML='<div class="notice warn">No Channel Mapper record of the expected size in this scene.</div>';return;}
  const names=state.current.stage.managers?.find(m=>m.key==='inputs')?.items||[];
  const inPanel=document.createElement('section');inPanel.className='panel';
  const typeOpts=[...CM_INPUT_SOURCE_TYPES].map(([v,l])=>`<option value="${v}">${escapeHtml(l)}</option>`).join('');
  let rows='';
  for(let ch=1;ch<=CM_INPUT_COUNT;ch++){
    const s=cmInputSource(ch);if(!s)continue;
    rows+=`<tr data-ch="${ch}"><td>${ch}</td><td>${escapeHtml(names[ch-1]?.name||'')}</td><td><select data-k="type">${typeOpts}</select></td><td><input data-k="sock" type="number" min="1" max="4096" step="1" style="width:5em"></td><td class="mono">${escapeHtml(cmInputSourceLabel(s))}</td><td class="mono">${cmInsertLabel(ch,'A')}</td><td class="mono">${cmInsertLabel(ch,'B')}</td></tr>`;
  }
  inPanel.innerHTML=`<div class="manager-head inline"><h2>Input sources</h2><span class="confidence verified">CONTROLLED-DIFF VERIFIED</span></div>
    <div class="notice">Source A per input (Processing › Preamp › Source Select). Surface sources share one type; the socket number is the raw surface index + 1. ABCD sources B–D are left unchanged.</div>
    <div class="parameter-map-scroll patch-scroll"><table class="patch-table"><thead><tr><th>In</th><th>Name</th><th>Type</th><th>Socket</th><th>Now</th><th>Ins A</th><th>Ins B</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  root.appendChild(inPanel);
  inPanel.querySelectorAll('tr[data-ch]').forEach(tr=>{
    const ch=Number(tr.dataset.ch),s=cmInputSource(ch),ty=tr.querySelector('[data-k="type"]'),so=tr.querySelector('[data-k="sock"]');
    ty.value=String(s.type);so.value=String(s.index+1);so.disabled=s.type===CM_UNASSIGNED;
    const apply=()=>{if(setInputSource(ch,ty.value,so.value))renderPatching();else toast('Input source write blocked.',true);};
    ty.onchange=apply;so.onchange=apply;
  });
  const outPanel=document.createElement('section');outPanel.className='panel';
  const b=CM_OUTPUT_BANKS.find(x=>x.key===(root.dataset.bank||'mrLocal'))||CM_OUTPUT_BANKS[0];
  const oOpts=[...CM_OUTPUT_SOURCE_TYPES].map(([v,t])=>`<option value="${v}">${escapeHtml(t.label)}</option>`).join('');
  let orows='';
  for(let s=1;s<=b.count;s++){const o=cmOutput(b.key,s);orows+=`<tr data-s="${s}"><td>${s}</td><td><select data-k="type">${oOpts}</select></td><td><input data-k="n" type="number" min="1" max="128" step="1" style="width:4em"></td><td><select data-k="side"><option>L</option><option>R</option></select></td><td class="mono">${escapeHtml(cmOutputSourceLabel(o))}</td></tr>`;}
  outPanel.innerHTML=`<div class="manager-head inline"><h2>Output patch</h2><span class="confidence verified">CONTROLLED-DIFF VERIFIED</span></div>
    <div class="peq-field"><span>Bank</span><div><select id="cmBank">${CM_OUTPUT_BANKS.map(x=>`<option value="${x.key}">${escapeHtml(x.label)}</option>`).join('')}</select></div></div>
    <div class="parameter-map-scroll patch-scroll"><table class="patch-table"><thead><tr><th>Socket</th><th>Source type</th><th>No.</th><th>Side</th><th>Now</th></tr></thead><tbody>${orows}</tbody></table></div>`;
  root.appendChild(outPanel);
  const bs=outPanel.querySelector('#cmBank');bs.value=b.key;bs.onchange=()=>{root.dataset.bank=bs.value;renderPatching();};
  outPanel.querySelectorAll('tr[data-s]').forEach(tr=>{
    const s=Number(tr.dataset.s),o=cmOutput(b.key,s),ty=tr.querySelector('[data-k="type"]'),n=tr.querySelector('[data-k="n"]'),sd=tr.querySelector('[data-k="side"]');
    const t=CM_OUTPUT_SOURCE_TYPES.get(o.type);ty.value=String(o.type);
    n.value=String(t?.stereo?(o.index>>1)+1:o.index+1);sd.value=o.index&1?'R':'L';sd.disabled=!t?.stereo;n.disabled=o.type===CM_UNASSIGNED;
    const apply=()=>{if(setOutputPatch(b.key,s,ty.value,n.value,sd.value))renderPatching();else toast('Output patch write blocked.',true);};
    ty.onchange=apply;n.onchange=apply;sd.onchange=apply;
  });
}

(function installPatchTab(){
  if($('#tabPatching'))return;
  const st=document.createElement('style');st.textContent='.patch-scroll{max-height:480px;margin-top:10px}.patch-table{border-collapse:collapse;width:100%;font-size:12px}.patch-table th{position:sticky;top:0;background:#111720;color:var(--muted);text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:7px}.patch-table td{padding:5px 7px;border-bottom:1px solid var(--line)}.patch-table select,.patch-table input{background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:3px 5px}';document.head.appendChild(st);
  const tab=document.createElement('button');tab.className='tab';tab.type='button';tab.dataset.tab='patching';tab.textContent='Patching';
  const after=document.querySelector('.tab[data-tab="channelstate"]');
  if(after)after.insertAdjacentElement('afterend',tab);else document.querySelector('.tabs')?.appendChild(tab);
  tab.onclick=()=>activateEditorTab(tab);
  const panel=document.createElement('div');panel.id='tabPatching';panel.className='tab-panel';
  panel.innerHTML='<div id="patchEditor"></div>';
  const ref=document.querySelector('#tabChannelstate');if(ref)ref.insertAdjacentElement('afterend',panel);else document.querySelector('#editor')?.appendChild(panel);
})();
const renderSceneBeforePatching=renderScene;
renderScene=function(){renderSceneBeforePatching();renderPatching();};

if(typeof PARAMETER_MAP!=='undefined'){
  const rows=[
    {id:'cm-input-source',field:'Input source A (type + socket)',offset:'state +1+13×(ch−1): [ABCD][type][index u16] then sources B–D',transform:'types: 00 MixRack sockets, 01 surface (index ranges), 02–04 MixRack I/O Port 1–3, 05/06 MixRack DX 1/2 and 3/4, 1C Rack FX, 14 unassigned; index = socket − 1'},
    {id:'cm-insert',field:'Input Insert A/B',offset:'return [type][index] at state +2564 (A) / +2948 (B) + 3×(ch−1); send written as type 08/09 into the destination output socket or Rack FX input pair (+6731)',transform:'index = input − 1; Insert N record +1: 00 assigned / 01 unassigned'},
    {id:'cm-output-patch',field:'Output socket source',offset:'MixRack Local output n at state +6632+3×(n−1): [type][index u16]',transform:'types: 00 socket tie, 07 direct out, 0D St Group, 0E Aux, 0F St Aux, 10 Main, 11 Matrix, 12 St Matrix, 13 PAFL, 14 unassigned, 1C Rack FX, 1E wedge, 21 IEM, 2D UltraFX; stereo index = 2×(n−1)+side'}
  ];
  for(const r of rows)if(!PARAMETER_MAP.some(x=>x.id===r.id))PARAMETER_MAP.push({id:r.id,area:'Patching',record:'Channel Mapper',payload:'10,380-byte state',field:r.field,offset:r.offset,datatype:'per-entry',transform:r.transform,confidence:'verified',write:true,evidence:'Controlled Director 2.12 changes (DM48/S5000): one source or patch change per stored scene, each changing only the named entry.',notes:'See docs/patching.md.'});
}
