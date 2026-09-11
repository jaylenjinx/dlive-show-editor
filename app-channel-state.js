'use strict';

// dLive 2.12 channel-state decoder/editor.
// Input Mixer layout has been validated across multiple real mixer configs:
//   12-byte mixer header + 128 equal-size per-input blocks.
// The fader is fixed relative to the END of each variable-size block.
//
// Controlled Hardcore Start clones changed CH16 only at blockSize-84..-83:
//   -inf, -30, -20.3, -12.2, -5.9, ~0, +5, +10 dB.
// This independently confirms the fader encoding and generic end-relative offset.

const FADER_MIN_VERIFIED_DB=-30;
const FADER_MAX_VERIFIED_DB=10;
const FADER_NEG_INF_RAW=-32767; // 0x8001

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
  const header=dat.slice(stateStart,stateStart+headerLength);
  const writableShape=header[0]===3;
  const channels=[];
  for(let i=0;i<128;i++){
    const blockStart=blocksStart+i*blockSize;
    const faderOffset=blockStart+blockSize-84;
    const panOffset=blockStart+blockSize-82;
    const faderRaw=readI16BE(dat,faderOffset);
    const faderDb=faderRaw===FADER_NEG_INF_RAW?null:faderRaw/256;
    const panRaw=dat[panOffset];
    const panPct=((panRaw-37)/37)*100;
    channels.push({
      channel:i+1,blockStart,blockSize,
      faderOffset,faderRaw,faderDb,faderInfinite:faderRaw===FADER_NEG_INF_RAW,
      panOffset,panRaw,panPct,
      panLabel:panRaw===37?'C':panRaw<37?`${Math.round(Math.abs(panPct))}% L`:`${Math.round(Math.abs(panPct))}% R`,
    });
  }
  return {frameStart,pos,payloadLength,stateStart,stateLength,headerLength,header,blockSize,blocksStart,writableShape,channels};
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
function faderRawHex(ch){
  const v=ch.faderRaw<0?ch.faderRaw+65536:ch.faderRaw;
  return `${hexByte(v>>8)} ${hexByte(v&255)}`;
}

function setInputFaderDb(channel,db){
  const mixer=ensureChannelState()?.mixer;
  const ch=mixer?.channels?.[Number(channel)-1];
  if(!mixer?.writableShape||!ch)return false;
  let value=Number(db);if(!Number.isFinite(value))return false;
  value=Math.max(FADER_MIN_VERIFIED_DB,Math.min(FADER_MAX_VERIFIED_DB,value));
  const raw=Math.round(value*256);
  writeI16BE(state.current.stage.datBytes,ch.faderOffset,raw);
  ch.faderRaw=raw;ch.faderDb=raw/256;ch.faderInfinite=false;
  markStageDirty();return true;
}

function setInputFaderInfinite(channel){
  const mixer=ensureChannelState()?.mixer;
  const ch=mixer?.channels?.[Number(channel)-1];
  if(!mixer?.writableShape||!ch)return false;
  writeI16BE(state.current.stage.datBytes,ch.faderOffset,FADER_NEG_INF_RAW);
  ch.faderRaw=FADER_NEG_INF_RAW;ch.faderDb=null;ch.faderInfinite=true;
  markStageDirty();return true;
}

function renderChannelState(){
  const root=$('#channelStateEditor');if(!root)return;
  const banner=$('#tabChannelstate .notice');
  if(banner){
    banner.className='notice safe';
    banner.innerHTML='<strong>Verified fader write:</strong> input fader location and encoding are isolated from controlled clones and survive different mixer configurations. Pan and compressor remain cross-checked read-only.';
  }
  root.innerHTML='';
  const decoded=ensureChannelState();
  if(!decoded?.mixer){root.innerHTML='<div class="notice warn">This scene does not match the validated Input Mixer framing.</div>';return;}
  const mixer=decoded.mixer;
  const inputs=state.current.stage.managers.find(x=>x.key==='inputs');

  const toolbar=document.createElement('section');toolbar.className='panel peq-toolbar';
  toolbar.innerHTML=`<div class="manager-head inline"><h2>Input channel</h2><span class="confidence ${mixer.writableShape?'verified':'decoded'}">${mixer.writableShape?'FADER VERIFIED WRITE':'READ ONLY'}</span></div>`;
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
      <div class="peq-field">
        <span>Fader <small>verified writer: −30…+10 dB, plus −∞</small></span>
        <div><input data-k="fader" type="number" min="${FADER_MIN_VERIFIED_DB}" max="${FADER_MAX_VERIFIED_DB}" step="0.1" value="${ch.faderInfinite?'':ch.faderDb.toFixed(2)}" placeholder="−∞"><b>dB</b> <button data-k="inf" type="button">Set −∞</button></div>
        <code>${faderRawHex(ch)}</code>
      </div>
      <div class="config-table">
        <div class="config-row"><strong>Fader decoded</strong><code>${faderRawHex(ch)}</code><span>${formatFaderDb(ch)}</span></div>
        <div class="config-row"><strong>Fader offset</strong><code>block + ${ch.blockSize-84}</code><span><code>blockSize − 84</code></span></div>
        <div class="config-row"><strong>Pan</strong><code>${hexByte(ch.panRaw)}</code><span>${ch.panLabel}</span></div>
        <div class="config-row"><strong>Pan offset</strong><code>block + ${ch.blockSize-82}</code><span><code>blockSize − 82</code></span></div>
        <div class="config-row"><strong>Compressor</strong><code>${comp?hexByte(comp.enableRaw):'—'}</code><span>${comp?(comp.enableKnown?(comp.active?'On':'Off'):'Unknown'):'Not found'}</span></div>
      </div>`;
    details.appendChild(panel);

    const faderInput=panel.querySelector('[data-k="fader"]'),infBtn=panel.querySelector('[data-k="inf"]');
    if(!mixer.writableShape){faderInput.disabled=true;infBtn.disabled=true;}
    faderInput.onchange=()=>{
      if(setInputFaderDb(ch.channel,faderInput.value))renderChannelState();
      else toast('Fader write blocked by structure validation.',true);
    };
    infBtn.onclick=()=>{
      if(setInputFaderInfinite(ch.channel))renderChannelState();
      else toast('Fader write blocked by structure validation.',true);
    };

    const evidence=document.createElement('section');evidence.className='panel';
    evidence.innerHTML=`
      <h2>Input Mixer structure</h2>
      <pre><code>12-byte mixer header
+ 128 × ${mixer.blockSize}-byte input blocks

faderOffset = blockStart + blockSize - 84</code></pre>
      <p>The real event show uses 169-byte blocks; Hardcore Start uses 224-byte blocks. The controlled CH16 scenes at −∞, −30, −20.3, −12.2, −5.9, approximately 0, +5 and +10 dB changed only the two bytes at <code>blockSize − 84</code>. Normal values are signed 8.8 fixed-point dB; <code>80 01</code> is the −∞ sentinel.</p>
      <div class="notice safe"><strong>Verified fader write:</strong> only the two fader bytes are modified. Pan, compressor and routing remain read-only.</div>`;
    details.appendChild(evidence);
  };
  select.onchange=draw;draw();
}

// This module loads after app-render-main.js. Extend scene rendering without
// changing the core renderer so the reverse-engineering inspector stays modular.
const renderSceneBeforeChannelState=renderScene;
renderScene=function(){renderSceneBeforeChannelState();renderChannelState();};
