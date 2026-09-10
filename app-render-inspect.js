function renderFx(){
  const root=$('#ahfxManagers');root.innerHTML='';
  const stage=state.current?.stage;
  if(!stage){root.innerHTML='<div class="muted">No MixRack scene data.</div>';return;}
  for(const fx of stage.ahfx){
    const base=state.current.baselineAhfx.find(x=>x.slot===fx.slot&&x.engineId===fx.engineId);
    const runs=base?changedRuns(base.payload,fx.payload):[];
    const changed=base?runs.reduce((n,[a,b])=>n+b-a+1,0):null;
    const card=document.createElement('article');card.className='fx-card';
    const sendName=stage.managers.find(x=>x.key==='ultraFxSends')?.items[fx.slot-1]?.name||'';
    card.innerHTML=`
      <div class="fx-card-head"><div><span class="slot-pill">UFX${fx.slot}</span> <strong>${escapeHtml(sendName||fx.preset||'Unnamed')}</strong></div><span class="confidence decoded">DECODED METADATA</span></div>
      <dl class="kv">
        <dt>Frame offset</dt><dd>0x${fx.frameStart.toString(16)}</dd>
        <dt>Payload / total</dt><dd>${fx.payloadLength} / ${fx.totalLength} bytes</dd>
        <dt>Engine ID</dt><dd><code>${fx.engineId}</code> · ${escapeHtml(fx.engineName)}</dd>
        <dt>Stored preset label</dt><dd>${escapeHtml(fx.preset||'—')}</dd>
        <dt>Reset-scene comparison</dt><dd>${base?`${changed} changed byte${changed===1?'':'s'}`:'No same-engine baseline in Scene 1'}</dd>
      </dl>
      ${base&&runs.length?`<details><summary>Changed relative offsets</summary><code class="hex-block">${escapeHtml(formatRuns(runs))}</code></details>`:''}
      <details><summary>Raw framed payload</summary><pre class="hex-block">${escapeHtml(hexRange(fx.payload))}</pre></details>`;
    root.appendChild(card);
  }
  const fxWords=/(reverb|plate|space|delay|echo|satur|480|hall|room|vocal|drum|fx|bomb)/i;
  const strings=extractPrintableStrings(stage.datBytes,5).filter(x=>fxWords.test(x.text));
  $('#fxStrings').innerHTML=strings.slice(0,160).map(x=>`<div class="string-item"><span>0x${x.offset.toString(16)}</span>${escapeHtml(x.text)}</div>`).join('')||'<div class="muted">No FX-related strings detected.</div>';
}

function renderSystem(){
  const root=$('#mixConfig');root.innerHTML='';
  const mc=state.mixConfig;
  if(mc?.fields){
    const table=document.createElement('div');table.className='config-table';
    for(const [name,val,confidence] of mc.fields){
      const row=document.createElement('div');row.className='config-row';
      row.innerHTML=`<span>${escapeHtml(name)}</span><strong>${val}</strong><span class="confidence ${confidence==='high'?'verified':'unknown'}">${confidence==='high'?'HIGH CONF':'UNKNOWN'}</span>`;
      table.appendChild(row);
    }
    root.appendChild(table);
    root.insertAdjacentHTML('beforeend',`<div class="raw-line"><strong>Raw:</strong> <code>${hexRange(mc.raw)}</code></div>`);
  }else root.innerHTML='<div class="muted">MixConfig.dat not found or unexpected length.</div>';
  const version=getTextEntry(state.outerEntries,'Show/Version.dat')?.trim()||'—';
  $('#showFormatVersion').textContent=version;
  const globals=[
    ['Quick names','Show/QuickName/ChannelQuickName.dat'],
    ['Talkback','Show/Talkback/Talkback.dat'],
    ['Virtual soundcheck','Show/VirtualSoundCheck.dat'],
    ['MCA settings','Show/MCASettings/MCASettings.dat'],
    ['Follow-pan settings','Show/FollowPanSettings.dat'],
    ['Input processing order','Show/ProcessingOrdering/InputProcessingOrdering.dat'],
  ];
  $('#plainConfigs').innerHTML='';
  for(const [label,path] of globals){
    const txt=getTextEntry(state.outerEntries,path);
    if(txt==null)continue;
    const d=document.createElement('details');d.innerHTML=`<summary>${escapeHtml(label)} <code>${escapeHtml(path)}</code></summary><pre class="hex-block">${escapeHtml(txt)}</pre>`;
    $('#plainConfigs').appendChild(d);
  }
}

function renderResearch(){
  const root=$('#structureList');root.innerHTML='';
  const groups=[
    ['MixRack scene',state.current?.stage?.structure||[]],
    ['Surface scene',state.current?.surface?.structure||[]],
  ];
  for(const [label,items] of groups){
    const sec=document.createElement('section');sec.className='panel';
    sec.innerHTML=`<h2>${label} recognised labels <span class="count">${items.length}</span></h2>`;
    const list=document.createElement('div');list.className='structure-list';
    list.innerHTML=items.map(x=>`<div><code>0x${x.frameStart.toString(16)}</code><span>${escapeHtml(x.label)} <em>(${x.payloadLength}B payload, ${x.paramLength}B state)</em></span></div>`).join('')||'<div class="muted">No framed records detected.</div>';
    sec.appendChild(list);root.appendChild(sec);
  }
  $('#protocolTable').innerHTML=MIDI_PROTOCOL.map(([p,t,d])=>`<div class="protocol-row"><strong>${escapeHtml(p)}</strong><span>${escapeHtml(t)}</span><code>${escapeHtml(d)}</code></div>`).join('');
}
function renderArchive(){
  $('#archiveList').innerHTML=state.outerEntries.map(e=>`<div class="archive-row"><code>${escapeHtml(e.name)}</code><span>${formatBytes(e.content.length)}</span></div>`).join('');
}
