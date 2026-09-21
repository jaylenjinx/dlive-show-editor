'use strict';

// ReverseEngineer9: Input Mixer per-input send/assign layout, decoded from 79 automated
// Director scenes on input 13 and structurally checked against every channel block of
// every available show (five mixer configurations, including legacy pre-UFX blocks).
//
// Mixer header: [version, monoGrp, stGrp, monoFX, stFX, monoAux, stAux, monoMtx, stMtx, ...]
// Per-input block:
//   one assign byte per group (00/01): mono groups, then stereo groups
//   send entries: mono FX, mono Aux, stereo FX, stereo Aux, mono Matrix, stereo Matrix
//     mono   = [on, pre, level_hi, level_lo]
//     stereo = [on, pre, level_hi, level_lo, pan]
//   47-byte channel section (fader at +3, pan at +5 — the verified blockSize−84/−82 fields)
//   8 stereo UFX sends (version >= 3 only)
const SEND_LEVEL_MIN_DB=-39,SEND_LEVEL_MAX_DB=10;

function inputSendLayout(header){
  const [ver,mg,sg,mfx,sfx,ma,sa,mm,sm]=header;
  const entries=[];let o=mg+sg;
  for(const [kind,count,stereo] of [['FX',mfx,false],['Aux',ma,false],['St FX',sfx,true],['St Aux',sa,true],['Mtx',mm,false],['St Mtx',sm,true]]){
    for(let i=0;i<count;i++){entries.push({name:`${kind} ${i+1}`,offset:o,stereo});o+=stereo?5:4;}
  }
  const section=o;o+=47;
  if(ver>=3)for(let i=0;i<8;i++){entries.push({name:`UFX ${i+1}`,offset:o,stereo:true});o+=5;}
  const groups=[];
  for(let i=0;i<mg;i++)groups.push({name:`Grp ${i+1}`,offset:i});
  for(let i=0;i<sg;i++)groups.push({name:`St Grp ${i+1}`,offset:mg+i});
  return {entries,groups,section,blockSize:o};
}

function inputSendsContext(channel){
  const mixer=ensureChannelState()?.mixer;
  const ch=mixer?.channels?.[Number(channel)-1];if(!mixer||!ch)return null;
  const header=[...mixer.header];
  if(header[0]!==2&&header[0]!==3)return null;
  const layout=inputSendLayout(header);
  // Only trust the layout when it reproduces the block size and the verified fader offset.
  if(layout.blockSize!==mixer.blockSize||layout.section+3!==mixer.blockSize-84)return null;
  return {mixer,ch,layout,dat:state.current.stage.datBytes};
}

function sendLevelRaw(ctx,e){return readI16BE(ctx.dat,ctx.ch.blockStart+e.offset+2);}
function sendLevelLabel(raw){return raw===FADER_NEG_INF_RAW?'−∞':`${(raw/256).toFixed(1)} dB`;}

function setInputSendLevel(channel,name,db){
  const ctx=inputSendsContext(channel),e=ctx?.layout.entries.find(x=>x.name===name);if(!e)return false;
  let raw;
  if(db===null)raw=FADER_NEG_INF_RAW;
  else{const v=Number(db);if(!Number.isFinite(v))return false;raw=Math.round(Math.max(SEND_LEVEL_MIN_DB,Math.min(SEND_LEVEL_MAX_DB,v))*256);}
  writeI16BE(ctx.dat,ctx.ch.blockStart+e.offset+2,raw);markStageDirty();return true;
}
function setInputSendFlag(channel,name,index,on){
  const ctx=inputSendsContext(channel),e=ctx?.layout.entries.find(x=>x.name===name);if(!e)return false;
  const at=ctx.ch.blockStart+e.offset+index;if(ctx.dat[at]!==0&&ctx.dat[at]!==1)return false;
  ctx.dat[at]=on?1:0;markStageDirty();return true;
}
function setInputGroupAssign(channel,name,on){
  const ctx=inputSendsContext(channel),g=ctx?.layout.groups.find(x=>x.name===name);if(!g)return false;
  const at=ctx.ch.blockStart+g.offset;if(ctx.dat[at]!==0&&ctx.dat[at]!==1)return false;
  ctx.dat[at]=on?1:0;markStageDirty();return true;
}

function injectInputSendsUi(){
  const root=$('#channelStateEditor');if(!root||!state.current?.stage)return;
  const select=root.querySelector('.peq-channel-select');
  if(select&&!select.dataset.sendsHook){select.dataset.sendsHook='1';select.addEventListener('change',injectInputSendsUi);}
  const stack=root.querySelector('.details-stack');if(!stack||stack.querySelector('[data-input-sends]'))return;
  const channel=Number(root.dataset.channel||1),ctx=inputSendsContext(channel);
  const panel=document.createElement('section');panel.className='panel';panel.dataset.inputSends='1';
  if(!ctx){
    panel.innerHTML='<h2>Sends and group assigns</h2><div class="notice warn">This mixer header does not reproduce the verified block layout; sends stay read only.</div>';
    stack.insertBefore(panel,stack.children[1]||null);return;
  }
  const {ch,layout,dat}=ctx,base=ch.blockStart;
  const rows=layout.entries.map(e=>{
    const on=dat[base+e.offset],pre=dat[base+e.offset+1],raw=sendLevelRaw(ctx,e);
    const pan=e.stereo?dat[base+e.offset+4]:null;
    return `<div class="config-row" data-send="${escapeHtml(e.name)}">
      <strong>${escapeHtml(e.name)}</strong>
      <div><input data-k="level" type="number" min="${SEND_LEVEL_MIN_DB}" max="${SEND_LEVEL_MAX_DB}" step="0.1" value="${raw===FADER_NEG_INF_RAW?'':(raw/256).toFixed(1)}" placeholder="−∞"><b>dB</b>
      <button data-k="inf" type="button">−∞</button>
      <select data-k="on"><option value="1">On</option><option value="0">Off</option></select>
      <select data-k="pre"><option value="1">Pre</option><option value="0">Post</option></select></div>
      <span><code>block + ${e.offset}</code> ${sendLevelLabel(raw)}${pan!=null?` · pan ${panDisplay(pan)} (read only)`:''}</span>
    </div>`;
  }).join('');
  const groups=layout.groups.map(g=>`<label class="config-row" data-group="${escapeHtml(g.name)}"><strong>${escapeHtml(g.name)}</strong><select data-k="assign"><option value="1">Assigned</option><option value="0">Off</option></select><span><code>block + ${g.offset}</code></span></label>`).join('');
  panel.innerHTML=`<div class="manager-head inline"><h2>CH ${ch.channel} sends</h2><span class="confidence verified">VERIFIED WRITE</span></div>
    <p>Level −39…+10 dB or −∞ (<code>int16 / 256</code>, <code>8001</code> = −∞), On (<code>01</code>) and Pre (<code>01</code>) / Post (<code>00</code>). Stereo send pan is decoded but read only.</p>
    <div class="config-table">${rows}</div>
    <h3>Group assigns</h3><div class="config-table">${groups}</div>`;
  stack.insertBefore(panel,stack.children[1]||null);

  for(const row of panel.querySelectorAll('[data-send]')){
    const name=row.dataset.send,e=layout.entries.find(x=>x.name===name);
    const level=row.querySelector('[data-k="level"]'),inf=row.querySelector('[data-k="inf"]');
    const on=row.querySelector('[data-k="on"]'),pre=row.querySelector('[data-k="pre"]');
    on.value=String(dat[base+e.offset]);pre.value=String(dat[base+e.offset+1]);
    const redraw=ok=>{if(ok)renderChannelState();else toast(`${name} send write blocked by structure validation.`,true);};
    level.onchange=()=>redraw(setInputSendLevel(channel,name,level.value===''?null:level.value));
    inf.onclick=()=>redraw(setInputSendLevel(channel,name,null));
    on.onchange=()=>redraw(setInputSendFlag(channel,name,0,on.value==='1'));
    pre.onchange=()=>redraw(setInputSendFlag(channel,name,1,pre.value==='1'));
  }
  for(const row of panel.querySelectorAll('[data-group]')){
    const name=row.dataset.group,g=layout.groups.find(x=>x.name===name),sel=row.querySelector('select');
    sel.value=String(dat[base+g.offset]);
    sel.onchange=()=>{if(setInputGroupAssign(channel,name,sel.value==='1'))renderChannelState();else toast(`${name} assign write blocked.`,true);};
  }
}

const renderChannelStateBeforeSends=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeSends();injectInputSendsUi();};

if(typeof PARAMETER_MAP!=='undefined'){
  const rows=[
    ['input-group-assign','Group assign','block + (group index)','one byte per mono then stereo group; 00 Off, 01 Assigned'],
    ['input-send-on','Send On','entry + 0','01 On, 00 Off'],
    ['input-send-pre','Send Pre/Post','entry + 1','01 Pre, 00 Post'],
    ['input-send-level','Send level','entry + 2..3','int16_be / 256 dB; 8001 = −∞; writer −39…+10 dB'],
    ['input-send-pan','Stereo send pan','entry + 4 (stereo entries)','0x00 L … 0x25 C … 0x4A R (decoded, read only)'],
  ];
  for(const [id,field,offset,transform] of rows)if(!PARAMETER_MAP.some(x=>x.id===id))PARAMETER_MAP.push({
    id,area:'Input Mixer',record:'Input Mixer',payload:'12-byte header + 128 per-input blocks',field,offset,datatype:'per-input block field',transform,
    confidence:id==='input-send-pan'?'decoded':'verified',write:id!=='input-send-pan',
    evidence:'ReverseEngineer9: 79 automated Director scenes on input 13, each changing one send/assign field; layout reproduces every channel block in five mixer configurations.',
    notes:'Entry order: groups, mono FX, mono Aux, stereo FX, stereo Aux, mono Matrix, stereo Matrix, 47-byte channel section, 8 UFX (header version ≥ 3). Writes are blocked unless the header reproduces the block size and verified fader offset.'
  });
}
