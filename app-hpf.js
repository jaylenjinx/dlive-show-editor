'use strict';

// Input HPF decoder — current evidence is high-confidence read-only.
// Controlled HPF on/off + multi-frequency scene diffs are still required before writes are enabled.

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
    const enableRaw=dat[stateStart+3];
    const tailRaw=dat[stateStart+4];
    out.push({
      channel,label,frameStart,payloadLength,totalLength:payloadLength+2,stateStart,stateLength,
      discriminator,frequencyRaw,frequencyHz:peqFrequencyFromRaw(frequencyRaw),enableRaw,tailRaw,
      shapeMatchesReference:discriminator===0x03&&tailRaw===0x01,
      raw:dat.slice(stateStart,frameEnd),
    });
  }
  return out;
}

function hpfEnableLabel(raw){
  if(raw===0)return 'Off';
  return `Non-zero (${raw}) — candidate On`;
}

function renderHpf(){
  const root=$('#hpfEditor');if(!root)return;
  root.innerHTML='';
  const dat=state.current?.stage?.datBytes;
  if(!dat){root.innerHTML='<div class="notice warn">No MixRack scene data is available.</div>';return;}
  const hpfs=parseInputHpfs(dat);
  if(!hpfs.length){root.innerHTML='<div class="notice warn">No recognised input HPF records were found.</div>';return;}

  const toolbar=document.createElement('section');toolbar.className='panel peq-toolbar';
  toolbar.innerHTML='<div class="manager-head inline"><h2>Input channel</h2><span class="confidence decoded">HIGH-CONFIDENCE READ</span></div>';
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
    const h=hpfs.find(x=>x.channel===Number(select.value));if(!h)return;
    const panel=document.createElement('section');panel.className='panel';
    panel.innerHTML=`
      <div class="manager-head inline"><h2>CH ${h.channel} high-pass filter</h2><code>frame 0x${h.frameStart.toString(16)}</code></div>
      <div class="config-table">
        <div class="config-row"><strong>Raw state</strong><code>${hexRange(h.raw)}</code><span class="confidence decoded">5 BYTES</span></div>
        <div class="config-row"><strong>Byte 0</strong><code>0x${hexByte(h.discriminator)}</code><span>${h.discriminator===3?'Observed HPF discriminator/type':'Unexpected value'}</span></div>
        <div class="config-row"><strong>Bytes 1–2 · frequency</strong><code>0x${h.frequencyRaw.toString(16).padStart(4,'0')}</code><span>${formatHz(h.frequencyHz)}</span></div>
        <div class="config-row"><strong>Byte 3 · enable candidate</strong><code>0x${hexByte(h.enableRaw)}</code><span>${hpfEnableLabel(h.enableRaw)}</span></div>
        <div class="config-row"><strong>Byte 4</strong><code>0x${hexByte(h.tailRaw)}</code><span>Observed constant tail/state byte</span></div>
      </div>`;
    details.appendChild(panel);

    const evidence=document.createElement('section');evidence.className='panel';
    evidence.innerHTML=`
      <h2>Why frequency is high-confidence</h2>
      <p>The stored reference value <code>53 96</code> is decimal ${h.frequencyRaw}. Using the same high-resolution logarithmic coordinate already proven for input PEQ gives <strong>${formatHz(h.frequencyHz)}</strong> exactly:</p>
      <pre><code>f = 4 × 2^(raw / 4608)</code></pre>
      <p>The dLive MIDI implementation independently documents HPF as a logarithmic 20–2000 Hz control. Its 7-bit conversion is the low-resolution normalisation of this same coordinate range.</p>
      <div class="notice warn"><strong>Write remains disabled:</strong> the current show and ConsoleFlip HAR only give us the HPF-Off state. We still need isolated HPF-On and several frequency scenes before writing these bytes from the editor.</div>`;
    details.appendChild(evidence);

    const plan=document.createElement('section');plan.className='panel';
    plan.innerHTML=`
      <h2>Controlled test set needed for Verified Write</h2>
      <p>Clone the same current dLive 2.12 scene and use one input channel for all tests. Change only HPF:</p>
      <pre><code>HPF OFF 100
HPF ON 100
HPF ON 20
HPF ON 50
HPF ON 200
HPF ON 500
HPF ON 1000
HPF ON 2000</code></pre>
      <p>Those scenes should isolate the enable representation and prove the frequency writer across the full supported range.</p>`;
    details.appendChild(plan);
  };
  select.onchange=draw;draw();
}
