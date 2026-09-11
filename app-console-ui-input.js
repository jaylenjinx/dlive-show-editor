'use strict';

// Console-style surfaces for the newly verified input processing/routing maps.
function ipConsoleField(label,key,value,unit,min,max,step,disabled=false){
  return `<label>${safeText(label)}<div class="console-value-row"><input data-k="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${value}"><span>${safeText(unit)}</span></div></label>`;
}
function ipPopulateTimeSelect(select,map,currentRaw,currentExact){
  select.innerHTML=[...map.entries()].map(([ms,raw])=>`<option value="${raw}">${safeText(ipTimeLabel(ms))}</option>`).join('');
  if(currentExact)select.value=String(currentRaw);else injectCurrentOption(select,`Current raw ${ipU16Hex(currentRaw)}`);
}
function ipRenderGateGraph(svg,gate){
  const W=650,H=340,pad=42;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.innerHTML='';
  svg.appendChild(svgEl('rect',{x:0,y:0,width:W,height:H,class:'console-graph-bg'}));
  const xFor=db=>pad+((clamp(db,-80,12)+80)/92)*(W-pad*2),yFor=db=>H-pad-((clamp(db,-80,12)+80)/92)*(H-pad*2);
  for(const db of [-80,-60,-40,-20,0,10]){const x=xFor(db),y=yFor(db);svg.appendChild(svgEl('line',{x1:x,y1:pad,x2:x,y2:H-pad,class:'console-grid-line'}));svg.appendChild(svgEl('line',{x1:pad,y1:y,x2:W-pad,y2:y,class:'console-grid-line'}));}
  const threshold=Number(gate.thresholdDb),depth=Number(gate.depthDb),pts=[];
  for(let xdb=-80;xdb<=12;xdb+=.5){const out=xdb>=threshold?xdb:Math.max(-80,xdb-depth);pts.push([xFor(xdb),yFor(out)]);}
  svg.appendChild(svgEl('path',{d:pathFromPoints(pts),class:'console-gate-curve'}));
  const tx=xFor(threshold),ty=yFor(threshold);svg.appendChild(svgEl('circle',{cx:tx,cy:ty,r:9,class:'console-gate-handle'}));
}
function renderGateConsole(root,gate){
  if(!gate){root.insertAdjacentHTML('beforeend','<div class="notice warn">No Gate record found for this input.</div>');return;}
  const shell=document.createElement('section');shell.className='dlive-console-frame gate-console';
  shell.innerHTML=`
    <div class="console-section-head"><div><span class="console-kicker">INPUT GATE</span><strong>CH ${gate.channel}${channelName(gate.channel)?` · ${safeText(channelName(gate.channel))}`:''}</strong></div><div data-k="gate-toggle"></div></div>
    <div class="console-gate-main">
      <section class="console-transfer-panel"><div class="console-subhead"><span>Transfer</span><span class="confidence verified">CONTROLLED-DIFF VERIFIED</span></div><svg class="console-gate-svg"></svg></section>
      <section class="console-gate-controls">
        ${ipConsoleField('Threshold','gate-threshold',gate.thresholdDb.toFixed(2),'dB',IP_GATE_THRESHOLD_MIN_DB,IP_GATE_THRESHOLD_MAX_DB,.1)}
        ${ipConsoleField('Depth','gate-depth',gate.depthDb.toFixed(2),'dB',IP_GATE_DEPTH_MIN_DB,IP_GATE_DEPTH_MAX_DB,.1)}
        <label>Attack<select data-k="gate-attack"></select></label>
        <label>Hold<select data-k="gate-hold"></select></label>
        <label>Release<select data-k="gate-release"></select></label>
      </section>
    </div>
    <div class="console-note">Threshold and Depth use the verified signed /256 dB format. Attack/Hold/Release writes are restricted to exact controlled scene anchors until the complete time-coordinate rounding rule is proven.</div>`;
  root.appendChild(shell);ipRenderGateGraph(shell.querySelector('.console-gate-svg'),gate);
  const toggleHost=shell.querySelector('[data-k="gate-toggle"]');toggleHost.appendChild(makeToggle(gate.active?'Gate In':'Gate Out',gate.active,!gate.writableShape,()=>{if(setInputGateActive(gate.channel,!gate.active))triggerConsoleRerender();else toast('Gate On/Off write blocked.',true);}));
  const th=shell.querySelector('[data-k="gate-threshold"]'),depth=shell.querySelector('[data-k="gate-depth"]');th.disabled=depth.disabled=!gate.writableShape;
  th.onchange=()=>{if(setInputGateThreshold(gate.channel,th.value))triggerConsoleRerender();else toast('Gate threshold write blocked.',true);};
  depth.onchange=()=>{if(setInputGateDepth(gate.channel,depth.value))triggerConsoleRerender();else toast('Gate depth write blocked.',true);};
  const atk=shell.querySelector('[data-k="gate-attack"]'),hold=shell.querySelector('[data-k="gate-hold"]'),rel=shell.querySelector('[data-k="gate-release"]');
  ipPopulateTimeSelect(atk,IP_GATE_ATTACK_MS_TO_RAW,gate.attackRaw,gate.attackExact);ipPopulateTimeSelect(hold,IP_GATE_HOLD_MS_TO_RAW,gate.holdRaw,gate.holdExact);ipPopulateTimeSelect(rel,IP_GATE_RELEASE_MS_TO_RAW,gate.releaseRaw,gate.releaseExact);
  atk.disabled=hold.disabled=rel.disabled=!gate.writableShape;
  atk.onchange=()=>{if(setInputGateTime(gate.channel,'attack',atk.value))triggerConsoleRerender();};hold.onchange=()=>{if(setInputGateTime(gate.channel,'hold',hold.value))triggerConsoleRerender();};rel.onchange=()=>{if(setInputGateTime(gate.channel,'release',rel.value))triggerConsoleRerender();};
}

function renderPreampConsole(root,channel){
  const att=getInputAttenuator(channel),stereo=getInputStereoImage(channel),processing=ensureInputProcessing();
  const desiredSocket=Number(root.dataset.preampSocket||channel);let preamp=getStageBoxAnalogueInput(desiredSocket);if(!preamp)preamp=processing?.analogueInputs?.[0]||null;
  const shell=document.createElement('section');shell.className='dlive-console-frame preamp-console';
  shell.innerHTML=`
    <div class="console-section-head"><div><span class="console-kicker">INPUT / PREAMP</span><strong>CH ${channel}${channelName(channel)?` · ${safeText(channelName(channel))}`:''}</strong></div><span class="confidence verified">VERIFIED WRITERS</span></div>
    <div class="console-input-grid">
      <section class="console-processing-card"><div class="console-subhead"><span>Digital input</span></div>
        ${att?ipConsoleField('Trim','input-trim',att.trimDb.toFixed(2),'dB',IP_TRIM_MIN_DB,IP_TRIM_MAX_DB,.1):'<div class="console-readonly-chip">No Digital Attenuator record</div>'}
        <div data-k="polarity-toggle"></div>
      </section>
      <section class="console-processing-card"><div class="console-subhead"><span>StageBox analogue socket</span><select data-k="preamp-socket"></select></div>
        ${preamp?ipConsoleField('Gain','preamp-gain',preamp.gainDb.toFixed(2),'dB',IP_PREAMP_GAIN_MIN_DB,IP_PREAMP_GAIN_MAX_DB,.1):'<div class="console-readonly-chip">No analogue socket record</div>'}
        <div class="console-button-pair"><div data-k="pad-toggle"></div><div data-k="phantom-toggle"></div></div>
        <small class="console-inline-note">Socket control is physical I/O state. It is deliberately selected separately from the input channel so the editor does not assume a 1:1 patch.</small>
      </section>
      <section class="console-processing-card"><div class="console-subhead"><span>Stereo Image</span></div>
        ${stereo?`${ipConsoleField('Width','stereo-width',stereo.widthPercent,'% ',0,100,1)}<label>Mode<select data-k="stereo-mode">${[...IP_STEREO_IMAGE_MODE_LABELS.entries()].map(([raw,label])=>`<option value="${raw}">${safeText(label)}</option>`).join('')}</select></label>`:'<div class="console-readonly-chip">No Stereo Image record</div>'}
        <small class="console-inline-note">dLive mirrored the controlled CH17/18 stereo values into both records. This editor writes only the selected input record until stereo-pair membership is explicitly decoded.</small>
      </section>
    </div>`;
  root.appendChild(shell);
  if(att){const trim=shell.querySelector('[data-k="input-trim"]');trim.disabled=!att.writableShape;trim.onchange=()=>{if(setInputTrimDb(channel,trim.value))triggerConsoleRerender();};const ph=shell.querySelector('[data-k="polarity-toggle"]');ph.appendChild(makeToggle(att.polarityReversed?'Polarity Rev':'Polarity Norm',att.polarityReversed,!att.writableShape,()=>{if(setInputPolarity(channel,!att.polarityReversed))triggerConsoleRerender();}));}
  const socketSel=shell.querySelector('[data-k="preamp-socket"]');for(const p of processing?.analogueInputs||[]){const o=document.createElement('option');o.value=p.socket;o.textContent=`Socket ${p.socket}`;socketSel.appendChild(o);}if(preamp){socketSel.value=String(preamp.socket);root.dataset.preampSocket=String(preamp.socket);}socketSel.onchange=()=>{root.dataset.preampSocket=socketSel.value;renderConsoleEditor();};
  if(preamp){const gain=shell.querySelector('[data-k="preamp-gain"]');gain.disabled=!preamp.writableShape;gain.onchange=()=>{if(setStageBoxPreampGain(preamp.socket,gain.value))triggerConsoleRerender();};shell.querySelector('[data-k="pad-toggle"]').appendChild(makeToggle(preamp.padOn?'Pad On':'Pad Off',preamp.padOn,!preamp.writableShape,()=>{if(setStageBoxPreampPad(preamp.socket,!preamp.padOn))triggerConsoleRerender();}));shell.querySelector('[data-k="phantom-toggle"]').appendChild(makeToggle(preamp.phantomOn?'48V On':'48V Off',preamp.phantomOn,!preamp.writableShape,()=>{if(setStageBoxPreampPhantom(preamp.socket,!preamp.phantomOn))triggerConsoleRerender();}));}
  if(stereo){const width=shell.querySelector('[data-k="stereo-width"]'),mode=shell.querySelector('[data-k="stereo-mode"]');width.disabled=mode.disabled=!stereo.writableShape;mode.value=String(stereo.modeRaw);width.onchange=()=>{if(setInputStereoWidth(channel,width.value))triggerConsoleRerender();};mode.onchange=()=>{if(setInputStereoMode(channel,mode.value))triggerConsoleRerender();};}
}

function renderDelayConsole(root,delay){
  if(!delay){root.insertAdjacentHTML('beforeend','<div class="notice warn">No input Delay record found.</div>');return;}
  const shell=document.createElement('section');shell.className='dlive-console-frame delay-console';shell.innerHTML=`<div class="console-section-head"><div><span class="console-kicker">INPUT DELAY</span><strong>CH ${delay.channel}${channelName(delay.channel)?` · ${safeText(channelName(delay.channel))}`:''}</strong></div><div data-k="delay-toggle"></div></div><div class="console-delay-body"><div class="console-delay-value">${delay.delayMs.toFixed(2)}<small>ms</small></div>${ipConsoleField('Delay','delay-ms',delay.delayMs.toFixed(2),'ms',IP_DELAY_MIN_MS,IP_DELAY_MAX_MS,.01)}</div><div class="console-note">Controlled anchors from 0 to 340 ms prove <code>raw = delay_ms × 96</code>; the writer emits that exact linear coordinate.</div>`;root.appendChild(shell);
  shell.querySelector('[data-k="delay-toggle"]').appendChild(makeToggle(delay.active?'Delay In':'Delay Out',delay.active,!delay.writableShape,()=>{if(setInputDelayActive(delay.channel,!delay.active))triggerConsoleRerender();}));const input=shell.querySelector('[data-k="delay-ms"]');input.disabled=!delay.writableShape;input.onchange=()=>{if(setInputDelayMs(delay.channel,input.value))triggerConsoleRerender();};
}

function renderRoutingConsole(root,channel){
  const r=getControlledInputRouting(channel);if(!r){root.insertAdjacentHTML('beforeend','<div class="notice warn">Input Mixer routing state not available.</div>');return;}
  const levelValue=x=>x.infinite?'':Number(x.db).toFixed(2);
  const shell=document.createElement('section');shell.className='dlive-console-frame routing-console';shell.innerHTML=`
    <div class="console-section-head"><div><span class="console-kicker">INPUT ROUTING</span><strong>CH ${channel}${channelName(channel)?` · ${safeText(channelName(channel))}`:''}</strong></div><span class="confidence ${r.writableShape?'verified':'unknown'}">${r.writableShape?'VERIFIED 208-BYTE MIXCONFIG':'READ ONLY — DIFFERENT MIXCONFIG'}</span></div>
    <div class="console-routing-grid">
      <section class="console-processing-card"><div class="console-subhead"><span>Assignments</span></div><div class="console-button-pair"><div data-k="g1-toggle"></div><div data-k="sg1-toggle"></div></div></section>
      <section class="console-processing-card"><div class="console-subhead"><span>Mono Aux 1</span><div data-k="a1-toggle"></div></div>${ipConsoleField('Level','a1-level',levelValue(r.aux1),'dB',-30,10,.1)}<div data-k="a1-pre"></div></section>
      <section class="console-processing-card"><div class="console-subhead"><span>Mono Aux 2</span></div>${ipConsoleField('Level','a2-level',levelValue(r.aux2),'dB',-20,0,.1)}<small class="console-inline-note">Only level is currently verified for Aux 2.</small></section>
      <section class="console-processing-card"><div class="console-subhead"><span>Stereo Aux 1</span></div>${ipConsoleField('Level','sa1-level',levelValue(r.stereoAux1),'dB',-20,0,.1)}<small class="console-inline-note">Only level is currently verified for Stereo Aux 1.</small></section>
    </div><div class="console-note">Routing writes are intentionally enabled only for the exact controlled 208-byte Input Mixer configuration/header. Other MixConfigs remain untouched until the variable bus-layout rule is solved.</div>`;root.appendChild(shell);
  const disabled=!r.writableShape;
  shell.querySelector('[data-k="g1-toggle"]').appendChild(makeToggle(r.monoGroup1.on?'Mono G1 On':'Mono G1 Off',r.monoGroup1.on,disabled||!r.monoGroup1.known,()=>{if(setControlledRoutingToggle(channel,'monoGroup1',!r.monoGroup1.on))triggerConsoleRerender();}));
  shell.querySelector('[data-k="sg1-toggle"]').appendChild(makeToggle(r.stereoGroup1.on?'Stereo G1 On':'Stereo G1 Off',r.stereoGroup1.on,disabled||!r.stereoGroup1.known,()=>{if(setControlledRoutingToggle(channel,'stereoGroup1',!r.stereoGroup1.on))triggerConsoleRerender();}));
  shell.querySelector('[data-k="a1-toggle"]').appendChild(makeToggle(r.aux1.on?'On':'Off',r.aux1.on,disabled||!r.aux1.enableKnown,()=>{if(setControlledRoutingToggle(channel,'aux1',!r.aux1.on))triggerConsoleRerender();}));
  shell.querySelector('[data-k="a1-pre"]').appendChild(makeToggle(r.aux1.pre?'Pre':'Post',r.aux1.pre,disabled||!r.aux1.prepostKnown,()=>{if(setControlledAux1Pre(channel,!r.aux1.pre))triggerConsoleRerender();}));
  for(const [key,kind] of [['a1-level','aux1'],['a2-level','aux2'],['sa1-level','stereoAux1']]){const input=shell.querySelector(`[data-k="${key}"]`);input.disabled=disabled;input.onchange=()=>{if(setControlledSendLevel(channel,kind,input.value===''?'-inf':input.value))triggerConsoleRerender();};}
}
