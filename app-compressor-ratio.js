'use strict';

// Compressor state +15 is an index into Director's 41-entry ratio table (1:1 … ∞:1).
// Every entry was swept (RevEngRatio, scenes 50–98) by typing values into Director's
// ratio field and reading back the stored byte; it is a stepped table, not a continuous scale.
const COMP_RATIO_MODEL_VERIFIED=0x01; // Manual RMS
const COMP_RATIO_RAW_TO_LABEL=new Map([
  [0x00,'1:1'],
  [0x01,'1.03:1'],
  [0x02,'1.05:1'],
  [0x03,'1.07:1'],
  [0x04,'1.1:1'],
  [0x05,'1.15:1'],
  [0x06,'1.2:1'],
  [0x07,'1.25:1'],
  [0x08,'1.3:1'],
  [0x09,'1.35:1'],
  [0x0A,'1.4:1'],
  [0x0B,'1.5:1'],
  [0x0C,'1.6:1'],
  [0x0D,'1.7:1'],
  [0x0E,'1.8:1'],
  [0x0F,'1.9:1'],
  [0x10,'2:1'],
  [0x11,'2.3:1'],
  [0x12,'2.5:1'],
  [0x13,'2.7:1'],
  [0x14,'3:1'],
  [0x15,'3.3:1'],
  [0x16,'3.5:1'],
  [0x17,'3.7:1'],
  [0x18,'4:1'],
  [0x19,'4.3:1'],
  [0x1A,'4.5:1'],
  [0x1B,'4.7:1'],
  [0x1C,'5:1'],
  [0x1D,'5.3:1'],
  [0x1E,'5.5:1'],
  [0x1F,'5.7:1'],
  [0x20,'6:1'],
  [0x21,'7:1'],
  [0x22,'8:1'],
  [0x23,'10:1'],
  [0x24,'12:1'],
  [0x25,'16:1'],
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
    <span>Compressor ratio <small>full 41-step ratio table</small></span>
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
    else toast('Compressor ratio write blocked for this model.',true);
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
    p.innerHTML='Compressor <code>state +15</code> is an index into the 41-step Director ratio table (<code>00</code>=1:1 … <code>28</code>=∞:1). Every step was swept; stored bytes read back match the table in order.';
    evidence.appendChild(p);
  }
}

const renderChannelStateBeforeRatio=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeRatio();injectCompressorRatioUi();};

if(typeof PARAMETER_MAP!=='undefined'&&!PARAMETER_MAP.some(x=>x.id==='input-comp-ratio')){
  PARAMETER_MAP.push({
    id:'input-comp-ratio',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'Manual RMS model 0x01, current-format 127-byte state',
    field:'Compressor ratio',offset:'state + 15',datatype:'uint8 discrete table/index',
    transform:'index 00…28 into the 41-step table: 1, 1.03, 1.05, 1.07, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.3, 2.5, 2.7, 3, 3.3, 3.5, 3.7, 4, 4.3, 4.5, 4.7, 5, 5.3, 5.5, 5.7, 6, 7, 8, 10, 12, 16, 20, 40, ∞ (:1)',
    confidence:'verified',write:true,
    evidence:'RevEngRatio: 48 automated Director scenes (50–98) typing values into the ratio field of Manual RMS on input 13; stored byte +15 reads 00…28 in table order. Manual Peak cross-checks 2:1=10 and 20:1=26 against the same table.',
    notes:'Manual RMS and Manual Peak use this table; Opto uses its own (see Opto ratio).'
  });
}

if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='channel-state');
  if(sec&&!sec.html.includes('Compressor ratio — full table')){
    sec.html+=`
      <h2>Compressor ratio — full table</h2>
      <p>Compressor <code>state +15</code> indexes Director's 41-step ratio table:</p>
      <table class="docs-table"><thead><tr><th>Ratio</th><th>Raw</th></tr></thead><tbody><tr><td>1:1</td><td><code>00</code></td></tr><tr><td>1.03:1</td><td><code>01</code></td></tr><tr><td>1.05:1</td><td><code>02</code></td></tr><tr><td>1.07:1</td><td><code>03</code></td></tr><tr><td>1.1:1</td><td><code>04</code></td></tr><tr><td>1.15:1</td><td><code>05</code></td></tr><tr><td>1.2:1</td><td><code>06</code></td></tr><tr><td>1.25:1</td><td><code>07</code></td></tr><tr><td>1.3:1</td><td><code>08</code></td></tr><tr><td>1.35:1</td><td><code>09</code></td></tr><tr><td>1.4:1</td><td><code>0A</code></td></tr><tr><td>1.5:1</td><td><code>0B</code></td></tr><tr><td>1.6:1</td><td><code>0C</code></td></tr><tr><td>1.7:1</td><td><code>0D</code></td></tr><tr><td>1.8:1</td><td><code>0E</code></td></tr><tr><td>1.9:1</td><td><code>0F</code></td></tr><tr><td>2:1</td><td><code>10</code></td></tr><tr><td>2.3:1</td><td><code>11</code></td></tr><tr><td>2.5:1</td><td><code>12</code></td></tr><tr><td>2.7:1</td><td><code>13</code></td></tr><tr><td>3:1</td><td><code>14</code></td></tr><tr><td>3.3:1</td><td><code>15</code></td></tr><tr><td>3.5:1</td><td><code>16</code></td></tr><tr><td>3.7:1</td><td><code>17</code></td></tr><tr><td>4:1</td><td><code>18</code></td></tr><tr><td>4.3:1</td><td><code>19</code></td></tr><tr><td>4.5:1</td><td><code>1A</code></td></tr><tr><td>4.7:1</td><td><code>1B</code></td></tr><tr><td>5:1</td><td><code>1C</code></td></tr><tr><td>5.3:1</td><td><code>1D</code></td></tr><tr><td>5.5:1</td><td><code>1E</code></td></tr><tr><td>5.7:1</td><td><code>1F</code></td></tr><tr><td>6:1</td><td><code>20</code></td></tr><tr><td>7:1</td><td><code>21</code></td></tr><tr><td>8:1</td><td><code>22</code></td></tr><tr><td>10:1</td><td><code>23</code></td></tr><tr><td>12:1</td><td><code>24</code></td></tr><tr><td>16:1</td><td><code>25</code></td></tr><tr><td>20:1</td><td><code>26</code></td></tr><tr><td>40:1</td><td><code>27</code></td></tr><tr><td>∞:1</td><td><code>28</code></td></tr></tbody></table>
      <p>The coordinate is clearly a discrete table/index rather than a simple linear ratio value. The editor exposes every step.</p>`;
  }
}
