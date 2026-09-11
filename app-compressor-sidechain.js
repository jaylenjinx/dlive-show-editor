'use strict';

// Controlled dLive 2.12 CH16 Manual RMS scenes isolate the compressor sidechain filter block.
// Allen & Heath terminology: Lo-Cut / Low Shelf and Hi-Cut / High Shelf, plus Filter In/Out.
// The operator-labelled middle "notch" switch is retained as BPF/notch here because the
// dLive reference describes a BPF option while the controlled scene names call it notch.
// Source selection was deliberately not varied and remains untouched.
const COMP_SC_MODEL_VERIFIED=0x01; // Manual RMS
const COMP_SC_LO_TYPE_LABELS=new Map([[0x04,'Lo-Cut'],[0x06,'Low Shelf']]);
const COMP_SC_HI_TYPE_LABELS=new Map([[0x03,'Hi-Cut'],[0x07,'High Shelf']]);
const COMP_SC_LO_HZ_TO_RAW=new Map([
  [20,0x29CB],
  [100,0x5396],
  [500,0x7D62],
  [2000,0xA162],
  [5000,0xB92E],
]);
const COMP_SC_HI_HZ_TO_RAW=new Map([
  [120,0x5853],
  [200,0x6596],
  [500,0x7D62],
  [1000,0x8F62],
  [5000,0xB92D],
  [10000,0xCB2D],
  [20000,0xDD2E],
]);
const COMP_SC_LO_RAW_TO_HZ=new Map([...COMP_SC_LO_HZ_TO_RAW].map(([hz,raw])=>[raw,hz]));
const COMP_SC_HI_RAW_TO_HZ=new Map([...COMP_SC_HI_HZ_TO_RAW].map(([hz,raw])=>[raw,hz]));

function compScReadU16(dat,off){return ((dat[off]<<8)|dat[off+1])>>>0;}
function compScRawHex(raw){return raw==null?'—':`${hexByte(raw>>8)} ${hexByte(raw&255)}`;}
function compScFreqEstimate(raw){return peqFrequencyFromRaw(Number(raw));}
function compScFreqLabel(raw,table){
  const exact=table.get(raw);
  return exact!=null?formatHz(exact):`≈ ${formatHz(compScFreqEstimate(raw))}`;
}

const parseInputCompressorStatesBeforeSidechain=parseInputCompressorStates;
parseInputCompressorStates=function(dat){
  const out=parseInputCompressorStatesBeforeSidechain(dat);
  for(const c of out){
    if(c.stateLength>=127){
      c.scLoFreqOffset=c.stateStart+107;
      c.scLoFreqRaw=compScReadU16(dat,c.scLoFreqOffset);
      c.scLoFreqHz=COMP_SC_LO_RAW_TO_HZ.get(c.scLoFreqRaw)??compScFreqEstimate(c.scLoFreqRaw);
      c.scLoFreqExact=COMP_SC_LO_RAW_TO_HZ.has(c.scLoFreqRaw);

      c.scLoTypeOffset=c.stateStart+111;
      c.scLoTypeRaw=dat[c.scLoTypeOffset];
      c.scLoTypeLabel=COMP_SC_LO_TYPE_LABELS.get(c.scLoTypeRaw)||`Unknown 0x${hexByte(c.scLoTypeRaw)}`;
      c.scLoTypeKnown=COMP_SC_LO_TYPE_LABELS.has(c.scLoTypeRaw);

      c.scHiFreqOffset=c.stateStart+116;
      c.scHiFreqRaw=compScReadU16(dat,c.scHiFreqOffset);
      c.scHiFreqHz=COMP_SC_HI_RAW_TO_HZ.get(c.scHiFreqRaw)??compScFreqEstimate(c.scHiFreqRaw);
      c.scHiFreqExact=COMP_SC_HI_RAW_TO_HZ.has(c.scHiFreqRaw);

      c.scHiTypeOffset=c.stateStart+120;
      c.scHiTypeRaw=dat[c.scHiTypeOffset];
      c.scHiTypeLabel=COMP_SC_HI_TYPE_LABELS.get(c.scHiTypeRaw)||`Unknown 0x${hexByte(c.scHiTypeRaw)}`;
      c.scHiTypeKnown=COMP_SC_HI_TYPE_LABELS.has(c.scHiTypeRaw);

      c.scFilterOffset=c.stateStart+123;
      c.scFilterRaw=dat[c.scFilterOffset];
      c.scFilterKnown=c.scFilterRaw===0||c.scFilterRaw===1;
      c.scFilterActive=c.scFilterRaw===0;

      c.scMiddleOffset=c.stateStart+124;
      c.scMiddleRaw=dat[c.scMiddleOffset];
      c.scMiddleKnown=c.scMiddleRaw===0||c.scMiddleRaw===1;
      c.scMiddleActive=c.scMiddleRaw===1;

      c.scWritableShape=!!c.writableShape&&c.modelRaw===COMP_SC_MODEL_VERIFIED;
    }else{
      c.scLoFreqOffset=c.scLoTypeOffset=c.scHiFreqOffset=c.scHiTypeOffset=c.scFilterOffset=c.scMiddleOffset=null;
      c.scLoFreqRaw=c.scHiFreqRaw=c.scLoTypeRaw=c.scHiTypeRaw=c.scFilterRaw=c.scMiddleRaw=null;
      c.scLoFreqHz=c.scHiFreqHz=null;
      c.scLoFreqExact=c.scHiFreqExact=c.scLoTypeKnown=c.scHiTypeKnown=c.scFilterKnown=c.scMiddleKnown=false;
      c.scFilterActive=c.scMiddleActive=false;c.scWritableShape=false;
    }
  }
  return out;
};

function setInputCompressorSidechainToggle(channel,kind,on){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.scWritableShape)return false;
  let off,raw;
  if(kind==='filter'){
    if(!comp.scFilterKnown)return false;
    off=comp.scFilterOffset;raw=on?0:1;
    comp.scFilterRaw=raw;comp.scFilterActive=!!on;comp.scFilterKnown=true;
  }else if(kind==='middle'){
    if(!comp.scMiddleKnown)return false;
    off=comp.scMiddleOffset;raw=on?1:0;
    comp.scMiddleRaw=raw;comp.scMiddleActive=!!on;comp.scMiddleKnown=true;
  }else return false;
  state.current.stage.datBytes[off]=raw;markStageDirty();return true;
}

function setInputCompressorSidechainType(channel,kind,rawValue){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.scWritableShape)return false;
  const raw=Number(rawValue);
  if(kind==='lo'){
    if(!COMP_SC_LO_TYPE_LABELS.has(raw))return false;
    state.current.stage.datBytes[comp.scLoTypeOffset]=raw;
    comp.scLoTypeRaw=raw;comp.scLoTypeLabel=COMP_SC_LO_TYPE_LABELS.get(raw);comp.scLoTypeKnown=true;
  }else if(kind==='hi'){
    if(!COMP_SC_HI_TYPE_LABELS.has(raw))return false;
    state.current.stage.datBytes[comp.scHiTypeOffset]=raw;
    comp.scHiTypeRaw=raw;comp.scHiTypeLabel=COMP_SC_HI_TYPE_LABELS.get(raw);comp.scHiTypeKnown=true;
  }else return false;
  markStageDirty();return true;
}

function setInputCompressorSidechainFrequency(channel,kind,hzValue){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  if(!comp?.scWritableShape)return false;
  const hz=Number(hzValue);
  const map=kind==='lo'?COMP_SC_LO_HZ_TO_RAW:COMP_SC_HI_HZ_TO_RAW;
  const raw=map.get(hz);if(raw==null)return false;
  const off=kind==='lo'?comp.scLoFreqOffset:comp.scHiFreqOffset;
  writeU16BE(state.current.stage.datBytes,off,raw);
  if(kind==='lo'){
    comp.scLoFreqRaw=raw;comp.scLoFreqHz=hz;comp.scLoFreqExact=true;
  }else{
    comp.scHiFreqRaw=raw;comp.scHiFreqHz=hz;comp.scHiFreqExact=true;
  }
  markStageDirty();return true;
}

function compScSelectOptions(map){return [...map.entries()].map(([hz,raw])=>`<option value="${hz}">${formatHz(hz)}</option>`).join('');}
function compScTypeOptions(map){return [...map.entries()].map(([raw,label])=>`<option value="${raw}">${label}</option>`).join('');}

function injectCompressorSidechainUi(){
  const root=$('#channelStateEditor');if(!root||!state.current?.stage)return;
  const channel=Number(root.dataset.channel||1);
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===channel);
  const panel=root.querySelector('.details-stack > .panel');
  if(!panel||!comp||panel.querySelector('[data-k="comp-sc-filter"]'))return;

  const parallelRow=panel.querySelector('[data-k="comp-parallel"]')?.closest('.peq-field');
  const compRow=panel.querySelector('[data-k="comp"]')?.closest('.peq-field');
  const anchor=parallelRow||compRow;

  const filterRow=document.createElement('div');filterRow.className='peq-field';
  filterRow.innerHTML=`<span>Sidechain filter <small>Manual RMS verified</small></span><select data-k="comp-sc-filter"><option value="1">In</option><option value="0">Out / bypassed</option></select><code>${comp.scFilterRaw==null?'—':hexByte(comp.scFilterRaw)}</code>`;
  if(anchor)anchor.insertAdjacentElement('afterend',filterRow);else panel.appendChild(filterRow);

  const loTypeRow=document.createElement('div');loTypeRow.className='peq-field';
  loTypeRow.innerHTML=`<span>SC low filter type <small>20 Hz–5 kHz section</small></span><select data-k="comp-sc-lo-type">${compScTypeOptions(COMP_SC_LO_TYPE_LABELS)}</select><code>${comp.scLoTypeRaw==null?'—':hexByte(comp.scLoTypeRaw)}</code>`;
  filterRow.insertAdjacentElement('afterend',loTypeRow);

  const loFreqRow=document.createElement('div');loFreqRow.className='peq-field';
  loFreqRow.innerHTML=`<span>SC low filter frequency <small>verified anchors only</small></span><select data-k="comp-sc-lo-freq">${compScSelectOptions(COMP_SC_LO_HZ_TO_RAW)}</select><code>${compScRawHex(comp.scLoFreqRaw)}</code>`;
  loTypeRow.insertAdjacentElement('afterend',loFreqRow);

  const middleRow=document.createElement('div');middleRow.className='peq-field';
  middleRow.innerHTML=`<span>SC BPF / notch <small>scene-labelled notch; A&amp;H docs call out BPF</small></span><select data-k="comp-sc-middle"><option value="1">On</option><option value="0">Off</option></select><code>${comp.scMiddleRaw==null?'—':hexByte(comp.scMiddleRaw)}</code>`;
  loFreqRow.insertAdjacentElement('afterend',middleRow);

  const hiTypeRow=document.createElement('div');hiTypeRow.className='peq-field';
  hiTypeRow.innerHTML=`<span>SC high filter type <small>120 Hz–20 kHz section</small></span><select data-k="comp-sc-hi-type">${compScTypeOptions(COMP_SC_HI_TYPE_LABELS)}</select><code>${comp.scHiTypeRaw==null?'—':hexByte(comp.scHiTypeRaw)}</code>`;
  middleRow.insertAdjacentElement('afterend',hiTypeRow);

  const hiFreqRow=document.createElement('div');hiFreqRow.className='peq-field';
  hiFreqRow.innerHTML=`<span>SC high filter frequency <small>verified anchors only</small></span><select data-k="comp-sc-hi-freq">${compScSelectOptions(COMP_SC_HI_HZ_TO_RAW)}</select><code>${compScRawHex(comp.scHiFreqRaw)}</code>`;
  hiTypeRow.insertAdjacentElement('afterend',hiFreqRow);

  const filterSel=filterRow.querySelector('[data-k="comp-sc-filter"]');
  const loTypeSel=loTypeRow.querySelector('[data-k="comp-sc-lo-type"]');
  const loFreqSel=loFreqRow.querySelector('[data-k="comp-sc-lo-freq"]');
  const middleSel=middleRow.querySelector('[data-k="comp-sc-middle"]');
  const hiTypeSel=hiTypeRow.querySelector('[data-k="comp-sc-hi-type"]');
  const hiFreqSel=hiFreqRow.querySelector('[data-k="comp-sc-hi-freq"]');

  if(comp.scFilterKnown)filterSel.value=comp.scFilterActive?'1':'0';
  if(comp.scLoTypeKnown)loTypeSel.value=String(comp.scLoTypeRaw);
  if(comp.scLoFreqExact)loFreqSel.value=String(COMP_SC_LO_RAW_TO_HZ.get(comp.scLoFreqRaw));
  else{const o=document.createElement('option');o.value='';o.textContent=`Current ${compScFreqLabel(comp.scLoFreqRaw,COMP_SC_LO_RAW_TO_HZ)} (untested raw)`;o.selected=true;loFreqSel.prepend(o);}
  if(comp.scMiddleKnown)middleSel.value=comp.scMiddleActive?'1':'0';
  if(comp.scHiTypeKnown)hiTypeSel.value=String(comp.scHiTypeRaw);
  if(comp.scHiFreqExact)hiFreqSel.value=String(COMP_SC_HI_RAW_TO_HZ.get(comp.scHiFreqRaw));
  else{const o=document.createElement('option');o.value='';o.textContent=`Current ${compScFreqLabel(comp.scHiFreqRaw,COMP_SC_HI_RAW_TO_HZ)} (untested raw)`;o.selected=true;hiFreqSel.prepend(o);}

  if(!comp.scLoTypeKnown){const o=document.createElement('option');o.value='';o.textContent=comp.scLoTypeLabel;o.selected=true;loTypeSel.prepend(o);}
  if(!comp.scHiTypeKnown){const o=document.createElement('option');o.value='';o.textContent=comp.scHiTypeLabel;o.selected=true;hiTypeSel.prepend(o);}
  if(!comp.scFilterKnown){const o=document.createElement('option');o.value='';o.textContent='Unknown';o.selected=true;filterSel.prepend(o);}
  if(!comp.scMiddleKnown){const o=document.createElement('option');o.value='';o.textContent='Unknown';o.selected=true;middleSel.prepend(o);}

  if(!comp.scWritableShape){for(const el of [filterSel,loTypeSel,loFreqSel,middleSel,hiTypeSel,hiFreqSel])el.disabled=true;}
  if(!comp.scFilterKnown)filterSel.disabled=true;
  if(!comp.scMiddleKnown)middleSel.disabled=true;

  filterSel.onchange=()=>{if(setInputCompressorSidechainToggle(channel,'filter',filterSel.value==='1'))renderChannelState();else toast('Sidechain Filter In/Out write blocked.',true);};
  middleSel.onchange=()=>{if(setInputCompressorSidechainToggle(channel,'middle',middleSel.value==='1'))renderChannelState();else toast('Sidechain BPF/notch write blocked.',true);};
  loTypeSel.onchange=()=>{if(setInputCompressorSidechainType(channel,'lo',loTypeSel.value))renderChannelState();else toast('Sidechain low-filter type write blocked.',true);};
  hiTypeSel.onchange=()=>{if(setInputCompressorSidechainType(channel,'hi',hiTypeSel.value))renderChannelState();else toast('Sidechain high-filter type write blocked.',true);};
  loFreqSel.onchange=()=>{if(setInputCompressorSidechainFrequency(channel,'lo',loFreqSel.value))renderChannelState();else toast('Sidechain low-filter frequency write blocked: use a controlled anchor.',true);};
  hiFreqSel.onchange=()=>{if(setInputCompressorSidechainFrequency(channel,'hi',hiFreqSel.value))renderChannelState();else toast('Sidechain high-filter frequency write blocked: use a controlled anchor.',true);};

  const table=panel.querySelector('.config-table');
  if(table){
    const rows=[
      ['SC Filter',`state + 123 = ${comp.scFilterRaw==null?'—':hexByte(comp.scFilterRaw)}`,comp.scFilterKnown?(comp.scFilterActive?'In':'Out / bypassed'):'Unknown'],
      ['SC Low type',`state + 111 = ${comp.scLoTypeRaw==null?'—':hexByte(comp.scLoTypeRaw)}`,comp.scLoTypeLabel||'—'],
      ['SC Low freq',`state + 107..108 = ${compScRawHex(comp.scLoFreqRaw)}`,compScFreqLabel(comp.scLoFreqRaw,COMP_SC_LO_RAW_TO_HZ)],
      ['SC BPF / notch',`state + 124 = ${comp.scMiddleRaw==null?'—':hexByte(comp.scMiddleRaw)}`,comp.scMiddleKnown?(comp.scMiddleActive?'On':'Off'):'Unknown'],
      ['SC High type',`state + 120 = ${comp.scHiTypeRaw==null?'—':hexByte(comp.scHiTypeRaw)}`,comp.scHiTypeLabel||'—'],
      ['SC High freq',`state + 116..117 = ${compScRawHex(comp.scHiFreqRaw)}`,compScFreqLabel(comp.scHiFreqRaw,COMP_SC_HI_RAW_TO_HZ)],
    ];
    for(const [name,code,text] of rows){const r=document.createElement('div');r.className='config-row';r.innerHTML=`<strong>${name}</strong><code>${code}</code><span>${text}${comp.scWritableShape?' · verified/restricted write':''}</span>`;table.appendChild(r);}
  }

  const evidence=root.querySelector('.details-stack > .panel:last-child');
  if(evidence&&evidence!==panel&&!evidence.querySelector('.comp-sidechain-evidence')){
    const p=document.createElement('p');p.className='comp-sidechain-evidence';
    p.innerHTML='Controlled Manual RMS sidechain scenes isolate <code>low frequency +107..108</code>, <code>low type +111</code>, <code>high frequency +116..117</code>, <code>high type +120</code>, <code>Filter In/Out +123</code>, and the scene-labelled <code>notch/BPF +124</code>. Every adjacent frequency scene changes only its two target bytes; both Filter In/Out duplicate pairs change only <code>+123</code>.';
    evidence.appendChild(p);
  }
}

const renderChannelStateBeforeSidechain=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeSidechain();injectCompressorSidechainUi();};

if(typeof PARAMETER_MAP!=='undefined'){
  const entries=[
    {id:'input-comp-sc-lo-freq',field:'Sidechain low-filter frequency',offset:'state + 107..108',datatype:'uint16 big-endian logarithmic frequency coordinate',transform:'scene-proven anchors: 20 Hz=29CB, 100=5396, 500=7D62, 2 kHz=A162, 5 kHz=B92E',evidence:'Controlled CH16 scenes sc lpf 20hz/100hz/500hz/2000hz/5000hz; each adjacent scene changes only these two bytes outside scene-label bytes.',notes:'A&H reference range is 20 Hz–5 kHz. Writer exposes exact controlled anchors only.'},
    {id:'input-comp-sc-lo-type',field:'Sidechain low-filter type',offset:'state + 111',datatype:'uint8 enum',transform:'04 = Lo-Cut; 06 = Low Shelf',evidence:'Controlled CH16 filter low cut vs filter low shelf changes only state +111 outside scene-label bytes.',notes:'Official dLive terminology is Lo-Cut / shelf.'},
    {id:'input-comp-sc-hi-freq',field:'Sidechain high-filter frequency',offset:'state + 116..117',datatype:'uint16 big-endian logarithmic frequency coordinate',transform:'scene-proven anchors: 120 Hz=5853, 200=6596, 500=7D62, 1 kHz=8F62, 5 kHz=B92D, 10 kHz=CB2D, 20 kHz=DD2E',evidence:'Controlled CH16 scenes sc hpf 20khz/10khz/5khz/1khz/500hz/200hz/120hz; each adjacent scene changes only these two bytes outside scene-label bytes.',notes:'A&H reference range is 120 Hz–20 kHz. Writer exposes exact controlled anchors only.'},
    {id:'input-comp-sc-hi-type',field:'Sidechain high-filter type',offset:'state + 120',datatype:'uint8 enum',transform:'03 = Hi-Cut; 07 = High Shelf',evidence:'Controlled CH16 filter high cut vs filter high shelf changes only state +120 outside scene-label bytes.',notes:'Official dLive terminology is Hi-Cut / shelf.'},
    {id:'input-comp-sc-filter',field:'Sidechain Filter In/Out',offset:'state + 123',datatype:'uint8',transform:'00 = In/active; 01 = Out/bypassed',evidence:'Two independent Filter On/Off CH16 pairs toggle only state +123 outside scene-label bytes.',notes:'Writer guarded to the verified current-format Manual RMS record shape.'},
    {id:'input-comp-sc-middle',field:'Sidechain BPF / scene-labelled notch',offset:'state + 124',datatype:'uint8',transform:'00 = Off; 01 = On',evidence:'Controlled CH16 filter notch on/off pair changes only state +124 outside scene-label bytes.',notes:'Operator scene labels call this notch; A&H documentation describes a BPF option. Exact UI semantic naming is intentionally recorded as BPF/notch. Source selection remains unmapped.'},
  ];
  for(const e of entries)if(!PARAMETER_MAP.some(x=>x.id===e.id))PARAMETER_MAP.push({area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',confidence:'verified',write:true,...e});
}

if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='channel-state');
  if(sec&&!sec.html.includes('Compressor sidechain filter — verified restricted write')){
    sec.html+=`
      <h2>Compressor sidechain filter — verified restricted write</h2>
      <pre><code>low frequency = state +107..108
low type      = state +111   (04 Lo-Cut / 06 Low Shelf)
high frequency= state +116..117
high type     = state +120   (03 Hi-Cut / 07 High Shelf)
Filter In/Out = state +123   (00 In / 01 Out)
BPF/notch     = state +124   (00 Off / 01 On)</code></pre>
      <p>The controlled low-frequency series covers <code>20 Hz, 100 Hz, 500 Hz, 2 kHz, 5 kHz</code>; the high-frequency series covers <code>120 Hz, 200 Hz, 500 Hz, 1 kHz, 5 kHz, 10 kHz, 20 kHz</code>. Every adjacent scene changes only the target two bytes. These ranges independently match Allen &amp; Heath's published sidechain Lo-Cut and Hi-Cut ranges.</p>
      <p>Low type <code>04→06</code> isolates Lo-Cut vs Low Shelf. High type <code>03→07</code> isolates Hi-Cut vs High Shelf. Duplicate Filter In/Out scenes isolate <code>+123</code>. The operator-labelled notch pair isolates <code>+124</code>; A&amp;H documentation describes a BPF option, so the editor labels this conservatively as BPF/notch.</p>
      <div class="docs-callout"><strong>Writer guard:</strong> sidechain writes are currently enabled only on Manual RMS <code>01</code>. Frequency writes use exact scene-proven anchors only. Sidechain Source was not included in the test and remains untouched.</div>`;
  }
}
