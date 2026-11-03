'use strict';

// Bus inserts and bus compressor sidechain source (Director 2.12, 2026-11-02, scenes 338–346).
//
// Inserts: like input inserts, the return is a [type][index u16] entry in a Channel Mapper table and
// the send is written into the destination output socket's entry. Return tables (state offsets) hold 64
// entries for mono buses and 32 for stereo buses; a stereo bus has ONE return entry (the odd socket of
// an odd/even pair — Director snaps an even socket down) and two sends (index 2×(n−1) + 0 Left / 1 Right):
//   Mono Group  5750  send 15    Stereo Group  5942  send 16
//   Mono Aux    6038  send 17    Stereo Aux    6230  send 18
//   Main L/R/C/LFE/sL/sR 6326 + 3×leg, send 19 (each leg has its own return)
//   Mono Matrix 6344  send 1A    Stereo Matrix 6536  send 1B
// Aux/Main verified 2026-11-02 (scenes 338–346); stereo group/aux, mono/stereo matrix 2026-11-03
// (scenes 101–108); mono group from type/table order plus USB-corpus shows using it (Rack FX sends 15 nn,
// returns at 5750+).
// `Insert, <bus> Channel NN` state +1 is 00 while assigned and 01 once unassigned.
//
// Sidechain source: `Compressor side chain source, <bus label>` = 01 TT II, the same encoding as inputs
// (Aux 1 self = 01 04 00; Input 10 = 01 01 09).
const BUS_INS_TABLES={group:[5750,0x15,5942,0x16],aux:[6038,0x17,6230,0x18],matrix:[6344,0x1a,6536,0x1b]};
const BUS_INS_RET={aux:6038,main:6326};
const BUS_INS_SEND={aux:0x17,main:0x19};
const MAIN_INS_IDX={L:0,R:1,C:2,LFE:3,sL:4,sR:5};
const BUS_INS_LABEL={group:'Group',aux:'Aux',matrix:'Matrix'};

// returns [{ret, type, idx, ins, retStep}] — one per send leg. A stereo bus returns two legs that share
// one return entry (retStep 0 on the Right leg means "same return").
function busInsertSlots(target){
  const pad=n=>String(n).padStart(2,'0');
  if(target.kind==='main'){const legs=target.legs||['L','R'];
    return legs.map(l=>({ret:BUS_INS_RET.main+3*MAIN_INS_IDX[l],type:BUS_INS_SEND.main,idx:MAIN_INS_IDX[l],
      ins:l==='L'||l==='R'?`Insert, Main Channel 01 ${l==='L'?'Left':'Right'}`:null}));}
  const t=BUS_INS_TABLES[target.kind];if(!t)return null;const n=Number(target.n);
  if(!target.stereo){if(!(n>=1&&n<=64))return null;
    return [{ret:t[0]+3*(n-1),type:t[1],idx:n-1,ins:`Insert, Mono ${BUS_INS_LABEL[target.kind]} Channel ${pad(n)} `}];}
  if(!(n>=1&&n<=32))return null;
  const lab=side=>`Insert, Stereo ${BUS_INS_LABEL[target.kind]} Channel ${pad(n)} ${side}`;
  return [{ret:t[2]+3*(n-1),type:t[3],idx:2*(n-1),ins:lab('Left'),pair:true},
          {ret:null,type:t[3],idx:2*(n-1)+1,ins:lab('Right')}];
}
// sockets: array of {send, ret} per leg (MixRack local output / MixRack socket numbers), or null to unassign
function setBusInsert(target,sockets){
  const r=cmRecord();if(!r)return false;const d=state.current.stage.datBytes,legs=busInsertSlots(target);if(!legs)return false;
  if(sockets&&sockets.length!==legs.length)return false;
  const outs=CM_OUTPUT_BANKS[0];
  if(sockets&&sockets.some(({send},i)=>!(send>=1&&send<=outs.count)||(legs[i].ret!=null&&!(sockets[i].ret>=1&&sockets[i].ret<=128))))return false;
  for(const [i,leg] of legs.entries()){
    // clear any previous send for this leg
    for(let s=1;s<=outs.count;s++){const o=r.stateStart+outs.base+(s-1)*3;if(d[o]===leg.type&&readU16BE(d,o+1)===leg.idx){d[o]=CM_UNASSIGNED;writeU16BE(d,o+1,0);}}
    if(sockets){const so=r.stateStart+outs.base+(sockets[i].send-1)*3;d[so]=leg.type;writeU16BE(d,so+1,leg.idx);}
    if(leg.ret!=null){
      const ro=r.stateStart+leg.ret;
      if(!sockets){d[ro]=CM_UNASSIGNED;writeU16BE(d,ro+1,0);}
      else{const ret=leg.pair?((sockets[i].ret-1)&~1)+1:sockets[i].ret;d[ro]=0x00;writeU16BE(d,ro+1,ret-1);}
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
  const insKind=bus.kind.key==='main'?(bus.stereo?'main':null):BUS_INS_TABLES[bus.kind.key]?(bus.stereo?'stereo':'mono'):null;
  const two=insKind==='main'||insKind==='stereo';
  panel.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} sidechain &amp; insert</h2><span class="confidence verified">VERIFIED WRITE</span></div>
    ${sc?busField('Comp sidechain','',`<select data-k="sct">${SC_TYPES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select> <input data-k="sci" type="number" min="1" max="128" step="1" style="width:5em">`):''}
    ${insKind?busField('Insert A','MixRack sockets',`${two?'L ':''}send <input data-k="s1" type="number" min="1" max="32" style="width:4em">${insKind==='stereo'?` · R send <input data-k="s2" type="number" min="1" max="32" style="width:4em">`:''} return <input data-k="r1" type="number" min="1" max="128" style="width:4em">${insKind==='stereo'?' (+ next socket)':''}${insKind==='main'?` · R send <input data-k="s2" type="number" min="1" max="32" style="width:4em"> return <input data-k="r2" type="number" min="1" max="128" style="width:4em">`:''} <button class="btn" type="button" data-k="ia">Assign</button> <button class="btn" type="button" data-k="iu">Unassign</button>`):'<div class="notice">Insert writing is not mapped for this bus.</div>'}`;
  root.querySelector('.details-stack')?.appendChild(panel);
  const q=k=>panel.querySelector(`[data-k="${k}"]`),redraw=ok=>{if(!ok)toast('Write blocked.',true);renderBusInsertSc();};
  if(sc){q('sct').value=String(sc.type);q('sci').value=String(sc.index);const f=()=>redraw(setBusSidechainSource(bus,q('sct').value,q('sci').value));q('sct').onchange=f;q('sci').onchange=f;}
  if(insKind){
    const tgt=insKind==='main'?{kind:'main',legs:['L','R']}:{kind:bus.kind.key,stereo:insKind==='stereo',n:bus.n};
    q('ia').onclick=()=>{const s=[{send:+q('s1').value,ret:+q('r1').value}];
      if(insKind==='main')s.push({send:+q('s2').value,ret:+q('r2').value});
      if(insKind==='stereo')s.push({send:+q('s2').value,ret:null});
      redraw(setBusInsert(tgt,s));};
    q('iu').onclick=()=>redraw(setBusInsert(tgt,null));
  }
}
const renderBusesBeforeInsSc=renderBuses;
renderBuses=function(){renderBusesBeforeInsSc();renderBusInsertSc();const s=$('#busEditor .peq-channel-select');if(s)s.addEventListener('change',()=>renderBusInsertSc());};
