'use strict';

// Input HPF decoder/editor — dLive 2.12.
// Verified against a second real event show and ConsoleFlip's independently
// decoded preview: 108/108 visible channel cards matched frequency + bypass state.
//
// State after the NUL-terminated record label:
//   03 FF FF MM BB
//      |     |  +-- bypass: 00 active/on, 01 bypassed/off
//      |     +----- unknown mode/state byte; preserve exactly
//      +----------- uint16_be logarithmic frequency coordinate

function hpfFrequencyFromRaw(raw){ return 4*Math.pow(2,raw/4608); }
function hpfFrequencyToRaw(hz){
  const f=Math.max(20,Math.min(2000,Number(hz)||20));
  return Math.max(0,Math.min(0xffff,Math.floor(4608*Math.log2(f/4))));
}

function parseInputHpfs(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`Highpass Filter Input Channel ${String(channel).padStart(2,'0')}`;
    const sig=asciiBytes(label),pos=indexOfBytes(dat,sig);
    if(pos<2)continue;
    const payloadLength=readU16BE(dat,pos-2);
    const frameStart=pos-2,frameEnd=frameStart+2+payloadLength;
    if(frameEnd>dat.length)continue;
    const nul=pos+sig.length;
    if(dat[nul]!==0)continue;
    const stateStart=nul+1,stateLength=frameEnd-stateStart;
    if(stateLength!==5)continue;
    const discriminator=dat[stateStart];
    const frequencyRaw=readU16BE(dat,stateStart+1);
    const modeRaw=dat[stateStart+3];
    const bypassRaw=dat[stateStart+4];
    out.push({
      channel,label,frameStart,payloadLength,totalLength:payloadLength+2,stateStart,stateLength,
      discriminator,frequencyRaw,frequencyHz:hpfFrequencyFromRaw(frequencyRaw),modeRaw,bypassRaw,
      active:bypassRaw===0,bypassKnown:bypassRaw===0||bypassRaw===1,
      shapeMatchesReference:discriminator===0x03,
      raw:dat.slice(stateStart,frameEnd),
    });
  }
  return out;
}

function ensureInputHpfs(){
  const stage=state.current?.stage;
  if(stage&&!stage.hpfs)stage.hpfs=parseInputHpfs(stage.datBytes);
  return stage?.hpfs||[];
}
function getInputHpf(channel){ return ensureInputHpfs().find(h=>h.channel===Number(channel))||null; }

function setHpfFrequency(channel,hz){
  const h=getInputHpf(channel);if(!h||!h.shapeMatchesReference)return false;
  const raw=hpfFrequencyToRaw(hz);
  writeU16BE(state.current.stage.datBytes,h.stateStart+1,raw);
  h.frequencyRaw=raw;h.frequencyHz=hpfFrequencyFromRaw(raw);
  h.raw=state.current.stage.datBytes.slice(h.stateStart,h.stateStart+5);
  markStageDirty();return true;
}
function setHpfActive(channel,on){
  const h=getInputHpf(channel);if(!h||!h.shapeMatchesReference)return false;
  const raw=on?0:1;
  state.current.stage.datBytes[h.stateStart+4]=raw;
  h.bypassRaw=raw;h.active=!!on;h.bypassKnown=true;
  h.raw=state.current.stage.datBytes.slice(h.stateStart,h.stateStart+5);
  markStageDirty();return true;
}

function renderHpf(){
  const root=$('#hpfEditor');if(!root)return;
  root.innerHTML='';
  const hpfs=ensureInputHpfs();
  if(!hpfs.length){root.innerHTML='<div class="notice warn">No recognised current-format input HPF records were found.</div>';return;}

  const toolbar=document.createElement('section');toolbar.className='panel peq-toolbar';
  toolbar.innerHTML='<div class="manager-head inline"><h2>Input channel</h2><span class="confidence verified">VERIFIED WRITE</span></div>';
  const select=document.createElement('select');select.className='peq-channel-select';
  const inputs=state.current.stage.managers.find(x=>x.key==='inputs');
  for(const h of hpfs){
    const name=inputs?.items[h.channel-1]?.name||'';
    const o=document.createElement('option');o.value=h.channel;o.textContent=`CH ${h.channel}${name?` · ${name}`:''}`;select.appendChild(o);
  }
  const remembered=Number(root.dataset.channel||16);
  select.value=hpfs.some(h=>h.channel===remembered)?String(remembered):String(hpfs[0].channel);
  toolbar.appendChild(select);root.appendChild(toolbar);

  const details=document.createElement('div');details.className='details-stack';root.appendChild(details);
  const draw=()=>{
    root.dataset.channel=select.value;details.innerHTML='';
    const h=getInputHpf(select.value);if(!h)return;
    const panel=document.createElement('section');panel.className='panel';
    panel.innerHTML=`
      <div class="manager-head inline"><h2>CH ${h.channel} high-pass filter</h2><code>frame 0x${h.frameStart.toString(16)}</code></div>
      <div class="peq-field"><span>HPF <small>byte 4: 00 active, 01 bypassed</small></span><select data-k="active"><option value="1">On</option><option value="0">Off</option></select><code>${hexByte(h.bypassRaw)}</code></div>
      <div class="peq-field"><span>Frequency <small>verified 20–2000 Hz logarithmic coordinate</small></span><div><input data-k="freq" type="number" min="20" max="2000" step="1" value="${Math.round(h.frequencyHz)}"><b>Hz</b></div><code>${hexByte(h.frequencyRaw>>8)} ${hexByte(h.frequencyRaw&255)}</code></div>
      <div class="config-table">
        <div class="config-row"><strong>Raw state</strong><code>${hexRange(h.raw)}</code><span class="confidence verified">5 BYTES</span></div>
        <div class="config-row"><strong>Byte 0</strong><code>0x${hexByte(h.discriminator)}</code><span>${h.discriminator===3?'Observed HPF discriminator/type':'Unexpected value — writes blocked'}</span></div>
        <div class="config-row"><strong>Byte 3</strong><code>0x${hexByte(h.modeRaw)}</code><span>Unknown mode/state — preserved exactly</span></div>
      </div>`;
    details.appendChild(panel);

    const activeSel=panel.querySelector('[data-k="active"]');
    activeSel.value=h.active?'1':'0';
    if(!h.bypassKnown||!h.shapeMatchesReference){activeSel.disabled=true;panel.querySelector('[data-k="freq"]').disabled=true;}
    activeSel.onchange=()=>{if(setHpfActive(h.channel,activeSel.value==='1'))renderHpf();};
    panel.querySelector('[data-k="freq"]').onchange=e=>{if(setHpfFrequency(h.channel,e.target.value))renderHpf();};

    const evidence=document.createElement('section');evidence.className='panel';
    evidence.innerHTML=`
      <h2>Verification</h2>
      <p>A real event show provided active and bypassed HPFs across many frequencies. ConsoleFlip independently decoded 108 visible input-channel cards; every one matched this parser's On/Off state and rounded frequency.</p>
      <pre><code>raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)</code></pre>
      <p>Only bytes 1–2 (frequency) and byte 4 (bypass) are changed. Byte 3 is deliberately preserved because a non-zero value occurs in real event data and its meaning is still unknown.</p>`;
    details.appendChild(evidence);
  };
  select.onchange=draw;draw();
}
