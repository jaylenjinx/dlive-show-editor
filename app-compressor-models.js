'use strict';

// Controlled dLive 2.12 CH16 model-selection scenes map compressor state +1.
// Model selection is intentionally read-only: changing models on the console
// also changes model-specific defaults/state elsewhere in the 127-byte record.
const COMPRESSOR_MODEL_LABELS = {
  0x00:'Manual Peak',
  0x01:'Manual RMS',
  0x02:'Opto',
  0x03:'16T',
  0x04:'16VU',
  0x05:'Ducker family',
  0x06:'Peak Limiter 76',
  0x07:'Mighty',
  0x08:'Optronik',
  0x09:'Bus',
  0x0A:'Compstortion',
};

function compressorModelLabel(raw){
  return COMPRESSOR_MODEL_LABELS[Number(raw)] || `Unknown 0x${hexByte(Number(raw)||0)}`;
}

const parseInputCompressorStatesBeforeModels=parseInputCompressorStates;
parseInputCompressorStates=function(dat){
  const out=parseInputCompressorStatesBeforeModels(dat);
  for(const c of out)c.modelLabel=compressorModelLabel(c.modelRaw);
  return out;
};

function injectCompressorModelUi(){
  const root=$('#channelStateEditor');if(!root||!state.current?.stage)return;
  const channel=Number(root.dataset.channel||1);
  const decoded=ensureChannelState();
  const comp=decoded?.compressors?.find(c=>c.channel===channel);if(!comp)return;

  const rows=[...root.querySelectorAll('.config-row')];
  const modelRow=rows.find(r=>r.querySelector('strong')?.textContent==='Compressor model');
  if(modelRow){
    const cells=modelRow.children;
    if(cells[1])cells[1].textContent=`${hexByte(comp.modelRaw)}`;
    if(cells[2])cells[2].textContent=`${comp.modelLabel} · decoded / read only`;
  }

  const compField=root.querySelector('[data-k="comp"]')?.closest('.peq-field');
  if(compField){
    const small=compField.querySelector('small');
    if(small)small.textContent=`${comp.modelLabel}; verified On/Off byte only`;
  }
}

const renderChannelStateBeforeModels=renderChannelState;
renderChannelState=function(){renderChannelStateBeforeModels();injectCompressorModelUi();};

// Promote model semantics in the interactive canonical parameter map, but keep writes disabled.
if(typeof PARAMETER_MAP!=='undefined'){
  const modelEntry=PARAMETER_MAP.find(x=>x.id==='input-comp-model');
  if(modelEntry)Object.assign(modelEntry,{
    field:'Compressor model / engine family',offset:'state + 1',datatype:'uint8 enum',
    transform:'00 Manual Peak; 01 Manual RMS; 02 Opto; 03 16T; 04 16VU; 05 Ducker family; 06 Peak Limiter 76; 07 Mighty; 08 Optronik; 09 Bus; 0A Compstortion',
    confidence:'decoded',write:false,
    evidence:'Controlled CH16 scenes labelled Manual Peak/RMS, Opto, 16T, 16VU, Ducker, Ducker Slow, Peak Limiter 76, Mighty, Optronik, Bus and Compstortion map state +1 across 00..0A.',
    notes:'Ducker and Ducker Slow both use 0x05. Their records differ at parameter bytes rather than the model byte. Model selection remains read-only because console model changes also rewrite model-specific defaults/state.'
  });
}

// Extend the built-in Channel State documentation.
if(typeof DOC_SECTIONS!=='undefined'){
  const sec=DOC_SECTIONS.find(s=>s.id==='channel-state');
  if(sec&&!sec.html.includes('Compressor model enum — decoded')){
    sec.html+=`
      <h2>Compressor model enum — decoded / read only</h2>
      <p>Controlled CH16 scenes map compressor state byte <code>+1</code>:</p>
      <table class="docs-table"><thead><tr><th>Raw</th><th>Model</th></tr></thead><tbody>
        <tr><td><code>00</code></td><td>Manual Peak</td></tr>
        <tr><td><code>01</code></td><td>Manual RMS</td></tr>
        <tr><td><code>02</code></td><td>Opto</td></tr>
        <tr><td><code>03</code></td><td>16T</td></tr>
        <tr><td><code>04</code></td><td>16VU</td></tr>
        <tr><td><code>05</code></td><td>Ducker family</td></tr>
        <tr><td><code>06</code></td><td>Peak Limiter 76</td></tr>
        <tr><td><code>07</code></td><td>Mighty</td></tr>
        <tr><td><code>08</code></td><td>Optronik</td></tr>
        <tr><td><code>09</code></td><td>Bus</td></tr>
        <tr><td><code>0A</code></td><td>Compstortion</td></tr>
      </tbody></table>
      <p><code>Ducker</code> and <code>Ducker Slow</code> both use model byte <code>05</code>. The Slow scene instead differs at state <code>+10..13</code> and <code>+25..26</code>, showing that it is a parameter/default variant of the same engine family rather than a distinct model ID.</p>
      <div class="docs-callout warning"><strong>Read-only model selection:</strong> switching compressor models on the console changes additional model-specific parameter bytes. Writing only <code>state +1</code> would not reproduce a valid console-generated model state, so model switching remains disabled.</div>`;
  }
}
