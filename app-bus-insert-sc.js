'use strict';

// Bus inserts and bus compressor sidechain source (Director 2.12, 2026-11-02, scenes 338–346).
//
// Inserts: like input inserts, the return is a [type][index u16] entry in a Channel Mapper table and
// the send is written into the destination output socket's entry:
//   Mono Aux n return  → state +6038 + 3×(n−1); send type 17, index n−1
//   Main L/R/C/LFE/sL/sR return → state +6326 + 3×idx; send type 19, index idx (L 0, R 1, C 2 …)
// `Insert, <bus> Channel NN` state +1 is 00 while assigned and 01 once unassigned.
// Only mono auxes and mains were reachable in the test configuration; groups and matrices are not written.
//
// Sidechain source: `Compressor side chain source, <bus label>` = 01 TT II, the same encoding as inputs
// (Aux 1 self = 01 04 00; Input 10 = 01 01 09).
const BUS_INS_RET={aux:6038,main:6326};
const BUS_INS_SEND={aux:0x17,main:0x19};
const MAIN_INS_IDX={L:0,R:1,C:2,LFE:3,sL:4,sR:5};

function busInsertSlots(target){
  // returns [{retOff, sendType, sendIndex, insLabel}] for each leg (stereo main = L and R)
  if(target.kind==='aux'){const n=Number(target.n);if(!(n>=1&&n<=64))return null;
    return [{ret:BUS_INS_RET.aux+3*(n-1),type:BUS_INS_SEND.aux,idx:n-1,ins:`Insert, Mono Aux Channel ${String(n).padStart(2,'0')} `}];}
  if(target.kind==='main'){const legs=target.legs||['L','R'];
    return legs.map(l=>({ret:BUS_INS_RET.main+3*MAIN_INS_IDX[l],type:BUS_INS_SEND.main,idx:MAIN_INS_IDX[l],
      ins:l==='L'||l==='R'?`Insert, Main Channel 01 ${l==='L'?'Left':'Right'}`:null}));}
  return null;
}
// sockets: array of {send, ret} per leg (MixRack local output / MixRack socket numbers), or null to unassign
function setBusInsert(target,sockets){
  const r=cmRecord();if(!r)return false;const d=state.current.stage.datBytes,legs=busInsertSlots(target);if(!legs)return false;
  if(sockets&&sockets.length!==legs.length)return false;
  for(const [i,leg] of legs.entries()){
    // clear any previous send for this leg
    for(let s=1;s<=CM_OUTPUT_BANKS[0].count;s++){const o=r.stateStart+CM_OUTPUT_BANKS[0].base+(s-1)*3;if(d[o]===leg.type&&readU16BE(d,o+1)===leg.idx){d[o]=CM_UNASSIGNED;writeU16BE(d,o+1,0);}}
    const ro=r.stateStart+leg.ret;
    if(!sockets){d[ro]=CM_UNASSIGNED;writeU16BE(d,ro+1,0);}
    else{
      const {send,ret}=sockets[i];if(!(send>=1&&send<=CM_OUTPUT_BANKS[0].count&&ret>=1&&ret<=128))return false;
      const so=r.stateStart+CM_OUTPUT_BANKS[0].base+(send-1)*3;d[so]=leg.type;writeU16BE(d,so+1,leg.idx);
      d[ro]=0x00;writeU16BE(d,ro+1,ret-1);
    }
    if(leg.ins){const ins=ipParseRecord(d,leg.ins,3);if(ins)d[ins.stateStart+1]=sockets?0:1;}
  }
  markStageDirty();return true;
}

// typeCode uses the strip-type ids (01 input, 02 mono group, 03 stereo group, 04 mono aux, 05 stereo aux,
// 08 main, 0A mono matrix, 0B stereo matrix); index is 1-based.
function setBusSidechainSource(bus,typeCode,index){
  const dat=state.current?.stage?.datBytes;if(!dat||!bus)return false;
  const t=Number(typeCode),i=Number(index)-1;if(![1,2,3,4,5,8,10,11].includes(t)||!(i>=0&&i<128))return false;
  const labels=(bus.rec?.comp||[]).map(c=>c.label.replace(/^Compressor, /,'Compressor side chain source, '));
  let n=0;for(const l of labels){const r=ipParseRecord(dat,l,3);if(r&&dat[r.stateStart]===1){dat[r.stateStart+1]=t;dat[r.stateStart+2]=i;n++;}}
  if(!n)return false;markStageDirty();return true;
}
function busSidechainSource(bus){
  const dat=state.current?.stage?.datBytes,c=bus?.rec?.comp?.[0];if(!dat||!c)return null;
  const r=ipParseRecord(dat,c.label.replace(/^Compressor, /,'Compressor side chain source, '),3);
  return r?{type:dat[r.stateStart+1],index:dat[r.stateStart+2]+1}:null;
}

const SC_TYPES=[[1,'Input'],[2,'Mono Group'],[3,'Stereo Group'],[4,'Mono Aux'],[5,'Stereo Aux'],[8,'Main'],[10,'Mono Matrix'],[11,'Stereo Matrix']];
function renderBusInsertSc(){
  const root=$('#busEditor');if(!root)return;
  const sel=root.querySelector('.peq-channel-select'),bus=sel&&busById(sel.value);
  root.querySelector('#busInsScPanel')?.remove();if(!bus)return;
  const sc=busSidechainSource(bus);
  const panel=document.createElement('section');panel.className='panel';panel.id='busInsScPanel';
  const insKind=bus.kind.key==='aux'&&!bus.stereo?'aux':bus.kind.key==='main'&&bus.stereo?'main':null;
  panel.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} sidechain &amp; insert</h2><span class="confidence verified">VERIFIED WRITE</span></div>
    ${sc?busField('Comp sidechain','',`<select data-k="sct">${SC_TYPES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select> <input data-k="sci" type="number" min="1" max="128" step="1" style="width:5em">`):''}
    ${insKind?busField('Insert A','MixRack sockets',`${insKind==='main'?'L ':''}send <input data-k="s1" type="number" min="1" max="32" style="width:4em"> return <input data-k="r1" type="number" min="1" max="128" style="width:4em">${insKind==='main'?` · R send <input data-k="s2" type="number" min="1" max="32" style="width:4em"> return <input data-k="r2" type="number" min="1" max="128" style="width:4em">`:''} <button class="btn" type="button" data-k="ia">Assign</button> <button class="btn" type="button" data-k="iu">Unassign</button>`):'<div class="notice">Insert writing is verified for mono auxes and Main LR only.</div>'}`;
  root.querySelector('.details-stack')?.appendChild(panel);
  const q=k=>panel.querySelector(`[data-k="${k}"]`),redraw=ok=>{if(!ok)toast('Write blocked.',true);renderBusInsertSc();};
  if(sc){q('sct').value=String(sc.type);q('sci').value=String(sc.index);const f=()=>redraw(setBusSidechainSource(bus,q('sct').value,q('sci').value));q('sct').onchange=f;q('sci').onchange=f;}
  if(insKind){
    const tgt=insKind==='aux'?{kind:'aux',n:bus.n}:{kind:'main',legs:['L','R']};
    q('ia').onclick=()=>{const s=[{send:+q('s1').value,ret:+q('r1').value}];if(insKind==='main')s.push({send:+q('s2').value,ret:+q('r2').value});redraw(setBusInsert(tgt,s));};
    q('iu').onclick=()=>redraw(setBusInsert(tgt,null));
  }
}
const renderBusesBeforeInsSc=renderBuses;
renderBuses=function(){renderBusesBeforeInsSc();renderBusInsertSc();const s=$('#busEditor .peq-channel-select');if(s)s.addEventListener('change',()=>renderBusInsertSc());};
