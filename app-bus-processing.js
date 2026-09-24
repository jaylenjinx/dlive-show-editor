'use strict';

// Group / Aux / Matrix processing. Their Compressor, Parametric EQ and Mix Delay records
// share the input-channel state layouts (127 / 38 / 4 bytes). Confirmed by controlled
// Director changes on Mono Aux 1: compressor ratio/threshold/attack/release/makeup/knee/In,
// PEQ band 1 gain/frequency/width and In/Out, and Mix Delay time and In/Out each changed the
// same state offsets as on an input. Stereo buses keep separate Left and Right records that
// Director edits together (a Stereo Aux delay change altered both), so every write here is
// mirrored to both records.
const BUS_KINDS=[
  {key:'group',label:'Group',mono:'Mono Group',stereo:'Stereo Group',monoMgr:'groups',stMgr:'stGroups',short:'Grp',stShort:'St Grp'},
  {key:'aux',label:'Aux',mono:'Mono Aux',stereo:'Stereo Aux',monoMgr:'auxes',stMgr:'stAuxes',short:'Aux',stShort:'St Aux'},
  {key:'matrix',label:'Matrix',mono:'Mono Matrix',stereo:'Stereo Matrix',monoMgr:'matrices',stMgr:'stMatrices',short:'Mtx',stShort:'St Mtx'},
];
const BUS_DELAY_MAX_MS=400;
const BUS_COMP_MODEL_RMS=0x01;

function busLabel(record,mono,stereo,n,side){
  const num=String(n).padStart(2,'0');
  // mono bus labels carry a trailing space before the NUL terminator
  return side?`${record}, ${stereo} Channel ${num} ${side}`:`${record}, ${mono} Channel ${num} `;
}
function busFindRecord(dat,label){
  const sig=asciiBytes(label),pos=indexOfBytes(dat,sig);if(pos<2)return null;
  const payloadLength=readU16BE(dat,pos-2),frameEnd=pos+payloadLength,nul=pos+sig.length;
  if(frameEnd>dat.length||dat[nul]!==0)return null;
  return {label,stateStart:nul+1,stateLength:frameEnd-nul-1};
}
function busBuild(dat){
  const stage=state.current.stage,buses=[];
  for(const k of BUS_KINDS){
    for(const stereo of [false,true]){
      for(let n=1;n<=64;n++){
        const sides=stereo?['Left','Right']:[null];
        const rec={comp:[],peq:[],delay:[]};
        let ok=true;
        for(const side of sides){
          const c=busFindRecord(dat,busLabel('Compressor',k.mono,k.stereo,n,side));
          const p=busFindRecord(dat,busLabel('Parametric EQ',k.mono,k.stereo,n,side));
          const d=busFindRecord(dat,busLabel('Mix Delay',k.mono,k.stereo,n,side));
          if(!c){ok=false;break;}
          rec.comp.push(c);if(p&&p.stateLength===38)rec.peq.push(p);if(d&&d.stateLength===4)rec.delay.push(d);
        }
        if(!ok)break;
        const mgr=stage.managers?.find(x=>x.key===(stereo?k.stMgr:k.monoMgr));
        const name=mgr?.items?.[n-1]?.name||'';
        buses.push({id:`${k.key}-${stereo?'st':'mono'}-${n}`,kind:k,stereo,n,name,title:`${stereo?k.stShort:k.short} ${n}${name?` · ${name}`:''}`,rec});
      }
    }
  }
  return buses;
}
function busList(){
  const stage=state.current?.stage;if(!stage)return [];
  if(!stage.busList)stage.busList=busBuild(stage.datBytes);
  return stage.busList;
}
function busById(id){return busList().find(b=>b.id===id)||null;}

// ---- compressor ----
function busCompView(bus){
  const dat=state.current.stage.datBytes,c=bus.rec.comp[0],s=c.stateStart;
  const writable=c.stateLength===127&&dat[s]===0x08&&dat[s+1]===BUS_COMP_MODEL_RMS&&(dat[s+2]===0||dat[s+2]===1);
  return {writable,model:dat[s+1],active:dat[s+2]===1,thresholdDb:readI16BE(dat,s+8)/256,
    attackRaw:readU16BE(dat,s+10),releaseRaw:readU16BE(dat,s+12),ratioRaw:dat[s+15],makeupDb:readI16BE(dat,s+16)/256,kneeRaw:dat[s+18]};
}
function busCompWriteBytes(bus,fn){
  const dat=state.current.stage.datBytes;
  if(!busCompView(bus).writable)return false;
  for(const c of bus.rec.comp)fn(dat,c.stateStart);
  markStageDirty();return true;
}
function setBusCompActive(bus,on){return busCompWriteBytes(bus,(d,s)=>{d[s+2]=on?1:0;});}
function setBusCompThreshold(bus,db){
  const v=Number(db);if(!Number.isFinite(v))return false;const raw=Math.round(Math.max(COMP_THRESHOLD_MIN_VERIFIED_DB,Math.min(COMP_THRESHOLD_MAX_VERIFIED_DB,v))*256);
  return busCompWriteBytes(bus,(d,s)=>writeI16BE(d,s+8,raw));
}
function setBusCompTime(bus,kind,ms){
  let v=Number(ms);if(!Number.isFinite(v))return false;
  const [min,max]=kind==='attack'?[COMP_ATTACK_MIN_MS,COMP_ATTACK_MAX_MS]:[COMP_RELEASE_MIN_MS,COMP_RELEASE_MAX_MS];
  const raw=compTimeRawFromMs(Math.max(min,Math.min(max,v)));
  return busCompWriteBytes(bus,(d,s)=>writeU16BE(d,s+(kind==='attack'?10:12),raw));
}
function setBusCompRatio(bus,raw){raw=Number(raw);if(!COMP_RATIO_RAW_TO_LABEL.has(raw))return false;return busCompWriteBytes(bus,(d,s)=>{d[s+15]=raw;});}
function setBusCompMakeup(bus,db){
  const v=Number(db);if(!Number.isFinite(v))return false;const raw=Math.round(Math.max(COMP_MAKEUP_MIN_VERIFIED_DB,Math.min(COMP_MAKEUP_MAX_VERIFIED_DB,v))*256);
  return busCompWriteBytes(bus,(d,s)=>writeI16BE(d,s+16,raw));
}
function setBusCompKnee(bus,raw){raw=Number(raw);if(raw!==0&&raw!==1)return false;return busCompWriteBytes(bus,(d,s)=>{d[s+18]=raw;});}

// ---- PEQ (state: count byte, 4 × [gain i16, freq u16, width u16, 3 state bytes], bypass byte) ----
function busPeqView(bus){
  const p=bus.rec.peq[0];if(!p)return null;const dat=state.current.stage.datBytes,s=p.stateStart;
  if(dat[s]!==4)return null;
  const bands=[];for(let i=0;i<4;i++){const o=s+1+i*9;bands.push({band:i+1,gainDb:peqGainFromRaw(readI16BE(dat,o)),freqHz:peqFrequencyFromRaw(readU16BE(dat,o+2)),widthIndex:peqWidthIndex(readU16BE(dat,o+4)),typeRaw:dat[o+6]});}
  const byp=dat[s+37];return {bands,bypassKnown:byp===0||byp===1,active:byp===0};
}
function busPeqWrite(bus,fn){
  const v=busPeqView(bus);if(!v)return false;const dat=state.current.stage.datBytes;
  for(const p of bus.rec.peq)fn(dat,p.stateStart);markStageDirty();return true;
}
function setBusPeqGain(bus,band,db){const raw=peqGainToRaw(db);return busPeqWrite(bus,(d,s)=>writeI16BE(d,s+1+(band-1)*9,raw));}
function setBusPeqFrequency(bus,band,hz){const raw=peqFrequencyToRaw(hz);return busPeqWrite(bus,(d,s)=>writeU16BE(d,s+3+(band-1)*9,raw));}
function setBusPeqWidth(bus,band,index){const raw=peqWidthToRaw(index);return busPeqWrite(bus,(d,s)=>writeU16BE(d,s+5+(band-1)*9,raw));}
function setBusPeqActive(bus,on){const v=busPeqView(bus);if(!v?.bypassKnown)return false;return busPeqWrite(bus,(d,s)=>{d[s+37]=on?0:1;});}

// ---- Mix Delay (state: discriminator, u16 = ms × 96, bypass 00 = In) ----
function busDelayView(bus){
  const r=bus.rec.delay[0];if(!r)return null;const dat=state.current.stage.datBytes,s=r.stateStart;
  const byp=dat[s+3];return {ms:readU16BE(dat,s+1)/96,active:byp===0,known:dat[s]===0x01&&(byp===0||byp===1)};
}
function busDelayWrite(bus,fn){
  const v=busDelayView(bus);if(!v?.known)return false;const dat=state.current.stage.datBytes;
  for(const r of bus.rec.delay)fn(dat,r.stateStart);markStageDirty();return true;
}
function setBusDelayMs(bus,ms){const v=Number(ms);if(!Number.isFinite(v))return false;const raw=Math.round(Math.max(0,Math.min(BUS_DELAY_MAX_MS,v))*96);return busDelayWrite(bus,(d,s)=>writeU16BE(d,s+1,raw));}
function setBusDelayActive(bus,on){return busDelayWrite(bus,(d,s)=>{d[s+3]=on?0:1;});}

// ---- UI ----
function busField(label,note,inner,code=''){return `<div class="peq-field"><span>${label}${note?` <small>${note}</small>`:''}</span><div>${inner}</div>${code?`<code>${code}</code>`:''}</div>`;}
function renderBuses(){
  const root=$('#busEditor');if(!root)return;
  root.innerHTML='';
  const stage=state.current?.stage;if(!stage){return;}
  const buses=busList();
  if(!buses.length){root.innerHTML='<div class="notice warn">No group, aux or matrix processing records were found in this scene.</div>';return;}
  const toolbar=document.createElement('section');toolbar.className='panel peq-toolbar';
  toolbar.innerHTML='<div class="manager-head inline"><h2>Bus</h2><span class="confidence verified">CONTROLLED-DIFF VERIFIED (MONO AUX 1)</span></div>';
  const select=document.createElement('select');select.className='peq-channel-select';
  for(const b of buses){const o=document.createElement('option');o.value=b.id;o.textContent=b.title;select.appendChild(o);}
  const remembered=root.dataset.bus;select.value=buses.some(b=>b.id===remembered)?remembered:buses[0].id;
  toolbar.appendChild(select);root.appendChild(toolbar);
  const body=document.createElement('div');body.className='details-stack';root.appendChild(body);
  const draw=()=>{
    root.dataset.bus=select.value;body.innerHTML='';const bus=busById(select.value);if(!bus)return;
    const redraw=ok=>{if(ok)draw();else toast('Bus write blocked by structure validation.',true);};
    const c=busCompView(bus),peq=busPeqView(bus),dly=busDelayView(bus);
    const link=bus.stereo?'<div class="notice">Stereo bus: Director keeps the Left and Right records identical, so every edit here writes both.</div>':'';
    const compPanel=document.createElement('section');compPanel.className='panel';
    compPanel.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} compressor</h2><span class="confidence ${c.writable?'verified':'decoded'}">${c.writable?'MANUAL RMS · VERIFIED WRITE':'READ ONLY · MODEL 0x'+hexByte(c.model)}</span></div>${link}
      ${busField('Comp','',`<select data-k="on"><option value="1">In</option><option value="0">Out</option></select>`)}
      ${busField('Threshold',`${COMP_THRESHOLD_MIN_VERIFIED_DB}…${COMP_THRESHOLD_MAX_VERIFIED_DB} dB`,`<input data-k="thr" type="number" step="0.1" min="${COMP_THRESHOLD_MIN_VERIFIED_DB}" max="${COMP_THRESHOLD_MAX_VERIFIED_DB}"><b>dB</b>`)}
      ${busField('Ratio','41-step table',`<select data-k="ratio">${[...COMP_RATIO_RAW_TO_LABEL].map(([r,l])=>`<option value="${r}">${escapeHtml(l)}</option>`).join('')}</select>`)}
      ${busField('Attack',`${COMP_ATTACK_MIN_MS}…${COMP_ATTACK_MAX_MS} ms`,`<input data-k="att" type="number" step="0.01" min="${COMP_ATTACK_MIN_MS}" max="${COMP_ATTACK_MAX_MS}"><b>ms</b>`)}
      ${busField('Release',`${COMP_RELEASE_MIN_MS}…${COMP_RELEASE_MAX_MS} ms`,`<input data-k="rel" type="number" step="1" min="${COMP_RELEASE_MIN_MS}" max="${COMP_RELEASE_MAX_MS}"><b>ms</b>`)}
      ${busField('Gain',`${COMP_MAKEUP_MIN_VERIFIED_DB}…${COMP_MAKEUP_MAX_VERIFIED_DB} dB`,`<input data-k="gain" type="number" step="0.1" min="${COMP_MAKEUP_MIN_VERIFIED_DB}" max="${COMP_MAKEUP_MAX_VERIFIED_DB}"><b>dB</b>`)}
      ${busField('Knee','',`<select data-k="knee"><option value="0">Normal</option><option value="1">Soft</option></select>`)}`;
    body.appendChild(compPanel);
    const q=k=>compPanel.querySelector(`[data-k="${k}"]`);
    q('on').value=c.active?'1':'0';q('thr').value=c.thresholdDb.toFixed(2);
    if(COMP_RATIO_RAW_TO_LABEL.has(c.ratioRaw))q('ratio').value=String(c.ratioRaw);else{const o=document.createElement('option');o.value='';o.textContent=`Raw 0x${hexByte(c.ratioRaw)}`;o.selected=true;q('ratio').prepend(o);}
    q('att').value=String(Number(compTimeEstimateMs(c.attackRaw).toPrecision(4)));q('rel').value=String(Number(compTimeEstimateMs(c.releaseRaw).toPrecision(4)));
    q('gain').value=c.makeupDb.toFixed(2);q('knee').value=String(c.kneeRaw===1?1:0);
    if(!c.writable)for(const el of compPanel.querySelectorAll('select,input'))el.disabled=true;
    q('on').onchange=()=>redraw(setBusCompActive(bus,q('on').value==='1'));
    q('thr').onchange=()=>redraw(setBusCompThreshold(bus,q('thr').value));
    q('ratio').onchange=()=>redraw(q('ratio').value!==''&&setBusCompRatio(bus,q('ratio').value));
    q('att').onchange=()=>redraw(setBusCompTime(bus,'attack',q('att').value));
    q('rel').onchange=()=>redraw(setBusCompTime(bus,'release',q('rel').value));
    q('gain').onchange=()=>redraw(setBusCompMakeup(bus,q('gain').value));
    q('knee').onchange=()=>redraw(setBusCompKnee(bus,q('knee').value));

    const peqPanel=document.createElement('section');peqPanel.className='panel';
    if(peq){
      peqPanel.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} PEQ</h2><span class="confidence verified">VERIFIED WRITE</span></div>${busField('PEQ','',`<select data-k="in"><option value="1">In</option><option value="0">Out</option></select>`)}
        ${peq.bands.map(b=>busField(`Band ${b.band}`,`type byte ${hexByte(b.typeRaw)} · read only`,`<input data-k="f${b.band}" type="number" min="20" max="20000" step="1"><b>Hz</b> <input data-k="g${b.band}" type="number" min="-15" max="15" step="0.1"><b>dB</b> <select data-k="w${b.band}">${PEQ_WIDTH_TABLE.map((n,i)=>`<option value="${i}">${escapeHtml(n)}</option>`).join('')}</select>`)).join('')}`;
      body.appendChild(peqPanel);
      const pq=k=>peqPanel.querySelector(`[data-k="${k}"]`);
      pq('in').value=peq.active?'1':'0';pq('in').disabled=!peq.bypassKnown;
      pq('in').onchange=()=>redraw(setBusPeqActive(bus,pq('in').value==='1'));
      for(const b of peq.bands){
        pq(`f${b.band}`).value=String(Math.round(b.freqHz));pq(`g${b.band}`).value=b.gainDb.toFixed(1);pq(`w${b.band}`).value=String(b.widthIndex);
        pq(`f${b.band}`).onchange=()=>redraw(setBusPeqFrequency(bus,b.band,pq(`f${b.band}`).value));
        pq(`g${b.band}`).onchange=()=>redraw(setBusPeqGain(bus,b.band,pq(`g${b.band}`).value));
        pq(`w${b.band}`).onchange=()=>redraw(setBusPeqWidth(bus,b.band,pq(`w${b.band}`).value));
      }
    }else{peqPanel.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} PEQ</h2></div><div class="notice warn">PEQ record not found or not the expected 4-band shape.</div>`;body.appendChild(peqPanel);}

    const dPanel=document.createElement('section');dPanel.className='panel';
    if(dly){
      dPanel.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} delay</h2><span class="confidence verified">VERIFIED WRITE</span></div>
        ${busField('Delay',`0…${BUS_DELAY_MAX_MS} ms (raw = ms × 96)`,`<input data-k="ms" type="number" min="0" max="${BUS_DELAY_MAX_MS}" step="0.01"><b>ms</b> <select data-k="on"><option value="1">In</option><option value="0">Out</option></select>`)}`;
      body.appendChild(dPanel);
      const dq=k=>dPanel.querySelector(`[data-k="${k}"]`);
      dq('ms').value=dly.ms.toFixed(2);dq('on').value=dly.active?'1':'0';dq('ms').disabled=dq('on').disabled=!dly.known;
      dq('ms').onchange=()=>redraw(setBusDelayMs(bus,dq('ms').value));dq('on').onchange=()=>redraw(setBusDelayActive(bus,dq('on').value==='1'));
    }
  };
  select.onchange=draw;draw();
}

(function installBusTab(){
  if($('#tabBuses'))return;
  const tab=document.createElement('button');tab.className='tab';tab.type='button';tab.dataset.tab='buses';tab.textContent='Buses';
  const after=document.querySelector('.tab[data-tab="channelstate"]');
  if(after)after.insertAdjacentElement('afterend',tab);else document.querySelector('.tabs')?.appendChild(tab);
  tab.onclick=()=>activateEditorTab(tab);
  const panel=document.createElement('div');panel.id='tabBuses';panel.className='tab-panel';
  panel.innerHTML='<div class="notice safe"><strong>Group, Aux and Matrix processing:</strong> compressor (Manual RMS), PEQ and delay use the same record layouts as inputs and were confirmed with controlled Director changes on Mono Aux 1 (delay also on Stereo Aux 1). Stereo buses are written to both their Left and Right records. Other compressor models stay read-only.</div><div id="busEditor"></div>';
  const ref=document.querySelector('#tabChannelstate');if(ref)ref.insertAdjacentElement('afterend',panel);else document.querySelector('#editor')?.appendChild(panel);
})();
const renderSceneBeforeBuses=renderScene;
renderScene=function(){renderSceneBeforeBuses();renderBuses();};

if(typeof PARAMETER_MAP!=='undefined'){
  const rows=[
    ['bus-comp','Bus compressor (Manual RMS)','Compressor, {Mono|Stereo} {Group|Aux|Matrix} Channel NN [Left|Right]','127-byte state, same offsets as input: On +2, threshold +8..9, attack +10..11, release +12..13, ratio +15, makeup +16..17, knee +18'],
    ['bus-peq','Bus PEQ','Parametric EQ, {…} Channel NN [Left|Right]','38-byte state: band n at +1+9(n−1) = gain i16, frequency u16, width u16; bypass +37 (00 In)'],
    ['bus-delay','Bus delay','Mix Delay, {…} Channel NN [Left|Right]','4-byte state: raw u16 at +1..2 = ms × 96 (0…400 ms), +3 bypass (00 In)'],
  ];
  for(const [id,field,record,transform] of rows)if(!PARAMETER_MAP.some(x=>x.id===id))PARAMETER_MAP.push({id,area:'Bus processing',record,payload:'same layout as the input record',field,offset:'see transform',datatype:'per-field',transform,confidence:'verified',write:true,evidence:'Controlled Director changes on Mono Aux 1 (delay also on Stereo Aux 1, where Left and Right changed together): every changed offset matches the input layout.',notes:'Stereo buses write both records. Compressor writes are limited to the Manual RMS model.'});
}
