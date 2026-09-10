'use strict';

// Read-only current-format dLive 2.12 channel-state decoder.
// Input Mixer layout has been validated across two different real mixer configs:
//   12-byte mixer header + 128 equal-size per-input blocks.
// Fader and pan are located relative to the END of each variable-size block,
// which makes the mapping survive the two observed block sizes (169 and 224).

function parseInputMixerChannelState(dat){
  const sig=asciiBytes('Input Mixer'),pos=indexOfBytes(dat,sig);
  if(pos<2)return null;
  const payloadLength=readU16BE(dat,pos-2),frameStart=pos-2,frameEnd=frameStart+2+payloadLength;
  if(frameEnd>dat.length||dat[pos+sig.length]!==0)return null;
  const stateStart=pos+sig.length+1,stateLength=frameEnd-stateStart;
  const headerLength=12,bodyLength=stateLength-headerLength;
  if(bodyLength<=0||bodyLength%128!==0)return null;
  const blockSize=bodyLength/128;
  if(blockSize<88)return null;
  const blocksStart=stateStart+headerLength;
  const channels=[];
  for(let i=0;i<128;i++){
    const blockStart=blocksStart+i*blockSize;
    const faderOffset=blockStart+blockSize-84;
    const panOffset=blockStart+blockSize-82;
    const faderRaw=readI16BE(dat,faderOffset);
    const faderDb=faderRaw===-32767?null:faderRaw/256;
    const panRaw=dat[panOffset];
    const panPct=((panRaw-37)/37)*100;
    channels.push({
      channel:i+1,blockStart,blockSize,
      faderOffset,faderRaw,faderDb,faderInfinite:faderRaw===-32767,
      panOffset,panRaw,panPct,
      panLabel:panRaw===37?'C':panRaw<37?`${Math.round(Math.abs(panPct))}% L`:`${Math.round(Math.abs(panPct))}% R`,
    });
  }
  return {frameStart,pos,payloadLength,stateStart,stateLength,headerLength,header:dat.slice(stateStart,stateStart+headerLength),blockSize,blocksStart,channels};
}

function parseInputCompressorStates(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`Compressor, Input Channel ${String(channel).padStart(2,'0')}`;
    const sig=asciiBytes(label),pos=indexOfBytes(dat,sig);if(pos<2)continue;
    const payloadLength=readU16BE(dat,pos-2),frameStart=pos-2,frameEnd=frameStart+2+payloadLength;
    if(frameEnd>dat.length||dat[pos+sig.length]!==0)continue;
    const stateStart=pos+sig.length+1,stateLength=frameEnd-stateStart;
    if(stateLength<3)continue;
    const typeRaw=dat[stateStart],modelRaw=dat[stateStart+1],enableRaw=dat[stateStart+2];
    out.push({channel,frameStart,payloadLength,stateStart,stateLength,typeRaw,modelRaw,enableRaw,active:enableRaw===1,enableKnown:enableRaw===0||enableRaw===1});
  }
  return out;
}

function ensureChannelState(){
  const stage=state.current?.stage;if(!stage)return null;
  if(!stage.inputMixerState)stage.inputMixerState=parseInputMixerChannelState(stage.datBytes);
  if(!stage.compressorStates)stage.compressorStates=parseInputCompressorStates(stage.datBytes);
  return {mixer:stage.inputMixerState,compressors:stage.compressorStates};
}

function formatFaderDb(ch){ return ch.faderInfinite?'−∞':`${ch.faderDb.toFixed(2)} dB`; }

function renderChannelState(){
  const root=$('#channelStateEditor');if(!root)return;
  root.innerHTML='';
  const decoded=ensureChannelState();
  if(!decoded?.mixer){root.innerHTML='<div class="notice warn">This scene does not match the two currently validated Input Mixer shapes.</div>';return;}
  const mixer=decoded.mixer;
  const inputs=state.current.stage.managers.find(x=>x.key==='inputs');

  const toolbar=document.createElement('section');toolbar.className='panel peq-toolbar';
  toolbar.innerHTML=`<div class="manager-head inline"><h2>Input channel</h2><span class="confidence decoded">CROSS-CHECKED READ</span></div>`;
  const select=document.createElement('select');select.className='peq-channel-select';
  for(const ch of mixer.channels){
    const name=inputs?.items[ch.channel-1]?.name||'';
    const o=document.createElement('option');o.value=ch.channel;o.textContent=`CH ${ch.channel}${name?` · ${name}`:''}`;select.appendChild(o);
  }
  const remembered=Number(root.dataset.channel||1);select.value=String(Math.max(1,Math.min(128,remembered)));
  toolbar.appendChild(select);root.appendChild(toolbar);
  const details=document.createElement('div');details.className='details-stack';root.appendChild(details);

  const draw=()=>{
    root.dataset.channel=select.value;details.innerHTML='';
    const ch=mixer.channels[Number(select.value)-1];
    const comp=decoded.compressors.find(c=>c.channel===ch.channel);
    const panel=document.createElement('section');panel.className='panel';
    panel.innerHTML=`
      <div class="manager-head inline"><h2>CH ${ch.channel} mixer state</h2><code>block 0x${ch.blockStart.toString(16)} · ${ch.blockSize} bytes</code></div>
      <div class="config-table">
        <div class="config-row"><strong>Fader</strong><code>${ch.faderInfinite?'80 01':`${hexByte((ch.faderRaw<0?ch.faderRaw+65536:ch.faderRaw)>>8)} ${hexByte((ch.faderRaw<0?ch.faderRaw+65536:ch.faderRaw)&255)}`}</code><span>${formatFaderDb(ch)}</span></div>
        <div class="config-row"><strong>Fader offset</strong><code>block + ${ch.blockSize-84}</code><span><code>blockSize − 84</code></span></div>
        <div class="config-row"><strong>Pan</strong><code>${hexByte(ch.panRaw)}</code><span>${ch.panLabel}</span></div>
        <div class="config-row"><strong>Pan offset</strong><code>block + ${ch.blockSize-82}</code><span><code>blockSize − 82</code></span></div>
        <div class="config-row"><strong>Compressor</strong><code>${comp?hexByte(comp.enableRaw):'—'}</code><span>${comp?(comp.enableKnown?(comp.active?'On':'Off'):'Unknown'):'Not found'}</span></div>
      </div>`;
    details.appendChild(panel);

    const evidence=document.createElement('section');evidence.className='panel';
    evidence.innerHTML=`
      <h2>Input Mixer structure</h2>
      <pre><code>12-byte mixer header
+ 128 × ${mixer.blockSize}-byte input blocks</code></pre>
      <p>Two real dLive 2.12 shows use different block sizes (169 and 224 bytes), but fader and pan remain at <code>blockSize − 84</code> and <code>blockSize − 82</code>. ConsoleFlip's rendered fader and pan controls independently agree with these decoded values.</p>
      <div class="notice warn"><strong>Read-only:</strong> unlike HPF, fader/pan have not yet been isolated with one-parameter scene clones. Their values are decoded and independently cross-checked, but the editor does not write them yet.</div>`;
    details.appendChild(evidence);
  };
  select.onchange=draw;draw();
}
