'use strict';

// dLive 2.12 channel-state decoder/editor.
// Input Mixer layout has been validated across multiple real mixer configs:
//   12-byte mixer header + 128 equal-size per-input blocks.
// Fader and pan are fixed relative to the END of each variable-size block.
//
// Controlled Hardcore Start clones:
//   fader CH16 changed only blockSize-84..-83
//   pan   CH16 changed only blockSize-82
//   comp  CH16 changed only Compressor state+2 (00 Off / 01 On)
// This independently confirms the narrow write boundaries used below.

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
    const enableKnown=enableRaw===0||enableRaw===1;
    // Current dLive 2.12 input-compressor shape used by the controlled tests.
    // Other compressor models remain readable but are blocked from writes if the
    // record shape/discriminator does not match this verified form.
    const writableShape=typeRaw===0x08&&stateLength===127&&enableKnown;
    out.push({channel,frameStart,payloadLength,stateStart,stateLength,typeRaw,modelRaw,enableRaw,active:enableRaw===1,enableKnown,writableShape});
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

function setInputCompressorActive(channel,on){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.writableShape)return false;
  const raw=on?1:0;
  state.current.stage.datBytes[comp.stateStart+2]=raw;
  comp.enableRaw=raw;comp.active=!!on;comp.enableKnown=true;
  markStageDirty();return true;
}

function renderChannelState(){
  const root=$('#channelStateEditor');if(!root)return;
  const banner=$('#tabChannelstate .notice');
  if(banner){
    banner.className='notice safe';
    banner.innerHTML='<strong>Verified write:</strong> input fader, pan and compressor On/Off are isolated with controlled scene clones. Routing/send fields remain read-only.';
  }
  root.innerHTML='';
  const decoded=ensureChannelState();
  if(!decoded?.mixer){root.innerHTML='<div class="notice warn">This scene does not match the validated Input Mixer framing.</div>';return;}
  const mixer=decoded.mixer;
  const inputs=state.current.stage.managers.find(x=>x.key==='inputs');

  const toolbar=document.createElement('section');toolbar.className='panel peq-toolbar';
  toolbar.innerHTML=`<div class="manager-head inline"><h2>Input channel</h2><span class="confidence ${mixer.writableShape?'verified':'decoded'}">${mixer.writableShape?'FADER + PAN + COMP VERIFIED WRITE':'READ ONLY'}</span></div>`;
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
      <div class="peq-field">
        <span>Compressor <small>verified On/Off byte only; model/parameters preserved</small></span>
        <select data-k="comp"><option value="1">On</option><option value="0">Off</option></select>
        <code>${comp?hexByte(comp.enableRaw):'—'}</code>
      </div>
      <div class="config-table">
        <div class="config-row"><strong>Fader decoded</strong><code>${faderRawHex(ch)}</code><span>${formatFaderDb(ch)}</span></div>
        <div class="config-row"><strong>Fader offset</strong><code>block + ${ch.blockSize-84}</code><span><code>blockSize − 84</code></span></div>
        <div class="config-row"><strong>Pan decoded</strong><code>${hexByte(ch.panRaw)}</code><span>${ch.panLabel}</span></div>
        <div class="config-row"><strong>Pan offset</strong><code>block + ${ch.blockSize-82}</code><span><code>blockSize − 82</code></span></div>
        <div class="config-row"><strong>Compressor enable</strong><code>${comp?`state + 2 = ${hexByte(comp.enableRaw)}`:'—'}</code><span>${comp?(comp.enableKnown?(comp.active?'On':'Off'):'Unknown'):'Not found'}</span></div>
        <div class="config-row"><strong>Compressor model</strong><code>${comp?hexByte(comp.modelRaw):'—'}</code><span>read-only / model semantics still under investigation</span></div>
      </div>`;
    details.appendChild(panel);

    const faderInput=panel.querySelector('[data-k="fader"]'),infBtn=panel.querySelector('[data-k="inf"]'),panInput=panel.querySelector('[data-k="pan"]'),compSelect=panel.querySelector('[data-k="comp"]');
    if(!mixer.writableShape){faderInput.disabled=true;infBtn.disabled=true;panInput.disabled=true;}
    if(comp){compSelect.value=comp.active?'1':'0';}
    if(!comp?.writableShape){compSelect.disabled=true;}
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
    compSelect.onchange=()=>{
      if(setInputCompressorActive(ch.channel,compSelect.value==='1'))renderChannelState();
      else toast('Compressor write blocked by structure validation.',true);
    };

    const evidence=document.createElement('section');evidence.className='panel';
    evidence.innerHTML=`
      <h2>Controlled verification</h2>
      <pre><code>faderOffset = blockStart + blockSize - 84
panOffset   = blockStart + blockSize - 82
compressor  = Compressor record state + 2</code></pre>
      <p>Controlled fader scenes changed only the two fader bytes. Controlled pan scenes changed only the single pan byte. The clean compressor pair <code>Comp 2 On</code>/<code>Comp 2 Off</code> changed only compressor state byte <code>+2</code> outside the scene label: <code>01</code> On and <code>00</code> Off.</p>
      <div class="notice safe"><strong>Verified writes:</strong> fader, pan and compressor On/Off modify only their mapped fields. Compressor model and dynamics parameters, plus routing/send state, remain read-only.</div>`;
    details.appendChild(evidence);
  };
  select.onchange=draw;draw();
}

// This module loads after app-render-main.js. Extend scene rendering without
// changing the core renderer so the reverse-engineering inspector stays modular.
const renderSceneBeforeChannelState=renderScene;
renderScene=function(){renderSceneBeforeChannelState();renderChannelState();};
