'use strict';

// Input LPF decoder/editor — dLive 2.12.
// Controlled CH16 clones isolate frequency at state +3..+4 and bypass at +10.
// The remaining bytes are preserved exactly because real-show evidence shows
// filter-shape/state variation that has not yet been independently decoded.

const LPF_MIN_HZ=20;
const LPF_MAX_HZ=20000;
const LPF_MIN_RAW=0x29cb; // controlled 20 Hz endpoint
const LPF_MAX_RAW=0xdd2e; // controlled 20 kHz endpoint

function lpfFrequencyFromRaw(raw){ return 4*Math.pow(2,raw/4608); }
function lpfFrequencyToRaw(hz){
  const f=Math.max(LPF_MIN_HZ,Math.min(LPF_MAX_HZ,Number(hz)||LPF_MIN_HZ));
  // The observed dLive upper endpoint is one code above floor(log mapping),
  // so reproduce that endpoint exactly rather than extrapolating it.
  if(f>=LPF_MAX_HZ)return LPF_MAX_RAW;
  return Math.max(LPF_MIN_RAW,Math.min(LPF_MAX_RAW,Math.floor(4608*Math.log2(f/4))));
}

function parseInputLpfs(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`Lowpass Filter Input Channel ${String(channel).padStart(2,'0')}`;
    const sig=asciiBytes(label),pos=indexOfBytes(dat,sig);
    if(pos<2)continue;
    const payloadLength=readU16BE(dat,pos-2),frameStart=pos-2,frameEnd=frameStart+2+payloadLength;
    if(frameEnd>dat.length||dat[pos+sig.length]!==0)continue;
    const stateStart=pos+sig.length+1,stateLength=frameEnd-stateStart;
    if(stateLength!==11)continue;
    const discriminator=dat[stateStart];
    const frequencyRaw=readU16BE(dat,stateStart+3);
    const bypassRaw=dat[stateStart+10];
    out.push({
      channel,label,frameStart,payloadLength,totalLength:payloadLength+2,stateStart,stateLength,
      discriminator,frequencyRaw,frequencyHz:lpfFrequencyFromRaw(frequencyRaw),bypassRaw,
      active:bypassRaw===0,bypassKnown:bypassRaw===0||bypassRaw===1,
      shapeMatchesReference:discriminator===0x04,
      preservedA:dat.slice(stateStart+1,stateStart+3),
      preservedShape:dat.slice(stateStart+5,stateStart+10),
      raw:dat.slice(stateStart,frameEnd),
    });
  }
  return out;
}

function ensureInputLpfs(){
  const stage=state.current?.stage;
  if(stage&&!stage.lpfs)stage.lpfs=parseInputLpfs(stage.datBytes);
  return stage?.lpfs||[];
}
function getInputLpf(channel){return ensureInputLpfs().find(x=>x.channel===Number(channel))||null;}

function refreshInputLpf(l){
  l.raw=state.current.stage.datBytes.slice(l.stateStart,l.stateStart+11);
  l.preservedA=state.current.stage.datBytes.slice(l.stateStart+1,l.stateStart+3);
  l.preservedShape=state.current.stage.datBytes.slice(l.stateStart+5,l.stateStart+10);
}

function setLpfFrequency(channel,hz){
  const l=getInputLpf(channel);if(!l||!l.shapeMatchesReference)return false;
  const raw=lpfFrequencyToRaw(hz);
  writeU16BE(state.current.stage.datBytes,l.stateStart+3,raw);
  l.frequencyRaw=raw;l.frequencyHz=lpfFrequencyFromRaw(raw);refreshInputLpf(l);
  markStageDirty();return true;
}
function setLpfActive(channel,on){
  const l=getInputLpf(channel);if(!l||!l.shapeMatchesReference)return false;
  const raw=on?0:1;
  state.current.stage.datBytes[l.stateStart+10]=raw;
  l.bypassRaw=raw;l.active=!!on;l.bypassKnown=true;refreshInputLpf(l);
  markStageDirty();return true;
}

function renderLpf(){
  const root=$('#lpfEditor');if(!root)return;
  root.innerHTML='';
  const lpfs=ensureInputLpfs();
  if(!lpfs.length){root.innerHTML='<div class="notice warn">No recognised current-format input LPF records were found.</div>';return;}
  const inputs=state.current.stage.managers.find(x=>x.key==='inputs');

  const toolbar=document.createElement('section');toolbar.className='panel peq-toolbar';
  toolbar.innerHTML='<div class="manager-head inline"><h2>Input channel</h2><span class="confidence verified">VERIFIED WRITE</span></div>';
  const select=document.createElement('select');select.className='peq-channel-select';
  for(const l of lpfs){
    const name=inputs?.items[l.channel-1]?.name||'';
    const o=document.createElement('option');o.value=l.channel;o.textContent=`CH ${l.channel}${name?` · ${name}`:''}`;select.appendChild(o);
  }
  const remembered=Number(root.dataset.channel||16);
  select.value=lpfs.some(l=>l.channel===remembered)?String(remembered):String(lpfs[0].channel);
  toolbar.appendChild(select);root.appendChild(toolbar);
  const details=document.createElement('div');details.className='details-stack';root.appendChild(details);

  const draw=()=>{
    root.dataset.channel=select.value;details.innerHTML='';
    const l=getInputLpf(select.value);if(!l)return;
    const panel=document.createElement('section');panel.className='panel';
    panel.innerHTML=`
      <div class="manager-head inline"><h2>CH ${l.channel} low-pass filter</h2><code>frame 0x${l.frameStart.toString(16)}</code></div>
      <div class="peq-field"><span>LPF <small>state +10: 00 active, 01 bypassed</small></span><select data-k="active"><option value="1">On</option><option value="0">Off</option></select><code>${hexByte(l.bypassRaw)}</code></div>
      <div class="peq-field"><span>Frequency <small>verified 20 Hz–20 kHz coordinate</small></span><div><input data-k="freq" type="number" min="20" max="20000" step="1" value="${Math.round(l.frequencyHz)}"><b>Hz</b></div><code>${hexByte(l.frequencyRaw>>8)} ${hexByte(l.frequencyRaw&255)}</code></div>
      <div class="config-table">
        <div class="config-row"><strong>Raw state</strong><code>${hexRange(l.raw)}</code><span class="confidence verified">11 BYTES</span></div>
        <div class="config-row"><strong>Byte 0</strong><code>0x${hexByte(l.discriminator)}</code><span>${l.discriminator===4?'Observed LPF discriminator/type':'Unexpected value — writes blocked'}</span></div>
        <div class="config-row"><strong>Bytes 1–2</strong><code>${hexRange(l.preservedA)}</code><span>Preserved exactly</span></div>
        <div class="config-row"><strong>Bytes 5–9</strong><code>${hexRange(l.preservedShape)}</code><span>Filter shape/state — preserved exactly</span></div>
      </div>`;
    details.appendChild(panel);

    const activeSel=panel.querySelector('[data-k="active"]'),freqInput=panel.querySelector('[data-k="freq"]');
    activeSel.value=l.active?'1':'0';
    if(!l.bypassKnown||!l.shapeMatchesReference){activeSel.disabled=true;freqInput.disabled=true;}
    activeSel.onchange=()=>{if(setLpfActive(l.channel,activeSel.value==='1'))renderLpf();};
    freqInput.onchange=e=>{if(setLpfFrequency(l.channel,e.target.value))renderLpf();};

    const evidence=document.createElement('section');evidence.className='panel';
    evidence.innerHTML=`
      <h2>Controlled verification</h2>
      <pre><code>04 00 00 FF FF SS SS SS SS SS BB
         └─┬─┘             └─ bypass
           └──────────────── frequency</code></pre>
      <p>CH16 clones at LPF Off, On 20 kHz, 10 kHz, 5 kHz, 1 kHz, 500 Hz, 200 Hz, 50 Hz and 20 Hz isolate only the final bypass byte or the two frequency bytes. The rest of the 11-byte state is preserved.</p>
      <p>Frequency uses the same high-resolution logarithmic coordinate as PEQ/HPF. The observed 20 kHz endpoint is <code>DD 2E</code>, which the writer reproduces explicitly.</p>
      <div class="notice safe"><strong>Verified LPF write:</strong> only state bytes +3..+4 for frequency and +10 for bypass are modified.</div>`;
    details.appendChild(evidence);
  };
  select.onchange=draw;draw();
}

// Register LPF fields in the interactive parameter map.
if(typeof PARAMETER_MAP!=='undefined')PARAMETER_MAP.push(
  {id:'lpf-discriminator',area:'Input LPF',record:'Lowpass Filter Input Channel NN',payload:'11 state bytes after NUL label terminator',field:'LPF discriminator/type',offset:'state + 0',datatype:'uint8',transform:'observed 0x04 in current 2.12 input LPF records',confidence:'decoded',write:false,evidence:'Controlled LPF scene set plus real event show',notes:'Parser/write guard only; not a user parameter.'},
  {id:'lpf-frequency',area:'Input LPF',record:'Lowpass Filter Input Channel NN',payload:'11 state bytes after NUL label terminator',field:'LPF frequency',offset:'state + 3..4',datatype:'uint16 big-endian',transform:'raw = floor(4608 × log2(f/4)) across tested interior values; observed endpoint 20 kHz = 0xDD2E',confidence:'verified',write:true,evidence:'Controlled CH16 clones: 20 kHz, 10 kHz, 5 kHz, 1 kHz, 500 Hz, 200 Hz, 50 Hz, 20 Hz; each changes only these two bytes',notes:'Editor range 20–20000 Hz. Writer emits the observed 0xDD2E upper endpoint exactly.'},
  {id:'lpf-shape-state',area:'Input LPF',record:'Lowpass Filter Input Channel NN',payload:'11 state bytes after NUL label terminator',field:'Preserved filter shape/state',offset:'state + 1..2 and +5..9',datatype:'7 raw bytes',transform:'not fully decoded',confidence:'located',write:false,evidence:'Real event show contains legitimate variation in bytes +5..6 while controlled frequency/bypass tests leave them unchanged',notes:'Always preserved exactly by the LPF writer.'},
  {id:'lpf-bypass',area:'Input LPF',record:'Lowpass Filter Input Channel NN',payload:'11 state bytes after NUL label terminator',field:'LPF bypass / enable',offset:'state + 10',datatype:'uint8',transform:'0x00 = active/on; 0x01 = bypassed/off',confidence:'verified',write:true,evidence:'Controlled LPF Off vs LPF On 20 kHz differs only at this byte outside the scene label',notes:'Writer changes one byte only.'}
);

// Register built-in documentation.
if(typeof DOC_SECTIONS!=='undefined'){
  const i=DOC_SECTIONS.findIndex(s=>s.id==='channel-state');
  DOC_SECTIONS.splice(i<0?DOC_SECTIONS.length:i,0,{
    id:'lpf',title:'Input LPF',eyebrow:'Verified write',
    html:`
      <h1>Input low-pass filter</h1>
      <p>Controlled dLive 2.12 CH16 clones resolve the write-safe parts of the separate <code>Lowpass Filter Input Channel NN</code> record.</p>
      <pre><code>04 00 00 FF FF SS SS SS SS SS BB
│        └─┬─┘                └─ bypass: 00 On, 01 Off
│          └──────────────────── frequency
└─────────────────────────────── observed LPF discriminator</code></pre>
      <h2>Frequency</h2>
      <p>The two-byte field at <code>state +3..+4</code> uses the same high-resolution logarithmic coordinate as PEQ and HPF. Controlled scenes cover 20 Hz through 20 kHz. The upper endpoint is explicitly observed as <code>0xDD2E</code>.</p>
      <h2>Bypass</h2>
      <pre><code>state +10 = 00  -> LPF active/on
state +10 = 01  -> LPF bypassed/off</code></pre>
      <p><code>LPF Off</code> versus <code>LPF On 20khz</code> changes only this byte outside the scene label.</p>
      <h2>Preserved filter-shape bytes</h2>
      <p>Bytes <code>+1..+2</code> and <code>+5..+9</code> are not written. Real-event data shows legitimate variation in this region, so the editor preserves it exactly until separate slope/Q/type experiments identify those fields.</p>
      <div class="docs-callout"><strong>Writer boundary:</strong> only bytes <code>+3..+4</code> for frequency and <code>+10</code> for bypass are modified.</div>`
  });
}

// Extend scene rendering without changing the core renderer.
const renderSceneBeforeLpf=renderScene;
renderScene=function(){renderSceneBeforeLpf();renderLpf();};
