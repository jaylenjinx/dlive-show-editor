'use strict';

DOC_SECTIONS.splice(1,0,{
  id:'parameter-map',
  title:'Parameter map',
  eyebrow:'Canonical reference',
  html:`
    <h1>dLive 2.12 parameter map</h1>
    <p class="docs-lead">This is the master index of fields currently located or decoded in the show-file format. Filter it by subsystem, confidence and write status. Unknown entries stay visible so they can act as a research backlog.</p>
    <div class="docs-callout"><strong>Source of truth:</strong> this table is generated from <code>app-parameter-map.js</code>. The repository version is mirrored in <code>docs/parameter-map.md</code>.</div>
    <div class="parameter-map-controls">
      <input id="parameterMapSearch" type="search" placeholder="Search record, field, transform or evidence…" aria-label="Search parameter map">
      <select id="parameterMapArea" aria-label="Filter by area"><option value="">All areas</option></select>
      <select id="parameterMapConfidence" aria-label="Filter by confidence">
        <option value="">All confidence levels</option>
        <option value="verified">Verified write</option>
        <option value="partial">Partial / conservative write</option>
        <option value="decoded">Decoded / read only</option>
        <option value="located">Located / unmapped</option>
        <option value="unknown">Unknown</option>
      </select>
      <select id="parameterMapWrite" aria-label="Filter by write status">
        <option value="">All write states</option>
        <option value="yes">Writable</option>
        <option value="no">Read only</option>
      </select>
    </div>
    <div class="parameter-map-summary" id="parameterMapSummary"></div>
    <div class="parameter-map-scroll">
      <table class="parameter-map-table">
        <thead><tr><th>Area / field</th><th>Record</th><th>Payload</th><th>Offset</th><th>Datatype</th><th>Transform</th><th>Confidence</th><th>Write</th><th>Evidence / notes</th></tr></thead>
        <tbody id="parameterMapBody"></tbody>
      </table>
    </div>
  `
});

function parameterMapStatus(entry){
  return PARAMETER_MAP_CONFIDENCE[entry.confidence] || PARAMETER_MAP_CONFIDENCE.unknown;
}

function renderParameterMapDocs(){
  const body=$('#parameterMapBody');
  if(!body)return;
  const search=($('#parameterMapSearch')?.value||'').trim().toLowerCase();
  const area=$('#parameterMapArea')?.value||'';
  const confidence=$('#parameterMapConfidence')?.value||'';
  const write=$('#parameterMapWrite')?.value||'';

  const rows=PARAMETER_MAP.filter(entry=>{
    if(area&&entry.area!==area)return false;
    if(confidence&&entry.confidence!==confidence)return false;
    if(write==='yes'&&!entry.write)return false;
    if(write==='no'&&entry.write)return false;
    if(search){
      const hay=[entry.area,entry.record,entry.payload,entry.field,entry.offset,entry.datatype,entry.transform,entry.evidence,entry.notes].join(' ').toLowerCase();
      if(!hay.includes(search))return false;
    }
    return true;
  });

  body.innerHTML=rows.map(entry=>{
    const status=parameterMapStatus(entry);
    return `<tr>
      <td><strong>${escapeHtml(entry.area)}</strong><span>${escapeHtml(entry.field)}</span></td>
      <td><code>${escapeHtml(entry.record)}</code></td>
      <td>${escapeHtml(entry.payload)}</td>
      <td><code>${escapeHtml(entry.offset)}</code></td>
      <td><code>${escapeHtml(entry.datatype)}</code></td>
      <td><code>${escapeHtml(entry.transform)}</code></td>
      <td><span class="confidence ${status.css}">${status.label}</span></td>
      <td><span class="write-pill ${entry.write?'yes':'no'}">${entry.write?'YES':'NO'}</span></td>
      <td><strong>Evidence:</strong> ${escapeHtml(entry.evidence)}${entry.notes?`<br><span>${escapeHtml(entry.notes)}</span>`:''}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="parameter-map-empty">No parameter-map entries match these filters.</td></tr>';

  const writable=rows.filter(x=>x.write).length;
  const verified=rows.filter(x=>x.confidence==='verified').length;
  $('#parameterMapSummary').innerHTML=`<strong>${rows.length}</strong> of ${PARAMETER_MAP.length} entries · <strong>${writable}</strong> writable · <strong>${verified}</strong> verified`;
}

function initialiseParameterMapDocs(){
  const areaSelect=$('#parameterMapArea');
  if(!areaSelect)return;
  if(areaSelect.options.length===1){
    [...new Set(PARAMETER_MAP.map(x=>x.area))].sort().forEach(area=>{
      const o=document.createElement('option');o.value=area;o.textContent=area;areaSelect.appendChild(o);
    });
  }
  ['parameterMapSearch','parameterMapArea','parameterMapConfidence','parameterMapWrite'].forEach(id=>{
    const el=$(`#${id}`);if(!el||el.dataset.bound)return;
    el.addEventListener(id==='parameterMapSearch'?'input':'change',renderParameterMapDocs);
    el.dataset.bound='1';
  });
  renderParameterMapDocs();
}

const showDocWithoutParameterMap=showDoc;
showDoc=function(id,updateHash=true){
  showDocWithoutParameterMap(id,updateHash);
  const section=DOC_SECTIONS.find(s=>s.id===id)||DOC_SECTIONS[0];
  if(section.id==='parameter-map')initialiseParameterMapDocs();
};
