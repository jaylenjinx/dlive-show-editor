'use strict';

// Controlled dLive 2.12 CH16 Manual RMS ratio scenes isolate compressor state +15.
// The raw byte behaves as a discrete ratio table/index. Only directly observed
// ratio choices are writable; untested intermediate raw values remain preserved.
const COMP_RATIO_MODEL_VERIFIED=0x01; // Manual RMS
const COMP_RATIO_RAW_TO_LABEL=new Map([
  [0x00,'1:1'],
  [0x10,'2:1'],
  [0x18,'4:1'],
  [0x24,'12:1'],
  [0x26,'20:1'],
  [0x27,'40:1'],
  [0x28,'∞:1'],
]);
const COMP_RATIO_WRITABLE_RAW=new Set(COMP_RATIO_RAW_TO_LABEL.keys());

function compressorRatioLabel(raw){return COMP_RATIO_RAW_TO_LABEL.get(Number(raw))||`Raw 0x${hexByte(Number(raw)||0)}`;}

const parseInputCompressorStatesBeforeRatio=parseInputCompressorStates;
parseInputCompressorStates=function(dat){
  const out=parseInputCompressorStatesBeforeRatio(dat);
  for(const c of out){
    if(c.stateLength>15){
      c.ratioOffset=c.stateStart+15;
      c.ratioRaw=dat[c.ratioOffset];
      c.ratioLabel=compressorRatioLabel(c.ratioRaw);
      c.ratioKnown=COMP_RATIO_RAW_TO_LABEL.has(c.ratioRaw);
      c.ratioWritableShape=!!c.writableShape&&c.modelRaw===COMP_RATIO_MODEL_VERIFIED&&c.ratioKnown;
    }else{
      c.ratioOffset=null;c.ratioRaw=null;c.ratioLabel=null;c.ratioKnown=false;c.ratioWritableShape=false;
    }
  }
  return out;
};

function setInputCompressorRatioRaw(channel,raw){
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===Number(channel));
  raw=Number(raw);
  if(!comp?.ratioWritableShape||!COMP_RATIO_WRITABLE_RAW.has(raw))return false;
  state.current.stage.datBytes[comp.ratioOffset]=raw;
  comp.ratioRaw=raw;comp.ratioLabel=compressorRatioLabel(raw);comp.ratioKnown=true;
  markStageDirty();return true;
}

function injectCompressorRatioUi(){
  const root=$('#channelStateEditor');if(!root||!state.current?.stage)return;
  const channel=Number(root.dataset.channel||1);
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===channel);
  const panel=root.querySelector('.details-stack > .panel');
  if(!panel||!comp||panel.querySelector('[data-k="comp-ratio"]'))return;

  const thresholdRow=panel.querySelector('[data-k="comp-threshold"]')?.closest('.peq-field');
  const compRow=panel.querySelector('[data-k="comp"]')?.closest('.peq-field');
  const row=document.createElement('div');row.className='peq-field';
  const options=[...COMP_RATIO_RAW_TO_LABEL.entries()].map(([raw,label])=>`<option value="${raw}">${label}</option>`).join('');
  row.innerHTML=`
    <span>Compressor ratio <small>Manual RMS verified choices only</small></span>
    <select data-k="comp-ratio">${options}</select>
    <code>${comp.ratioRaw==null?'—':hexByte(comp.ratioRaw)}</code>`;
  (thresholdRow||compRow)?.insertAdjacentElement('afterend',row) || panel.appendChild(row);

  const select=row.querySelector('[data-k="comp-ratio"]');
  if(comp.ratioKnown)select.value=String(comp.ratioRaw);
  if(!comp.ratioWritableShape){
    select.disabled=true;
    if(!comp.ratioKnown){
      const o=document.createElement('option');o.value='';o.textContent=comp.ratioLabel||'Unknown';o.selected=true;select.prepend(o);
    }
  }
  select.onchange=()=>{
    if(setInputCompressorRatioRaw(channel,select.value))renderChannelState();
    else toast('Compressor ratio write blocked: only the controlled Manual RMS ratio choices are enabled.',true);
  };

  const table=panel.querySelector('.config-table');
  if(table){
    const detail=document.createElement('div');detail.className='config-row';
    detail.innerHTML=`<strong>Compressor ratio</strong><code>state + 15 = ${comp.ratioRaw==null?'—':hexByte(comp.ratioRaw)}</code><span>${comp.ratioLabel||'—'}${comp.ratioWritableShape?' · verified write':' · read only for this model/value'}</span>`;
    table.appendChild(detail);
  }

  const evidence=root.querySelector('.details-stack > .panel:last-child');
  if(evidence&&evidence!==panel&&!evidence.querySelector('.comp-ratio-evidence')){
    const p=document.createElement('p');p.className='comp-ratio-evidence';
    p.innerHTML='Controlled Manual RMS ratio scenes isolate <code>state +15</code>: <code>1:1→00</code>, <code>2:1→10</code>, <code>4:1→18</code>, <code>12:1→24</code>, <code>20:1→26</code>, <code>40:1→27</code>, <code>∞:1→28</code>. Every adjacent pair changes only this byte outside scene-label bytes.';
    evidence.appendChild(p);
  }
}

const renderChannelStateBeforeRatio=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeRatio();injectCompressorRatioUi();};

if(typeof PARAMETER_MAP!=='undefined'&&!PARAMETER_MAP.some(x=>x.id==='input-comp-ratio')){
  PARAMETER_MAP.push({
    id:'input-comp-ratio',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',
    field:'Compressor ratio',offset:'state + 15',datatype:'uint8 discrete table/index',
    transform:'verified anchors: 00=1:1, 10=2:1, 18=4:1, 24=12:1, 26=20:1, 27=40:1, 28=∞:1',
    confidence:'verified',write:true,
    evidence:'Controlled CH16 Manual RMS scenes Rat 1, Rat 2, Rat 4, Rat 12, Rat 20, Rat 40, Rat Inf. Every adjacent scene changes only state +15 outside scene-label bytes.',
    notes:'Writer deliberately exposes only the seven directly tested ratios. Intermediate raw table entries are not guessed. Other compressor models remain ratio read-only.'
  });
}

if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='channel-state');
  if(sec&&!sec.html.includes('Compressor ratio — verified restricted write')){
    sec.html+=`
      <h2>Compressor ratio — verified restricted write</h2>
      <p>Controlled Manual RMS (<code>model 01</code>) scenes isolate one byte at <code>state +15</code>:</p>
      <table class="docs-table"><thead><tr><th>Ratio</th><th>Raw</th></tr></thead><tbody>
        <tr><td>1:1</td><td><code>00</code></td></tr>
        <tr><td>2:1</td><td><code>10</code></td></tr>
        <tr><td>4:1</td><td><code>18</code></td></tr>
        <tr><td>12:1</td><td><code>24</code></td></tr>
        <tr><td>20:1</td><td><code>26</code></td></tr>
        <tr><td>40:1</td><td><code>27</code></td></tr>
        <tr><td>∞:1</td><td><code>28</code></td></tr>
      </tbody></table>
      <p>The coordinate is clearly a discrete table/index rather than a simple linear ratio value. The editor therefore writes only these seven directly observed choices and preserves all untested intermediate table values.</p>`;
  }
}
