'use strict';

// More console pages for features mapped after the first console UI: input name/colour, filters,
// source patching, inserts and dynamics library presets on the input console, plus Bus and FX
// consoles. Every control calls an existing verified writer; nothing here touches bytes directly.
// Loaded after app-console-ui-main.js (see app-ui.js) and wraps renderConsoleEditor.

const CONSOLE_SCOPES=[['input','Inputs'],['bus','Buses'],['fx','FX'],['softkeys','Softkeys']];
const CONSOLE_EXTRA_MODES=[['filters','Filters'],['source','Source'],['inserts','Inserts']];

function cuiCard(title,body,badge=''){
  return `<section class="console-processing-card"><div class="console-subhead"><span>${safeText(title)}</span>${badge}</div>${body}</section>`;
}
function cuiHead(kicker,title,badge='<span class="confidence verified">VERIFIED WRITERS</span>'){
  return `<div class="console-section-head"><div><span class="console-kicker">${safeText(kicker)}</span><strong>${safeText(title)}</strong></div>${badge}</div>`;
}
function cuiOk(ok,what){if(ok)triggerConsoleRerender();else toast(`${what} write blocked.`,true);}
function cuiColourOptions(){return COLOURS.map(c=>`<option value="${c.id}">${safeText(c.name)}</option>`).join('');}
function cuiNum(key,value,min,max,step=1,w='6em'){return `<input data-k="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" style="width:${w}">`;}

// ---- Scope switch + input toolbar extras ----
function cuiDecorateToolbar(root){
  const tb=root.querySelector('.console-toolbar');if(!tb)return;
  const scope=root.dataset.scope||'input';
  const sw=document.createElement('div');sw.className='console-scope-switch';
  sw.innerHTML=CONSOLE_SCOPES.map(([id,l])=>`<button type="button" data-scope="${id}" class="${scope===id?'active':''}">${l}</button>`).join('');
  tb.prepend(sw);
  sw.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{root.dataset.scope=b.dataset.scope;renderConsoleEditor();});
  if(scope!=='input')return;
  const modes=tb.querySelector('.console-processor-switch'),mode=root.dataset.processor||'preamp';
  for(const [id,label] of CONSOLE_EXTRA_MODES){
    const b=document.createElement('button');b.type='button';b.dataset.mode=id;b.textContent=label;if(mode===id)b.className='active';
    b.onclick=()=>{root.dataset.processor=id;renderConsoleEditor();};modes?.appendChild(b);
  }
  const ch=Number(root.dataset.channel||1),m=state.current.stage.managers?.find(x=>x.key==='inputs'),item=m?.items?.[ch-1];
  if(item){
    const nm=document.createElement('div');nm.className='console-toolbar-name';
    nm.innerHTML=`<input data-k="cui-name" maxlength="8" value="${safeText(item.name||'')}" placeholder="Name" style="width:7em"><select data-k="cui-colour">${cuiColourOptions()}</select>`;
    tb.querySelector('.console-toolbar-channel')?.after(nm);
    const n=nm.querySelector('[data-k="cui-name"]'),c=nm.querySelector('[data-k="cui-colour"]');c.value=String(item.colour);
    n.onchange=()=>cuiOk(setName('inputs',ch,n.value),'Name');c.onchange=()=>cuiOk(setColour('inputs',ch,c.value),'Colour');
  }
}

// ---- Input: filters ----
function renderFiltersConsole(root,ch){
  const h=getInputHpf(ch),l=getInputLpf(ch);
  const shell=document.createElement('section');shell.className='dlive-console-frame';
  shell.innerHTML=cuiHead('INPUT FILTERS',`CH ${ch}${channelName(ch)?` · ${channelName(ch)}`:''}`)+`<div class="console-input-grid">
    ${h?cuiCard('High-pass',`<div data-k="hpf-tog"></div><label>Frequency<div class="console-value-row">${cuiNum('hpf-f',h.frequencyHz.toFixed(1),20,2000,1)}<span>Hz</span></div></label>
      <label>Slope<select data-k="hpf-s">${HPF_SLOPES.map(s=>`<option value="${s.raw}">${s.label}</option>`).join('')}</select></label>`):cuiCard('High-pass','<div class="console-readonly-chip">No HPF record</div>')}
    ${l?cuiCard('Low-pass',`<div data-k="lpf-tog"></div><label>Frequency<div class="console-value-row">${cuiNum('lpf-f',l.frequencyHz.toFixed(0),LPF_MIN_HZ,LPF_MAX_HZ,10)}<span>Hz</span></div></label>`):cuiCard('Low-pass','<div class="console-readonly-chip">No LPF record</div>')}
  </div>`;
  root.appendChild(shell);const q=k=>shell.querySelector(`[data-k="${k}"]`);
  if(h){q('hpf-tog').appendChild(makeToggle(h.active?'HPF In':'HPF Out',h.active,!h.bypassKnown,()=>cuiOk(setHpfActive(ch,!h.active),'HPF')));
    q('hpf-f').onchange=()=>cuiOk(setHpfFrequency(ch,q('hpf-f').value),'HPF frequency');
    const s=q('hpf-s');if(h.slope)s.value=String(h.slopeRaw);else injectCurrentOption(s,`Unknown 0x${hexByte(h.slopeRaw)}`);s.onchange=()=>cuiOk(setHpfSlope(ch,s.value),'HPF slope');}
  if(l){q('lpf-tog').appendChild(makeToggle(l.active?'LPF In':'LPF Out',l.active,!l.bypassKnown,()=>cuiOk(setLpfActive(ch,!l.active),'LPF')));
    q('lpf-f').onchange=()=>cuiOk(setLpfFrequency(ch,q('lpf-f').value),'LPF frequency');}
}

// ---- Input: source patching (Channel Mapper source A) ----
function renderSourceConsole(root,ch){
  const src=cmInputSource(ch),shell=document.createElement('section');shell.className='dlive-console-frame';
  if(!src){shell.innerHTML=cuiHead('INPUT SOURCE',`CH ${ch}`)+'<div class="notice warn">No Channel Mapper record of the expected size in this scene.</div>';root.appendChild(shell);return;}
  const sock=src.type===0x00?src.index+1:null,pre=sock?getStageBoxAnalogueInput(sock):null;
  shell.innerHTML=cuiHead('INPUT SOURCE',`CH ${ch}${channelName(ch)?` · ${channelName(ch)}`:''}`)+`<div class="console-input-grid">
    ${cuiCard('Source A',`<div class="console-readonly-chip">${safeText(cmInputSourceLabel(src))}${src.abcd?' · ABCD on':''}</div>
      <label>Type<select data-k="src-t">${[...CM_INPUT_SOURCE_TYPES].map(([v,l])=>`<option value="${v}">${safeText(l)}</option>`).join('')}</select></label>
      <label>Socket / channel<div class="console-value-row">${cuiNum('src-n',src.type===CM_UNASSIGNED?1:src.index+1,1,4096)}<span>#</span></div></label>
      <small class="console-inline-note">Surface sources share one numbering: S5000 Surface Sockets 1–12, DX 5/6 13–44, I/O 4 45–172, I/O 5 173–300, USB 301–302.</small>`)}
    ${pre?cuiCard(`MixRack socket ${sock} preamp`,`<label>Gain<div class="console-value-row">${cuiNum('pre-g',pre.gainDb.toFixed(1),IP_PREAMP_GAIN_MIN_DB,IP_PREAMP_GAIN_MAX_DB,0.5)}<span>dB</span></div></label><div class="console-button-pair"><span data-k="pre-pad"></span><span data-k="pre-48"></span></div>`):''}
  </div>`;
  root.appendChild(shell);const q=k=>shell.querySelector(`[data-k="${k}"]`);
  q('src-t').value=String(src.type);
  const apply=()=>cuiOk(setInputSource(ch,q('src-t').value,q('src-n').value),'Source');q('src-t').onchange=apply;q('src-n').onchange=apply;
  if(pre){q('pre-g').onchange=()=>cuiOk(setStageBoxPreampGain(sock,q('pre-g').value),'Preamp gain');
    q('pre-pad').appendChild(makeToggle('Pad',pre.padOn,!pre.writableShape,()=>cuiOk(setStageBoxPreampPad(sock,!pre.padOn),'Pad')));
    q('pre-48').appendChild(makeToggle('48V',pre.phantomOn,!pre.writableShape,()=>cuiOk(setStageBoxPreampPhantom(sock,!pre.phantomOn),'48V')));}
}

// ---- Input: inserts A/B ----
function renderInsertsConsole(root,ch){
  const shell=document.createElement('section');shell.className='dlive-console-frame';
  if(!cmRecord()){shell.innerHTML=cuiHead('INPUT INSERTS',`CH ${ch}`)+'<div class="notice warn">No Channel Mapper record of the expected size in this scene.</div>';root.appendChild(shell);return;}
  const card=slot=>cuiCard(`Insert ${slot}`,`<div class="console-readonly-chip">${cmInsertLabel(ch,slot)}</div>
    <label>Assign to<select data-k="ins-${slot}-k"><option value="socket">MixRack sockets</option><option value="rackfx">Rack FX unit</option></select></label>
    <label data-k="ins-${slot}-sock">Send / return<div class="console-value-row">${cuiNum(`ins-${slot}-s`,1,1,32)}${cuiNum(`ins-${slot}-r`,1,1,128)}</div></label>
    <label data-k="ins-${slot}-fx" hidden>Unit<select data-k="ins-${slot}-u">${Array.from({length:16},(_,i)=>`<option value="${i+1}">FX ${i+1}${rackfxUnitName(i+1)?` · ${safeText(rackfxUnitName(i+1))}`:''}</option>`).join('')}</select></label>
    <div class="console-button-pair"><button class="btn" type="button" data-k="ins-${slot}-a">Assign</button><button class="btn" type="button" data-k="ins-${slot}-x">Unassign</button></div>`);
  shell.innerHTML=cuiHead('INPUT INSERTS',`CH ${ch}${channelName(ch)?` · ${channelName(ch)}`:''}`)+`<div class="console-input-grid">${card('A')}${card('B')}</div>
    <div class="console-note">Director also sets a socket return's preamp to 20 dB with pad on; the editor leaves preamps alone.</div>`;
  root.appendChild(shell);const q=k=>shell.querySelector(`[data-k="${k}"]`);
  for(const slot of ['A','B']){
    const kind=q(`ins-${slot}-k`),sync=()=>{q(`ins-${slot}-sock`).hidden=kind.value!=='socket';q(`ins-${slot}-fx`).hidden=kind.value!=='rackfx';};
    const st=cmInsertState(ch,slot);if(st?.returnType===0x1C){kind.value='rackfx';q(`ins-${slot}-u`).value=String((st.returnIndex>>1)+1);}
    else if(st&&st.returnType===0x00)q(`ins-${slot}-r`).value=String(st.returnIndex+1);
    sync();kind.onchange=sync;
    q(`ins-${slot}-a`).onclick=()=>cuiOk(setInputInsert(ch,slot,kind.value==='rackfx'?{kind:'rackfx',unit:+q(`ins-${slot}-u`).value}:{kind:'socket',send:+q(`ins-${slot}-s`).value,ret:+q(`ins-${slot}-r`).value}),`Insert ${slot}`);
    q(`ins-${slot}-x`).onclick=()=>cuiOk(setInputInsert(ch,slot,null),`Insert ${slot}`);
  }
}

// ---- Library preset pickers on the gate and compressor pages ----
function cuiLibraryPicker(root,kind,target){
  const head=root.querySelector('.dlive-console-frame:last-of-type .console-head-cluster, .dlive-console-frame:last-of-type .console-section-head');if(!head)return;
  const lib=kind==='comp'?COMP_LIBRARY_STATES:GATE_LIBRARY_STATES;
  const sel=document.createElement('select');sel.className='console-library-select';sel.title='Load a factory library preset (changes the model; In/Out is kept)';
  sel.innerHTML=`<option value="">Library…</option>${Object.keys(lib).map(n=>`<option>${safeText(n)}</option>`).join('')}`;
  sel.onchange=()=>{if(!sel.value)return;cuiOk(kind==='comp'?loadCompressorLibraryPreset(target,sel.value):loadGateLibraryPreset(target,sel.value),'Library preset');};
  head.appendChild(sel);
}

// ---- Bus console ----
function renderBusConsole(root){
  const buses=busList(),shell=document.createElement('section');shell.className='dlive-console-frame bus-console';
  if(!buses.length){shell.innerHTML='<div class="notice warn">No bus records in this scene.</div>';root.appendChild(shell);return;}
  const bus=busById(root.dataset.bus)||buses[0];root.dataset.bus=bus.id;
  const g=busGeqView(bus),sc=busSidechainSource(bus);
  const mgrKey=bus.stereo?bus.kind.stMgr:bus.kind.monoMgr,mgr=state.current.stage.managers?.find(x=>x.key===mgrKey),item=mgr?.items?.[bus.n-1];
  const insKind=bus.kind.key==='main'?(bus.stereo?'main':null):(BUS_INS_TABLES[bus.kind.key]?(bus.stereo?'stereo':'mono'):null);
  shell.innerHTML=`<div class="console-section-head"><div><span class="console-kicker">BUS</span><select data-k="bus">${buses.map(b=>`<option value="${b.id}">${safeText(b.title)}</option>`).join('')}</select></div><span class="confidence verified">VERIFIED WRITERS</span></div>
    <div class="console-input-grid">
      ${item&&bus.kind.key!=='main'?cuiCard('Name & colour',`<input data-k="b-name" maxlength="8" value="${safeText(item.name||'')}"><select data-k="b-col">${cuiColourOptions()}</select>`):''}
      ${cuiCard('Compressor',`<label>Library preset<select data-k="b-lib"><option value="">Load…</option>${Object.keys(COMP_LIBRARY_STATES).map(n=>`<option>${safeText(n)}</option>`).join('')}</select></label>
        ${sc?`<label>Sidechain source<div class="console-value-row"><select data-k="b-sct">${SC_TYPES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>${cuiNum('b-sci',sc.index,1,128)}</div></label>`:''}`)}
      ${insKind?cuiCard('Insert A',`<label>${insKind==='mono'?'Send':'L send'} / return<div class="console-value-row">${cuiNum('b-s1',1,1,32)}${cuiNum('b-r1',1,1,128)}</div></label>
        ${insKind==='stereo'?`<label>R send<div class="console-value-row">${cuiNum('b-s2',2,1,32)}<span>return uses the next socket</span></div></label>`:''}
        ${insKind==='main'?`<label>R send / return<div class="console-value-row">${cuiNum('b-s2',2,1,32)}${cuiNum('b-r2',2,1,128)}</div></label>`:''}
        <div class="console-button-pair"><button class="btn" type="button" data-k="b-ia">Assign</button><button class="btn" type="button" data-k="b-iu">Unassign</button></div>`):''}
    </div>
    ${g?`<section class="console-geq"><div class="console-subhead"><span>Graphic EQ</span><span data-k="g-tog"></span><select data-k="g-type">${[...GEQ_TYPES].map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div>
      ${g.type===4?`<div class="console-neq">${g.neq.map((b,i)=>`<div class="console-neq-band"><b>${i+1}</b>${cuiNum(`n-g-${i}`,b.gainDb.toFixed(1),-15,15,0.5,'4.5em')}<small>dB</small>${cuiNum(`n-f-${i}`,Math.round(b.freqHz),20,20000,1,'5.5em')}<small>Hz</small><select data-k="n-w-${i}">${PEQ_WIDTH_TABLE.map((n,j)=>`<option value="${j}">${safeText(n)}</option>`).join("")}</select></div>`).join('')}</div>`
      :`<div class="console-geq-faders">${g.gains.map((v,i)=>`<label><output>${v>0?'+':''}${v.toFixed(1)}</output><input data-k="g-${i}" type="range" min="-12" max="12" step="0.5" value="${v}" orient="vertical"><span>${GEQ_BANDS[i]}</span></label>`).join('')}</div>`}</section>`:''}`;
  root.appendChild(shell);const q=k=>shell.querySelector(`[data-k="${k}"]`);
  q('bus').value=bus.id;q('bus').onchange=()=>{root.dataset.bus=q('bus').value;renderConsoleEditor();};
  if(q('b-name')){q('b-col').value=String(item.colour);q('b-name').onchange=()=>cuiOk(setName(mgrKey,bus.n,q('b-name').value),'Name');q('b-col').onchange=()=>cuiOk(setColour(mgrKey,bus.n,q('b-col').value),'Colour');}
  q('b-lib').onchange=()=>{if(q('b-lib').value)cuiOk(loadCompressorLibraryPreset(bus,q('b-lib').value),'Library preset');};
  if(sc){q('b-sct').value=String(sc.type);const f=()=>cuiOk(setBusSidechainSource(bus,q('b-sct').value,q('b-sci').value),'Sidechain');q('b-sct').onchange=f;q('b-sci').onchange=f;}
  if(insKind){
    const tgt=insKind==='main'?{kind:'main',legs:['L','R']}:{kind:bus.kind.key,stereo:insKind==='stereo',n:bus.n};
    q('b-ia').onclick=()=>{const s=[{send:+q('b-s1').value,ret:+q('b-r1').value}];if(insKind==='main')s.push({send:+q('b-s2').value,ret:+q('b-r2').value});if(insKind==='stereo')s.push({send:+q('b-s2').value,ret:null});cuiOk(setBusInsert(tgt,s),'Insert');};
    q('b-iu').onclick=()=>cuiOk(setBusInsert(tgt,null),'Insert');
  }
  if(g){
    q('g-tog').appendChild(makeToggle(g.active?'GEQ In':'GEQ Out',g.active,false,()=>cuiOk(setBusGeqActive(bus,!g.active),'GEQ')));
    q('g-type').value=String(g.type);q('g-type').onchange=()=>cuiOk(setBusGeqType(bus,q('g-type').value),'GEQ type');
    if(g.type===4)g.neq.forEach((b,i)=>{q(`n-g-${i}`).onchange=e=>cuiOk(setBusNeq12Band(bus,i+1,'gain',e.target.value),'NEQ gain');q(`n-f-${i}`).onchange=e=>cuiOk(setBusNeq12Band(bus,i+1,'freq',e.target.value),'NEQ frequency');
      const w=q(`n-w-${i}`);w.value=String(b.width);w.onchange=()=>cuiOk(setBusNeq12Band(bus,i+1,'width',w.value),'NEQ width');});
    else g.gains.forEach((_,i)=>{const r=q(`g-${i}`);r.oninput=()=>{r.previousElementSibling.textContent=`${r.value>0?'+':''}${Number(r.value).toFixed(1)}`;};r.onchange=()=>cuiOk(setBusGeqGain(bus,i+1,r.value),'GEQ gain');});
  }
}
// ---- FX console ----
function renderFxConsole(root){
  const shell=document.createElement('section');shell.className='dlive-console-frame fx-console';
  const rack=Array.from({length:16},(_,i)=>i+1).filter(u=>rackfxRecord(u)),ufx=Array.from({length:8},(_,i)=>i+1).filter(u=>ultrafxRecord(u));
  const opts=lib=>Object.entries(lib).map(([cat,ps])=>`<optgroup label="${safeText(cat)}">${Object.keys(ps).map(n=>`<option>${safeText(n)}</option>`).join('')}</optgroup>`).join('');
  const rackOpts=opts(RACKFX_LIBRARY_STATES),ufxOpts=opts(ULTRAFX_LIBRARY_STATES);
  shell.innerHTML=cuiHead('FX RACK','Factory library presets')+`<div class="console-fx-grid">
    ${rack.map(u=>`<div class="console-fx-unit"><b>FX ${u}</b><span>${safeText(rackfxUnitName(u)||'—')}</span><select data-rack="${u}"><option value="">Load preset…</option>${rackOpts}</select></div>`).join('')}
    ${ufx.map(u=>`<div class="console-fx-unit ufx"><b>UFX ${u}</b><span>${safeText(ultrafxUnitName(u)||'—')}</span><select data-ufx="${u}"><option value="">Load preset…</option>${ufxOpts}</select></div>`).join('')}
  </div><div class="console-note">Loading a RackUltra preset switches that unit's engine. Per-parameter RackFX knobs are not mapped; RackUltra engines are editable in the FX tab.</div>`;
  root.appendChild(shell);
  shell.querySelectorAll('[data-rack]').forEach(s=>s.onchange=()=>{if(s.value)cuiOk(loadRackFxPreset(+s.dataset.rack,s.value),'RackFX preset');});
  shell.querySelectorAll('[data-ufx]').forEach(s=>s.onchange=()=>{if(s.value)cuiOk(loadUltraFxPreset(+s.dataset.ufx,s.value),'UltraFX preset');});
}

// ---- Softkeys console ----
// Functions offered for editing; `p` lists the parameters each builder takes.
const CUI_SK_FUNCS=[
  ['unused','Unused',[]],['mix','Mix','ch'],['mute','Mute','ch'],['sel','Sel','ch'],['pafl','PAFL','ch'],
  ['faderStart','Fader Start','ch'],['muteGroup','Mute Group','n'],['sceneRecall','Recall Scene','n'],['sceneGo','Scene Go',[]],
  ['sceneNext','Scene Next',[]],['scenePrev','Scene Previous',[]],['tapGlobal','Tap Tempo (global)',[]],['paflClear','PAFL Clear',[]],
  ['dcaSpillActive','DCA/MCA Spill Active',[]],['peakHoldReset','Peak Hold Reset',[]],['ufxBypass','Bypass UFX','n'],
  ['talkbackGroup','Talkback Group','n'],['sip','SIP',[]],['mcaAllDcas','MCA On/Off All DCAs',[]],
  ['abcdA','ABCD Set All: A',[]],['abcdB','ABCD Set All: B',[]],['abcdOff','ABCD Set All: Disable',[]],
  ['usbPlay','USB Play / Pause',[]],['usbRec','USB Record',[]],['vsc','Virtual Sound Check',[]]
];
const CUI_SK_TYPES=[['input','Input'],['monoGroup','Mono Group'],['stereoGroup','Stereo Group'],['monoAux','Mono Aux'],['stereoAux','Stereo Aux'],['monoMatrix','Mono Matrix'],['stereoMatrix','Stereo Matrix'],['main','Main'],['dca','DCA']];
function cuiSkBuild(fn,type,n){
  const E=softKeyEntry,i=Math.max(0,Number(n)-1);
  switch(fn){
    case 'unused':return E.unused();case 'mix':return E.mix(type,i);case 'mute':return E.mute(type,i,false);case 'sel':return E.sel(type,i);
    case 'pafl':return E.pafl(type,i);case 'faderStart':return E.faderStart(type,i);case 'muteGroup':return E.muteGroup(i+1,false);
    case 'sceneRecall':return E.sceneRecall(i+1);case 'sceneGo':return E.sceneGo(false);case 'sceneNext':return E.sceneAction('next');
    case 'scenePrev':return E.sceneAction('previous');case 'tapGlobal':return E.tapTempo({global:true});case 'paflClear':return E.paflClear();
    case 'dcaSpillActive':return E.dcaSpillActive();case 'peakHoldReset':return E.peakHoldReset();case 'ufxBypass':return E.ufxBypass(i+1);
    case 'talkbackGroup':return E.talkbackGroup(i+1);case 'sip':return E.sip();case 'mcaAllDcas':return E.mcaAllDcas();
    case 'abcdA':return E.abcdSetAll('A');case 'abcdB':return E.abcdSetAll('B');case 'abcdOff':return E.abcdSetAll('off');
    case 'usbPlay':return E.usbPlayRecord('playPause');case 'usbRec':return E.usbPlayRecord('record');case 'vsc':return E.virtualSoundcheck('virtualSoundcheck');
  }
  return null;
}
function renderSoftkeysConsole(root){
  const sf=state.current?.surface,shell=document.createElement('section');shell.className='dlive-console-frame softkey-console';
  const sk=sf&&parseSoftKeys(sf.datBytes);
  if(!sk){shell.innerHTML=cuiHead('SOFTKEYS','—')+'<div class="notice warn">No Surface Soft Controls record in this scene.</div>';root.appendChild(shell);return;}
  const entries=sk.valid?sk.banks[0]:[];
  shell.innerHTML=cuiHead('SOFTKEYS',`${sk.counts?.[0]||0} keys`,sk.valid?'<span class="confidence verified">VERIFIED WRITERS</span>':'<span class="confidence">READ-ONLY</span>')+
    (sk.valid?'':`<div class="notice warn">This record holds a function the editor cannot parse (${safeText(sk.reason||'')}), so it is shown read-only.</div>`)+
    `<div class="console-sk-grid">${entries.map((e,i)=>`<div class="console-sk${e[0]===0?' unused':''}"><b>Soft ${i+1}</b><span>${safeText(softkeyDescribe(e))}</span><button class="btn" type="button" data-sk-edit="${i}">Edit</button></div>`).join('')}</div>
    <div class="console-sk-editor" hidden><div class="console-subhead"><span data-k="sk-title"></span></div>
      <label>Function<select data-k="sk-fn">${CUI_SK_FUNCS.map(([id,l])=>`<option value="${id}">${safeText(l)}</option>`).join('')}</select></label>
      <label data-k="sk-chrow">Channel<div class="console-value-row"><select data-k="sk-type">${CUI_SK_TYPES.map(([id,l])=>`<option value="${id}">${l}</option>`).join('')}</select>${cuiNum('sk-n',1,1,128)}</div></label>
      <label data-k="sk-nrow">Number<div class="console-value-row">${cuiNum('sk-num',1,1,500)}</div></label>
      <div class="console-button-pair"><button class="btn" type="button" data-k="sk-apply">Apply</button><button class="btn" type="button" data-k="sk-cancel">Cancel</button></div>
      <small class="console-inline-note">Director writes the same 26 keys to both softkey banks; so does the editor.</small></div>`;
  root.appendChild(shell);const q=k=>shell.querySelector(`[data-k="${k}"]`),ed=shell.querySelector('.console-sk-editor');
  let idx=-1;const sync=()=>{const p=CUI_SK_FUNCS.find(f=>f[0]===q('sk-fn').value)?.[2];q('sk-chrow').hidden=p!=='ch';q('sk-nrow').hidden=p!=='n';};
  q('sk-fn').onchange=sync;
  shell.querySelectorAll('[data-sk-edit]').forEach(b=>{b.disabled=!sk.valid;b.onclick=()=>{idx=+b.dataset.skEdit;ed.hidden=false;q('sk-title').textContent=`Soft ${idx+1} — ${softkeyDescribe(entries[idx])}`;sync();ed.scrollIntoView({block:'nearest'});};});
  q('sk-cancel').onclick=()=>{ed.hidden=true;};
  q('sk-apply').onclick=()=>{
    const p=CUI_SK_FUNCS.find(f=>f[0]===q('sk-fn').value)?.[2];
    const e=cuiSkBuild(q('sk-fn').value,q('sk-type').value,p==='n'?q('sk-num').value:q('sk-n').value);if(!e||idx<0)return;
    const list=entries.map(x=>x);list[idx]=e;cuiOk(setSoftKeys(list),'Softkey');
  };
}

// ---- Wrap the console entry point ----
const renderConsoleEditorBase=renderConsoleEditor;
renderConsoleEditor=function(){
  const root=$('#consoleEditor');if(!root)return;
  const scope=root.dataset.scope||'input',mode=root.dataset.processor||'preamp';
  const extra=CONSOLE_EXTRA_MODES.some(([id])=>id===mode);
  if(extra)root.dataset.processor='delay';            // let the base draw the toolbar, then replace its page
  renderConsoleEditorBase();
  if(extra)root.dataset.processor=mode;
  if(!state.current?.stage)return;
  const tb=root.querySelector('.console-toolbar');
  if(tb){tb.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));}
  cuiDecorateToolbar(root);
  const ch=Number(root.dataset.channel||1);
  if(scope!=='input'||extra){[...root.children].forEach(el=>{if(el!==tb)el.remove();});}
  if(scope==='bus'){tb?.querySelector('.console-processor-switch')?.remove();tb?.querySelector('.console-toolbar-channel')?.remove();renderBusConsole(root);return;}
  if(scope==='fx'){tb?.querySelector('.console-processor-switch')?.remove();tb?.querySelector('.console-toolbar-channel')?.remove();renderFxConsole(root);return;}
  if(scope==='softkeys'){tb?.querySelector('.console-processor-switch')?.remove();tb?.querySelector('.console-toolbar-channel')?.remove();renderSoftkeysConsole(root);return;}
  if(mode==='filters')renderFiltersConsole(root,ch);
  else if(mode==='source')renderSourceConsole(root,ch);
  else if(mode==='inserts')renderInsertsConsole(root,ch);
  else if(mode==='comp')cuiLibraryPicker(root,'comp',ch);
  else if(mode==='gate')cuiLibraryPicker(root,'gate',ch);
};
window.renderConsoleEditor=renderConsoleEditor;
