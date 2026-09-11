'use strict';

// dLive 2.12 channel-state decoder/editor.
// Input Mixer layout has been validated across multiple real mixer configs:
//   12-byte mixer header + 128 equal-size per-input blocks.
// Fader and pan are fixed relative to the END of each variable-size block.
//
// Controlled Hardcore Start clones:
//   fader CH16 changed only blockSize-84..-83
//   pan   CH16 changed only blockSize-82
// This independently confirms both encodings and generic end-relative offsets.

const FADER_MIN_VERIFIED_DB=-30;
const FADER_MAX_VERIFIED_DB=10;
const FADER_NEG_INF_RAW=-32767; // 0x8001
const PAN_MIN_RAW=0;
const PAN_CENTRE_RAW=37;
const PAN_MAX_RAW=74;

function panPercentFromRaw(raw){return ((raw-PAN_CENTRE_RAW)/PAN_CENTRE_RAW)*100;}
function panRawFromPercent(percent){
  const p=Math.max(-100,Math.min(100,Math.trunc(Number(percent)||0)));
  return Math.max(PAN_MIN_RAW,Math.min(PAN_MAX_RAW,PAN_CENTRE_RAW+Math.trunc((p*PAN_CENTRE_RAW)/100)));
}
function panDisplay(raw){
  if(raw===PAN_CENTRE_RAW)return 'C';
  const p=panPercentFromRaw(raw);
  return p<0?`${Math.round(Math.abs(p))}% L`:`${Math.round(Math.abs(p))}% R`;
}

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
    const panPct=panPercentFromRaw(panRaw);
    channels.push({
      channel:i+1,blockStart,blockSize,
      faderOffset,faderRaw,faderDb,faderInfinite:faderRaw===FADER_NEG_INF_RAW,
      panOffset,panRaw,panPct,panLabel:panDisplay(panRaw),
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

function setInputPanPercent(channel,percent){
  const mixer=ensureChannelState()?.mixer;
  const ch=mixer?.channels?.[Number(channel)-1];
  if(!mixer?.writableShape||!ch)return false;
  const raw=panRawFromPercent(percent);
  state.current.stage.datBytes[ch.panOffset]=raw;
  ch.panRaw=raw;ch.panPct=panPercentFromRaw(raw);ch.panLabel=panDisplay(raw);
  markStageDirty();return true;
}

function renderChannelState(){
  const root=$('#channelStateEditor');if(!root)return;
  const banner=$('#tabChannelstate .notice');
  if(banner){
    banner.className='notice safe';
    banner.innerHTML='<strong>Verified write:</strong> input fader and pan are isolated from controlled clones and survive different mixer configurations. Compressor and routing remain cross-checked read-only.';
  }
  root.innerHTML='';
  const decoded=ensureChannelState();
  if(!decoded?.mixer){root.innerHTML='<div class="notice warn">This scene does not match the validated Input Mixer framing.</div>';return;}
  const mixer=decoded.mixer;
  const inputs=state.current.stage.managers.find(x=>x.key==='inputs');

  const toolbar=document.createElement('section');toolbar.className='panel peq-toolbar';
  toolbar.innerHTML=`<div class="manager-head inline"><h2>Input channel</h2><span class="confidence ${mixer.writableShape?'verified':'decoded'}">${mixer.writableShape?'FADER + PAN VERIFIED WRITE':'READ ONLY'}</span></div>`;
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
      <div class="peq-field">
        <span>Pan <small>verified writer: −100 = L, 0 = C, +100 = R</small></span>
        <div><input data-k="pan" type="number" min="-100" max="100" step="1" value="${Math.round(ch.panPct)}"><b>%</b></div>
        <code>${hexByte(ch.panRaw)}</code>
      </div>
      <div class="config-table">
        <div class="config-row"><strong>Fader decoded</strong><code>${faderRawHex(ch)}</code><span>${formatFaderDb(ch)}</span></div>
        <div class="config-row"><strong>Fader offset</strong><code>block + ${ch.blockSize-84}</code><span><code>blockSize − 84</code></span></div>
        <div class="config-row"><strong>Pan decoded</strong><code>${hexByte(ch.panRaw)}</code><span>${ch.panLabel}</span></div>
        <div class="config-row"><strong>Pan offset</strong><code>block + ${ch.blockSize-82}</code><span><code>blockSize − 82</code></span></div>
        <div class="config-row"><strong>Compressor</strong><code>${comp?hexByte(comp.enableRaw):'—'}</code><span>${comp?(comp.enableKnown?(comp.active?'On':'Off'):'Unknown'):'Not found'}</span></div>
      </div>`;
    details.appendChild(panel);

    const faderInput=panel.querySelector('[data-k="fader"]'),infBtn=panel.querySelector('[data-k="inf"]'),panInput=panel.querySelector('[data-k="pan"]');
    if(!mixer.writableShape){faderInput.disabled=true;infBtn.disabled=true;panInput.disabled=true;}
    faderInput.onchange=()=>{
      if(setInputFaderDb(ch.channel,faderInput.value))renderChannelState();
      else toast('Fader write blocked by structure validation.',true);
    };
    infBtn.onclick=()=>{
      if(setInputFaderInfinite(ch.channel))renderChannelState();
      else toast('Fader write blocked by structure validation.',true);
    };
    panInput.onchange=()=>{
      if(setInputPanPercent(ch.channel,panInput.value))renderChannelState();
      else toast('Pan write blocked by structure validation.',true);
    };

    const evidence=document.createElement('section');evidence.className='panel';
    evidence.innerHTML=`
      <h2>Input Mixer structure</h2>
      <pre><code>12-byte mixer header
+ 128 × ${mixer.blockSize}-byte input blocks

faderOffset = blockStart + blockSize - 84
panOffset   = blockStart + blockSize - 82</code></pre>
      <p>Controlled fader scenes changed only the two fader bytes. Controlled pan scenes changed only the single pan byte and produced <code>00</code> (100L), <code>13</code> (50L), <code>24</code> (near-centre clone), <code>37</code> (50R) and <code>4A</code> (100R). The original Scene 10 centre is <code>25</code>, confirming the canonical centre code.</p>
      <div class="notice safe"><strong>Verified fader + pan write:</strong> only the mapped bytes are modified. Compressor and routing remain read-only.</div>`;
    details.appendChild(evidence);
  };
  select.onchange=draw;draw();
}

// This module loads after app-render-main.js. Extend scene rendering without
// changing the core renderer so the reverse-engineering inspector stays modular.
const renderSceneBeforeChannelState=renderScene;
renderScene=function(){renderSceneBeforeChannelState();renderChannelState();};
