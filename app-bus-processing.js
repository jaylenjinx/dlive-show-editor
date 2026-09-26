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
  // Main (needs a Main type other than None): with LR+M, Main Channel 01 is the stereo LR pair, 03 is the mono M
  // (both exercised in Director) and 04 exists but was not exercised.
  {key:'main',label:'Main',mono:'Main',stereo:'Main',monoMgr:'mains',stMgr:'mains',short:'Main',stShort:'Main',monoNums:[3,4],stNums:[1],titles:{'st1':'Main LR','mono3':'Main M','mono4':'Main 4 (not exercised)'}},
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
      const nums=stereo?(k.stNums||null):(k.monoNums||null);
      for(const n of (nums||Array.from({length:64},(_,i)=>i+1))){
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
        if(!ok){if(nums)continue;break;}
        const mgr=stage.managers?.find(x=>x.key===(stereo?k.stMgr:k.monoMgr));
        const name=mgr?.items?.[n-1]?.name||'';
        buses.push({id:`${k.key}-${stereo?'st':'mono'}-${n}`,kind:k,stereo,n,name,title:k.titles?.[`${stereo?'st':'mono'}${n}`]||`${stereo?k.stShort:k.short} ${n}${name?` · ${name}`:''}`,rec});
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

// ---- other compressor models (Director library presets; controlled changes on Main LR) ----
// Ducker (model 05): threshold +8..9 (int16/256, −46…+18), attack +10..11, release +12..13, hold +25..26 (time_log),
// depth +23..24 (int16/256, 0…60 dB).
const BUS_DUCKER_MODEL=0x05;
const BUS_DUCKER_LIMITS={attack:[0.03,300],hold:[10,5000],release:[50,2000],threshold:[-46,18],depth:[0,60]};
function busOtherCompView(bus){
  const dat=state.current.stage.datBytes,c=bus.rec.comp[0],s=c.stateStart;
  if(c.stateLength!==127||dat[s]!==0x08)return null;
  const model=dat[s+1],shape=dat[s+2]===0||dat[s+2]===1;if(!shape)return null;
  if(model===BUS_DUCKER_MODEL)return {kind:'ducker',thresholdDb:readI16BE(dat,s+8)/256,attackMs:compTimeEstimateMs(readU16BE(dat,s+10)),releaseMs:compTimeEstimateMs(readU16BE(dat,s+12)),depthDb:readI16BE(dat,s+23)/256,holdMs:compTimeEstimateMs(readU16BE(dat,s+25))};
  return null;
}
function busOtherCompWrite(bus,fn){if(!busOtherCompView(bus))return false;const dat=state.current.stage.datBytes;for(const c of bus.rec.comp)fn(dat,c.stateStart);markStageDirty();return true;}
function setBusDucker(bus,field,value){
  const v=busOtherCompView(bus);if(v?.kind!=='ducker')return false;const x=Number(value);if(!Number.isFinite(x))return false;
  const [lo,hi]=BUS_DUCKER_LIMITS[field],c=Math.max(lo,Math.min(hi,x));
  if(field==='threshold'){const raw=Math.round(c*256);return busOtherCompWrite(bus,(d,s)=>writeI16BE(d,s+8,raw));}
  if(field==='depth'){const raw=Math.round(c*256);return busOtherCompWrite(bus,(d,s)=>writeI16BE(d,s+23,raw));}
  const raw=compTimeRawFromMs(c),off={attack:10,release:12,hold:25}[field];
  return busOtherCompWrite(bus,(d,s)=>writeU16BE(d,s+off,raw));
}
// ---- knob-swept models: 16T (03), 16VU (04), Mighty (07), OptTronik (08), CompStortion (0A) ----
// Offsets and end-stop ranges from knob/button sweeps on input 13 (no on-screen readouts, so ranges are the swept end stops).
// kind: i16 = int16/256 dB, u8 = byte, time = time_log word (ms), bool = 00/01, enum = listed values.
const BUS_MODEL_CONTROLS={
  0x03:[{k:'thr',l:'Threshold',off:8,kind:'i16',min:-46,max:18,u:'dB'},{k:'ratio',l:'Ratio knob position',off:15,kind:'u8',min:0,max:40},{k:'out',l:'Output',off:16,kind:'i16',min:-18,max:18,u:'dB'},{k:'knee',l:'Knee',off:18,kind:'bool'}],
  0x04:[{k:'thr',l:'Threshold',off:8,kind:'i16',min:-46,max:18,u:'dB'},{k:'ratio',l:'Compression knob position',off:15,kind:'u8',min:0,max:40},{k:'gain',l:'Gain',off:16,kind:'i16',min:-18,max:18,u:'dB'}],
  0x07:[{k:'thr',l:'Threshold',off:39,kind:'i16',min:-36,max:18,u:'dBv'},{k:'rel',l:'Release (time_log word)',off:41,kind:'time',min:5,max:1400,u:'ms'},{k:'out',l:'Output',off:16,kind:'i16',min:-18,max:18,u:'dB'},{k:'det',l:'Detector avg',off:38,kind:'bool'}],
  0x08:[{k:'peak',l:'Peak reduction',off:47,kind:'u8',min:0,max:100},{k:'gain',l:'Gain',off:49,kind:'u8',min:0,max:100},{k:'limit',l:'Limit (off = Compress)',off:45,kind:'bool'},{k:'unit',l:'Unit B',off:33,kind:'bool'}],
  0x0A:[{k:'ratio',l:'Ratio',off:58,kind:'enum',opts:[[0,'2:1'],[1,'3:1'],[2,'4:1'],[3,'6:1'],[4,'10:1'],[5,'20:1'],[6,'Smash'],[7,'Brit']]},{k:'att',l:'Attack',off:60,kind:'u8',min:0,max:100},{k:'rel',l:'Release',off:62,kind:'u8',min:0,max:100},{k:'in',l:'Input',off:63,kind:'i16',min:-66,max:15.5,u:'dB'},{k:'out',l:'Output',off:65,kind:'i16',min:-75,max:30,u:'dB'},{k:'dist',l:'Distortion',off:67,kind:'bool'},{k:'det',l:'Detector',off:68,kind:'bool'}],
};
function busModelView(bus){
  const dat=state.current.stage.datBytes,c=bus.rec.comp[0],s=c.stateStart;
  if(c.stateLength!==127||dat[s]!==0x08)return null;const list=BUS_MODEL_CONTROLS[dat[s+1]];if(!list)return null;
  return {model:dat[s+1],list,values:Object.fromEntries(list.map(d=>[d.k,d.kind==='i16'?readI16BE(dat,s+d.off)/256:d.kind==='time'?compTimeEstimateMs(readU16BE(dat,s+d.off)):dat[s+d.off]]))};
}
function setBusModelControl(bus,key,value){
  const v=busModelView(bus);const d=v?.list.find(x=>x.k===key);if(!d)return false;const x=Number(value);if(!Number.isFinite(x))return false;
  const dat=state.current.stage.datBytes;let apply;
  if(d.kind==='i16'){const r=Math.round(Math.max(d.min,Math.min(d.max,x))*256);apply=(b,s)=>writeI16BE(b,s+d.off,r);}
  else if(d.kind==='time'){const r=compTimeRawFromMs(Math.max(d.min,Math.min(d.max,x)));apply=(b,s)=>writeU16BE(b,s+d.off,r);}
  else if(d.kind==='u8'){const r=Math.round(Math.max(d.min,Math.min(d.max,x)));apply=(b,s)=>{b[s+d.off]=r;};}
  else if(d.kind==='bool'){const r=x?1:0;apply=(b,s)=>{b[s+d.off]=r;};}
  else if(d.kind==='enum'){if(!d.opts.some(o=>o[0]===x))return false;apply=(b,s)=>{b[s+d.off]=x;};}
  else return false;
  for(const c of bus.rec.comp)apply(dat,c.stateStart);markStageDirty();return true;
}

// ---- Peak Limiter 76 (model 06) ----
// Knob sweeps on input 13: Input +34 and Output +36 are signed bytes (Input −40…+18, Output −80 (∞)…+18), Attack +28..29 is a
// time_log word in nanoseconds (20…277.5 µs), Release +30..31 a time_log word in ms (95…2497 ms), Ratio +27 (00 All, 01 4, 02 8,
// 03 12, 04 20), Gain Link +32, Unit +33 (01 = unit 2, 00 = unit 1).
const BUS_PL76_MODEL=0x06;
const BUS_PL76_RATIOS=new Map([[0,'All'],[1,'4'],[2,'8'],[3,'12'],[4,'20']]);
const BUS_PL76_LIMITS={input:[-40,18],output:[-80,18],attack:[19.98,277.5],release:[95.1,2497]};
function busPl76View(bus){
  const dat=state.current.stage.datBytes,c=bus.rec.comp[0],s=c.stateStart;
  if(c.stateLength!==127||dat[s]!==0x08||dat[s+1]!==BUS_PL76_MODEL)return null;
  const i8=b=>b>127?b-256:b;
  return {input:i8(dat[s+34]),output:i8(dat[s+36]),attackUs:Math.pow(10,(readU16BE(dat,s+28)-17874)/5958)/1000,releaseMs:compTimeEstimateMs(readU16BE(dat,s+30)),ratio:dat[s+27],link:dat[s+32]===1,unit2:dat[s+33]===1};
}
function busPl76Write(bus,fn){if(!busPl76View(bus))return false;const dat=state.current.stage.datBytes;for(const c of bus.rec.comp)fn(dat,c.stateStart);markStageDirty();return true;}
function setBusPl76(bus,field,value){
  const x=Number(value);if(field!=='link'&&field!=='unit2'&&!Number.isFinite(x))return false;
  const clamp=k=>Math.max(BUS_PL76_LIMITS[k][0],Math.min(BUS_PL76_LIMITS[k][1],x));
  if(field==='input'){const v=Math.round(clamp('input'))&255;return busPl76Write(bus,(d,s)=>{d[s+34]=v;});}
  if(field==='output'){const v=Math.round(clamp('output'))&255;return busPl76Write(bus,(d,s)=>{d[s+36]=v;});}
  if(field==='attack'){const raw=Math.round(17874+5958*Math.log10(clamp('attack')*1000));return busPl76Write(bus,(d,s)=>writeU16BE(d,s+28,raw));}
  if(field==='release'){const raw=compTimeRawFromMs(clamp('release'));return busPl76Write(bus,(d,s)=>writeU16BE(d,s+30,raw));}
  if(field==='ratio'){if(!BUS_PL76_RATIOS.has(x))return false;return busPl76Write(bus,(d,s)=>{d[s+27]=x;});}
  if(field==='link')return busPl76Write(bus,(d,s)=>{d[s+32]=value?1:0;});
  if(field==='unit2')return busPl76Write(bus,(d,s)=>{d[s+33]=value?1:0;});
  return false;
}

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
  if(!buses.length){root.innerHTML='<div class="notice warn">No group, aux, matrix or main processing records were found in this scene.</div>';return;}
  const toolbar=document.createElement('section');toolbar.className='panel peq-toolbar';
  toolbar.innerHTML='<div class="manager-head inline"><h2>Bus</h2><span class="confidence verified">CONTROLLED-DIFF VERIFIED</span></div>';
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
    const pl=c.writable?null:busPl76View(bus);
    if(pl){
      const pp=document.createElement('section');pp.className='panel';
      pp.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} Peak Limiter 76</h2><span class="confidence decoded">END STOPS SWEPT</span></div>
        <div class="notice warn">Knob scales were inferred from end-stop and step sweeps (no on-screen readouts); values between are the continuous coordinate, not verified detents.</div>
        ${busField('Input','signed byte −40…+18',`<input data-k="pl-input" type="number" step="1" min="-40" max="18">`)}
        ${busField('Output','signed byte −80 (∞)…+18',`<input data-k="pl-output" type="number" step="1" min="-80" max="18">`)}
        ${busField('Attack','20–277.5 µs',`<input data-k="pl-attack" type="number" step="0.1" min="19.98" max="277.5"><b>µs</b>`)}
        ${busField('Release','95–2497 ms',`<input data-k="pl-release" type="number" step="1" min="95.1" max="2497"><b>ms</b>`)}
        ${busField('Ratio','',`<select data-k="pl-ratio">${[...BUS_PL76_RATIOS].map(([r,l])=>`<option value="${r}">${l}</option>`).join('')}</select>`)}
        ${busField('Gain link','',`<select data-k="pl-link"><option value="0">Off</option><option value="1">On</option></select>`)}
        ${busField('Unit','',`<select data-k="pl-unit"><option value="0">1</option><option value="1">2</option></select>`)}`;
      body.appendChild(pp);const pq=k=>pp.querySelector(`[data-k="${k}"]`);
      pq('pl-input').value=String(pl.input);pq('pl-output').value=String(pl.output);pq('pl-attack').value=pl.attackUs.toFixed(1);pq('pl-release').value=String(Math.round(pl.releaseMs));
      pq('pl-ratio').value=String(pl.ratio);pq('pl-link').value=pl.link?'1':'0';pq('pl-unit').value=pl.unit2?'1':'0';
      for(const [k,f] of [['pl-input','input'],['pl-output','output'],['pl-attack','attack'],['pl-release','release'],['pl-ratio','ratio']])pq(k).onchange=()=>redraw(setBusPl76(bus,f,pq(k).value));
      pq('pl-link').onchange=()=>redraw(setBusPl76(bus,'link',pq('pl-link').value==='1'));pq('pl-unit').onchange=()=>redraw(setBusPl76(bus,'unit2',pq('pl-unit').value==='1'));
    }
    const oc=c.writable||pl?null:busOtherCompView(bus);
    if(oc){
      const op=document.createElement('section');op.className='panel';
      op.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} ducker</h2><span class="confidence verified">VERIFIED WRITE</span></div>
          ${['attack','hold','release'].map(k=>busField(k[0].toUpperCase()+k.slice(1),`${BUS_DUCKER_LIMITS[k][0]}…${BUS_DUCKER_LIMITS[k][1]} ms`,`<input data-k="dk-${k}" type="number" step="0.1" min="${BUS_DUCKER_LIMITS[k][0]}" max="${BUS_DUCKER_LIMITS[k][1]}"><b>ms</b>`)).join('')}
          ${busField('Threshold','−46…+18 dB',`<input data-k="dk-threshold" type="number" step="0.1" min="-46" max="18"><b>dB</b>`)}
          ${busField('Depth','0…60 dB',`<input data-k="dk-depth" type="number" step="0.1" min="0" max="60"><b>dB</b>`)}`;
      body.appendChild(op);
      const oq=k=>op.querySelector(`[data-k="${k}"]`);
      const vals={attack:oc.attackMs,hold:oc.holdMs,release:oc.releaseMs,threshold:oc.thresholdDb,depth:oc.depthDb};
      for(const k of Object.keys(vals)){oq(`dk-${k}`).value=String(Number(vals[k].toPrecision(4)));oq(`dk-${k}`).onchange=()=>redraw(setBusDucker(bus,k,oq(`dk-${k}`).value));}
    }
    const mv=c.writable||pl||oc?null:busModelView(bus);
    if(mv){
      const mp=document.createElement('section');mp.className='panel';
      mp.innerHTML=`<div class="manager-head inline"><h2>${escapeHtml(bus.title)} ${escapeHtml(compressorModelLabel(mv.model))}</h2><span class="confidence decoded">END STOPS SWEPT</span></div>
        <div class="notice warn">This model has no numeric readouts in Director. Ranges are the swept knob end stops; values between them are the continuous coordinate, not verified detents. Controls not listed here are unmapped.</div>
        ${mv.list.map(d=>busField(d.l,d.kind==='bool'?'':d.kind==='enum'?'':`${d.min}…${d.max}${d.u?' '+d.u:''}`,d.kind==='bool'?`<select data-k="m-${d.k}"><option value="0">Off</option><option value="1">On</option></select>`:d.kind==='enum'?`<select data-k="m-${d.k}">${d.opts.map(([r,l])=>`<option value="${r}">${l}</option>`).join('')}</select>`:`<input data-k="m-${d.k}" type="number" step="${d.kind==='u8'?1:0.1}" min="${d.min}" max="${d.max}">`)).join('')}`;
      body.appendChild(mp);
      for(const d of mv.list){const el=mp.querySelector(`[data-k="m-${d.k}"]`),val=mv.values[d.k];el.value=d.kind==='bool'||d.kind==='enum'||d.kind==='u8'?String(val):String(Number(val.toPrecision(4)));el.onchange=()=>redraw(setBusModelControl(bus,d.k,el.value));}
    }

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
  panel.innerHTML='<div class="notice safe"><strong>Group, Aux and Matrix processing:</strong> compressor (Manual RMS), PEQ and delay use the same record layouts as inputs and were confirmed with controlled Director changes on Mono Aux, Group and Matrix 1, Stereo Aux 1 and Main LR/M. Stereo buses are written to both their Left and Right records. Other compressor models stay read-only.</div><div id="busEditor"></div>';
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
