'use strict';

function batch3SelectOptions(map,formatKey){return [...map.entries()].map(([key,value])=>`<option value="${key}">${safeText(formatKey?formatKey(key,value):value)}</option>`).join('');}
function batch3FreqOptions(map){return [...map.keys()].map(hz=>`<option value="${hz}">${safeText(formatHz(hz))}</option>`).join('');}

function renderGateScGraph(svg,sc){
  if(!svg||!sc)return;const W=520,H=220,padX=34,padY=24;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.innerHTML='';svg.appendChild(svgEl('rect',{x:0,y:0,width:W,height:H,class:'console-graph-bg'}));
  for(const f of [50,100,500,1000,5000,10000,20000]){const x=logX(f,W,padX);svg.appendChild(svgEl('line',{x1:x,y1:padY,x2:x,y2:H-padY,class:'console-grid-line'}));}
  for(const db of [0,-6,-12,-20]){const y=padY+(-db/24)*(H-padY*2);svg.appendChild(svgEl('line',{x1:padX,y1:y,x2:W-padX,y2:y,class:db===0?'console-grid-zero':'console-grid-line'}));}
  const pts=[];for(let i=0;i<=240;i++){const x=padX+i/240*(W-padX*2),hz=invLogX(x,W,padX);let db=0;if(sc.loTypeRaw===0x04&&hz<sc.loFreqHz)db+=Math.max(-24,12*Math.log2(hz/sc.loFreqHz));if(sc.hiTypeRaw===0x03&&hz>sc.hiFreqHz)db+=Math.max(-24,-12*Math.log2(hz/sc.hiFreqHz));db=clamp(db,-24,0);const y=padY+(-db/24)*(H-padY*2);pts.push([x,y]);}svg.appendChild(svgEl('path',{d:pathFromPoints(pts),class:'console-sidechain-curve'}));
}

const renderGateConsoleBeforeBatch3=renderGateConsole;
renderGateConsole=function(root,gate){
  renderGateConsoleBeforeBatch3(root,gate);if(!gate)return;
  const shell=[...root.querySelectorAll('.gate-console')].pop();if(!shell)return;
  const sc=getInputGateSidechainFilter(gate.channel),src=getInputGateSidechainSource(gate.channel);if(!sc&&!src)return;
  const panel=document.createElement('section');panel.className='console-gate-sidechain';
  const sourceOptions=GATE_SC_SOURCE_TESTED.map(x=>`<option value="${gateScSourceValue(x.type,x.index)}">${safeText(x.label)}</option>`).join('');
  panel.innerHTML=`<div class="console-subhead"><span>Side Chain</span><span class="confidence verified">CONTROLLED-DIFF VERIFIED</span></div>
    <div class="console-gate-sc-grid">
      <div class="console-processing-card"><label>Source<select data-k="gate-sc-source">${sourceOptions}</select></label><div data-k="gate-sc-filter-toggle"></div><small class="console-inline-note">Exact tested source selections only.</small></div>
      <div class="console-processing-card"><label>Low filter<select data-k="gate-sc-lo">${batch3FreqOptions(GATE_SC_LO_HZ_TO_RAW)}</select></label><div class="console-readonly-chip">Type raw ${sc?hexByte(sc.loTypeRaw):'—'} · ${sc?.loTypeRaw===0x04?'Lo-Cut':'read only'}</div></div>
      <div class="console-processing-card"><label>High filter<select data-k="gate-sc-hi">${batch3FreqOptions(GATE_SC_HI_HZ_TO_RAW)}</select></label><div class="console-readonly-chip">Type raw ${sc?hexByte(sc.hiTypeRaw):'—'} · ${sc?.hiTypeRaw===0x03?'Hi-Cut':'read only'}</div></div>
      <div class="console-processing-card"><div class="console-subhead"><span>Located / pending sweep</span></div><div class="console-readonly-chip">BPF / notch toggle: state +20 = ${sc?hexByte(sc.middleRaw):'—'}</div><div class="console-readonly-chip">BPF freq: state +21..22 = ${sc?gateScRawHex(sc.bpfFreqRaw):'—'}</div></div>
    </div>
    ${sc?'<svg class="console-gate-sc-svg"></svg>':''}
    <div class="console-note">Low/high frequency and Filter In/Out are verified writes. Filter types and the BPF/notch fields are shown read-only until their own one-parameter scenes are captured.</div>`;
  const note=shell.querySelector('.console-note');if(note)note.insertAdjacentElement('beforebegin',panel);else shell.appendChild(panel);
  if(sc)renderGateScGraph(panel.querySelector('.console-gate-sc-svg'),sc);
  const sourceSel=panel.querySelector('[data-k="gate-sc-source"]');if(src){const current=gateScSourceValue(src.typeRaw,src.indexRaw);if(GATE_SC_SOURCE_TESTED.some(x=>gateScSourceValue(x.type,x.index)===current))sourceSel.value=current;else injectCurrentOption(sourceSel,`Current ${src.typeLabel} ${src.indexRaw+1} (untested)`);sourceSel.disabled=!src.writableShape;sourceSel.onchange=()=>{const [type,index]=sourceSel.value.split(':').map(Number);if(setInputGateSidechainSource(gate.channel,type,index))triggerConsoleRerender();else toast('Gate sidechain source write blocked.',true);};}else sourceSel.disabled=true;
  const toggleHost=panel.querySelector('[data-k="gate-sc-filter-toggle"]');if(sc)toggleHost.appendChild(makeToggle(sc.filterActive?'Filter In':'Filter Out',sc.filterActive,!sc.writableShape||!sc.filterKnown,()=>{if(setInputGateSidechainFilterActive(gate.channel,!sc.filterActive))triggerConsoleRerender();else toast('Gate sidechain Filter write blocked.',true);}));else toggleHost.textContent='Filter record not found';
  for(const [key,kind,map] of [['gate-sc-lo','lo',GATE_SC_LO_RAW_TO_HZ],['gate-sc-hi','hi',GATE_SC_HI_RAW_TO_HZ]]){const sel=panel.querySelector(`[data-k="${key}"]`);if(!sc){sel.disabled=true;continue;}const raw=kind==='lo'?sc.loFreqRaw:sc.hiFreqRaw;if(map.has(raw))sel.value=String(map.get(raw));else injectCurrentOption(sel,`Current ≈ ${formatHz(kind==='lo'?sc.loFreqHz:sc.hiFreqHz)} (untested raw)`);sel.disabled=!sc.writableShape;sel.onchange=()=>{if(setInputGateSidechainFrequency(gate.channel,kind,sel.value))triggerConsoleRerender();else toast('Gate sidechain frequency write blocked: use an exact controlled anchor.',true);};}
};

function patchManualPeakConsole(shell,comp){
  const ratio=shell.querySelector('[data-k="ratio"]'),attack=shell.querySelector('[data-k="attack"]'),release=shell.querySelector('[data-k="release"]'),makeup=shell.querySelector('[data-k="makeup"]');
  if(ratio){ratio.innerHTML=batch3SelectOptions(COMP_MP_RATIO_RAW_TO_LABEL);if(COMP_MP_RATIO_RAW_TO_LABEL.has(comp.ratioRaw))ratio.value=String(comp.ratioRaw);else injectCurrentOption(ratio,`Current raw 0x${hexByte(comp.ratioRaw)} (unmapped)`);ratio.disabled=!comp.mpRatioWritableShape;ratio.onchange=()=>{if(setInputCompressorRatioRaw(comp.channel,ratio.value))triggerConsoleRerender();};}
  if(attack){attack.innerHTML=batch3SelectOptions(COMP_MP_ATTACK_RAW_TO_MS,(raw,ms)=>compFormatTimeMs(ms));if(COMP_MP_ATTACK_RAW_TO_MS.has(comp.attackRaw))attack.value=String(comp.attackRaw);else injectCurrentOption(attack,`Current ≈ ${compFormatTimeMs(Number(comp.attackMs.toPrecision(3)))} (unmapped)`);attack.disabled=!comp.mpTimeWritableShape;attack.onchange=()=>{if(setInputCompressorTimeRaw(comp.channel,'attack',attack.value))triggerConsoleRerender();};}
  if(release){release.innerHTML=batch3SelectOptions(COMP_MP_RELEASE_RAW_TO_MS,(raw,ms)=>compFormatTimeMs(ms));if(COMP_MP_RELEASE_RAW_TO_MS.has(comp.releaseRaw))release.value=String(comp.releaseRaw);else injectCurrentOption(release,`Current ≈ ${compFormatTimeMs(Number(comp.releaseMs.toPrecision(3)))} (unmapped)`);release.disabled=!comp.mpTimeWritableShape;release.onchange=()=>{if(setInputCompressorTimeRaw(comp.channel,'release',release.value))triggerConsoleRerender();};}
  if(makeup){makeup.min=COMP_MP_GAIN_MIN_DB;makeup.max=COMP_MP_GAIN_MAX_DB;makeup.disabled=!comp.mpGainWritableShape;makeup.onchange=()=>{if(setInputCompressorMakeup(comp.channel,makeup.value))triggerConsoleRerender();else toast('Manual Peak gain write blocked.',true);};}
  const note=document.createElement('div');note.className='console-model-specific-note';note.textContent='Manual Peak cross-check: threshold −40…0 dB, ratio 2:1 / 20:1, attack 30 µs / 100 ms, release 50 ms / 1 s and gain 0…+12 dB are independently verified. Other values stay guarded.';shell.querySelector('.console-comp-main')?.insertAdjacentElement('afterend',note);
}

function injectOptoConsole(shell,comp){
  for(const key of ['ratio','makeup']){const el=shell.querySelector(`[data-k="${key}"]`);if(el?.closest('label'))el.closest('label').style.display='none';}
  const timePair=shell.querySelector('[data-k="attack"]')?.closest('.console-time-pair');if(timePair)timePair.style.display='none';
  const knee=shell.querySelector('[data-k="knee-toggle"]');if(knee)knee.style.display='none';
  const panel=document.createElement('section');panel.className='console-model-specific opto-model-panel';
  panel.innerHTML=`<div class="console-subhead"><span>Opto model controls</span><span class="confidence verified">VERIFIED WRITE</span></div><div class="console-model-control-grid">
    <label>Attack<select data-k="opto-attack">${batch3SelectOptions(COMP_OPTO_ATTACK_LABELS)}</select></label>
    <label>Recovery<select data-k="opto-recovery">${batch3SelectOptions(COMP_OPTO_RECOVERY_LABELS)}</select></label>
    <label>Ratio<select data-k="opto-ratio">${batch3SelectOptions(COMP_OPTO_RATIO_RAW_TO_LABEL)}</select></label>
    <label>Gain<div class="console-value-row"><input data-k="opto-gain" type="number" min="-18" max="18" step="0.1" value="${comp.optoGainDb?.toFixed(2)??''}"><span>dB</span></div></label>
    <div data-k="opto-transient"></div><div data-k="opto-burn"></div>
  </div><div class="console-note">Attack/Recovery are exact Fast/Medium/Slow enums. Opto Ratio uses its own seven-value table at state +15; Gain is signed /256 dB over −18…+18 dB.</div>`;
  shell.querySelector('.console-comp-main')?.insertAdjacentElement('afterend',panel);
  const atk=panel.querySelector('[data-k="opto-attack"]'),rec=panel.querySelector('[data-k="opto-recovery"]'),ratio=panel.querySelector('[data-k="opto-ratio"]'),gain=panel.querySelector('[data-k="opto-gain"]');
  if(COMP_OPTO_ATTACK_LABELS.has(comp.optoAttackRaw))atk.value=String(comp.optoAttackRaw);else injectCurrentOption(atk,comp.optoAttackLabel||'Unknown');
  if(COMP_OPTO_RECOVERY_LABELS.has(comp.optoRecoveryRaw))rec.value=String(comp.optoRecoveryRaw);else injectCurrentOption(rec,comp.optoRecoveryLabel||'Unknown');
  if(COMP_OPTO_RATIO_RAW_TO_LABEL.has(comp.optoRatioRaw))ratio.value=String(comp.optoRatioRaw);else injectCurrentOption(ratio,comp.optoRatioLabel||'Unknown');
  atk.disabled=rec.disabled=!comp.optoWritableShape;ratio.disabled=!comp.optoRatioWritableShape;gain.disabled=!comp.optoGainWritableShape;
  atk.onchange=()=>{if(setInputCompressorOptoMode(comp.channel,'attack',atk.value))triggerConsoleRerender();};rec.onchange=()=>{if(setInputCompressorOptoMode(comp.channel,'recovery',rec.value))triggerConsoleRerender();};ratio.onchange=()=>{if(setInputCompressorOptoRatio(comp.channel,ratio.value))triggerConsoleRerender();};gain.onchange=()=>{if(setInputCompressorOptoGain(comp.channel,gain.value))triggerConsoleRerender();};
  panel.querySelector('[data-k="opto-transient"]').appendChild(makeToggle(comp.optoTransientActive?'Transient On':'Transient Off',comp.optoTransientActive,!comp.optoWritableShape||!comp.optoTransientKnown,()=>{if(setInputCompressorOptoToggle(comp.channel,'transient',!comp.optoTransientActive))triggerConsoleRerender();}));
  panel.querySelector('[data-k="opto-burn"]').appendChild(makeToggle(comp.optoBurnActive?'Burn On':'Burn Off',comp.optoBurnActive,!comp.optoWritableShape||!comp.optoBurnKnown,()=>{if(setInputCompressorOptoToggle(comp.channel,'burn',!comp.optoBurnActive))triggerConsoleRerender();}));
}

const renderCompressorConsoleBeforeBatch3=renderCompressorConsole;
renderCompressorConsole=function(root,comp){
  renderCompressorConsoleBeforeBatch3(root,comp);const shell=[...root.querySelectorAll('.compressor-console')].pop();if(!shell)return;
  if(comp.modelRaw===COMP_MANUAL_PEAK_MODEL)patchManualPeakConsole(shell,comp);
  else if(comp.modelRaw===COMP_OPTO_MODEL)injectOptoConsole(shell,comp);
};
