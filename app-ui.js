function markDirty() {
  state.current.dirty=true; state.current.scene.dirty=true; state.dirtyScenes.add(state.current.scene.number);
  $('#sceneStatus').textContent='Modified in browser — original file is untouched.';
  renderSceneList();
}

function renderSceneList() {
  const root=$('#sceneList'); root.innerHTML='';
  for (const s of state.scenes) {
    const b=document.createElement('button'); b.className='scene-btn';
    if (state.current?.scene.number===s.number) b.classList.add('active');
    if (s.dirty || state.dirtyScenes.has(s.number)) b.classList.add('dirty');
    const label = s.number===65535 ? 'Current' : `Scene ${s.number}`;
    b.innerHTML=`<span>${label}</span><span class="dot"></span>`;
    b.onclick=()=>loadScene(s.number).catch(e=>toast(e.message,true)); root.appendChild(b);
  }
}

function renderScene() {
  $('#emptyState').classList.add('hidden'); $('#editor').classList.remove('hidden');
  $('#sceneTitle').textContent=state.current.scene.number===65535?'Current state':`Scene ${state.current.scene.number}`;
  $('#sceneStatus').textContent=`${state.current.managers.length} recognised name/colour tables`;
  renderSceneList(); renderManagers(); renderFx(); renderArchive();
}

function renderManagers() {
  const showUnused=$('#showUnused').checked; const root=$('#managerGrid'); root.innerHTML='';
  for (const m of state.current.managers) {
    let items = showUnused ? m.items : m.items.filter((x,i)=>!isDefaultName(x.name,i));
    if (!items.length && !showUnused) continue;
    const el=document.createElement('section'); el.className='manager';
    el.innerHTML=`<div class="manager-head"><h2>${m.label}</h2><span class="count">${items.length}${showUnused?` / ${m.count}`:''}</span></div><div class="rows"></div>`;
    const rows=el.querySelector('.rows');
    for (const item of items) {
      const row=document.createElement('div'); row.className='ch-row';
      const colour=COLOURS.find(c=>c.id===item.colour) || COLOURS[0];
      row.innerHTML=`<div class="ch-num">${item.index}</div><input class="name-input" maxlength="8" value="${escapeHtml(item.name)}" aria-label="${m.label} ${item.index} name"><select class="colour-select" style="--swatch:${colour.hex}" aria-label="${m.label} ${item.index} colour"></select>`;
      const input=row.querySelector('input');
      input.addEventListener('change',()=>{ if(!setName(m.key,item.index,input.value)) input.value=item.name; renderFx(); });
      const sel=row.querySelector('select');
      for (const c of COLOURS) { const o=document.createElement('option');o.value=c.id;o.textContent=c.name;o.selected=c.id===item.colour;sel.appendChild(o); }
      sel.addEventListener('change',()=>{setColour(m.key,item.index,sel.value); const c=COLOURS.find(x=>x.id===Number(sel.value)); sel.style.setProperty('--swatch',c.hex);});
      rows.appendChild(row);
    }
    root.appendChild(el);
  }
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function renderFx() {
  const root=$('#ufxSlots'); root.innerHTML='';
  const m=state.current.managers.find(x=>x.key==='ultraFxSends');
  if (m) for (const item of m.items) {
    const r=document.createElement('div');r.className='ufx-row';r.innerHTML=`<strong>${item.index}</strong><span>${escapeHtml(item.name)}</span>`;root.appendChild(r);
  }
  const fxWords=/(reverb|plate|space|delay|echo|satur|480|hall|room|vocal|drum|fx|bomb)/i;
  const strings=extractPrintableStrings(state.current.datBytes,5).filter(s=>fxWords.test(s));
  $('#fxStrings').innerHTML=strings.slice(0,220).map(s=>`<div class="string-item">${escapeHtml(s)}</div>`).join('') || '<div class="muted">No matching strings detected.</div>';
}
function renderArchive() {
  $('#archiveList').innerHTML=state.outerEntries.map(e=>`<div class="archive-row"><code>${escapeHtml(e.name)}</code><span>${formatBytes(e.content.length)}</span></div>`).join('');
}

function parseCsv(text) {
  const rows=[]; let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'&&text[i+1]==='"'){cell+='"';i++;} else if(c==='"')q=false; else cell+=c; }
    else if(c==='"')q=true;
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);} return rows;
}
function importCsvRows(rows) {
  let section='', changed=0, skipped=0;
  const byCsv=Object.fromEntries(MANAGERS.filter(m=>m.csv).map(m=>[m.csv.toLowerCase(),m.key]));
  for(const r of rows){
    const first=(r[0]||'').trim(); if(/^\[.+\]$/.test(first)){section=first.toLowerCase();continue;} if(section!=='[channels]'||!first)continue;
    const key=byCsv[first.toLowerCase()]; const idx=Number(r[1]); if(!key||!idx){skipped++;continue;}
    const m=state.current.managers.find(x=>x.key===key); if(!m||idx<1||idx>m.count){skipped++;continue;}
    const name=(r[2]||'').trim(); const col=(r[3]||'').trim().toLowerCase();
    if(name && validName(name)){setName(key,idx,name);changed++;}
    if(col in COLOUR_BY_NAME){setColour(key,idx,COLOUR_BY_NAME[col]);}
  }
  renderManagers(); renderFx(); return {changed,skipped};
}

async function applyCurrentToAllScenes() {
  if (!state.current) return;
  if (!confirm('Apply the currently visible recognised name/colour tables to every StageBox scene in this show? This changes only name/colour slots; you will still export a new copy.')) return;
  const source = state.current.managers.map(m=>({key:m.key, items:m.items.map(x=>({name:x.name,colour:x.colour}))}));
  await commitCurrentScene();
  let n=0;
  for (const scene of state.scenes) {
    if (scene.number===state.current.scene.number) continue;
    const outer=state.outerEntries.find(e=>e.name===scene.stagePath); if(!outer)continue;
    const nestedEntries=parseTar(await gunzip(outer.content));
    const datEntry=nestedEntries.find(e=>/StageBoxScene\d+\.dat$/.test(e.name))||nestedEntries.find(e=>e.name.endsWith('.dat')); if(!datEntry)continue;
    const dat=datEntry.content.slice(); const managers=parseManagers(dat);
    let changed=false;
    for(const src of source){ const dst=managers.find(m=>m.key===src.key); if(!dst)continue; const max=Math.min(dst.items.length,src.items.length);
      for(let i=0;i<max;i++){ const it=dst.items[i],v=src.items[i]; for(let j=0;j<9;j++)dat[it.nameOffset+j]=0; dat.set(asciiBytes(v.name).slice(0,8),it.nameOffset); dat[it.colourOffset]=v.colour; changed=true; }
    }
    if(changed){datEntry.content=dat;outer.content=await gzip(writeTar(nestedEntries));outer.size=outer.content.length;scene.dirty=true;state.dirtyScenes.add(scene.number);n++;}
  }
  toast(`Applied names/colours to ${n} other scenes.`); renderSceneList();
}

async function exportShow() {
  try {
    await commitCurrentScene();
    const tar=writeTar(state.outerEntries); const gz=await gzip(tar);
    const check=parseTar(await gunzip(gz));
    if(!check.some(e=>e.name==='Show/Version.dat')) throw new Error('Export validation failed: Version.dat missing.');
    const blob=new Blob([gz],{type:'application/gzip'}); const a=document.createElement('a');
    const base=state.fileName.replace(/\.tar\.gz$/i,'').replace(/\.tgz$/i,'');
    a.href=URL.createObjectURL(blob);a.download=`${base || 'dLive Show'} - edited.tar.gz`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    toast(`Exported validated copy (${formatBytes(gz.length)}).`);
  } catch(e){toast(e.message,true);console.error(e);}
}

async function openFile(file) {
  try {
    $('#openBtn').disabled=true;
    const result=await analyseShow(file);
    state.fileName=file.name;state.outerEntries=result.entries;state.scenes=result.scenes;state.current=null;state.dirtyScenes.clear();
    const target=state.scenes.find(s=>s.number===10) || state.scenes.find(s=>s.number===65535) || state.scenes[0];
    const outer=state.outerEntries.find(e=>e.name===target.stagePath);const nested=parseTar(await gunzip(outer.content));const dat=nested.find(e=>e.name.endsWith('.dat'))?.content;
    $('#showName').textContent=dat?extractShowName(dat):file.name;
    $('#showMeta').textContent=`${state.scenes.length} StageBox scenes • ${formatBytes(file.size)} • local only`;
    $('#exportBtn').disabled=false;$('#importCsvBtn').disabled=false;
    renderSceneList();await loadScene(target.number);toast(`Loaded ${file.name}`);
  } catch(e){toast(e.message,true);console.error(e);} finally{$('#openBtn').disabled=false;}
}

$('#openBtn').onclick=$('#openBtn2').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=e=>{const f=e.target.files[0];if(f)openFile(f);e.target.value='';};
$('#exportBtn').onclick=exportShow;
$('#importCsvBtn').onclick=()=>$('#csvInput').click();
$('#csvInput').onchange=async e=>{const f=e.target.files[0];if(!f||!state.current)return;const res=importCsvRows(parseCsv(await f.text()));toast(`CSV applied: ${res.changed} name rows${res.skipped?`, ${res.skipped} skipped`:''}.`);e.target.value='';};
$('#showUnused').onchange=renderManagers;
$('#applyAllBtn').onclick=()=>applyCurrentToAllScenes().catch(e=>toast(e.message,true));
$$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));$$('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(`#tab${b.dataset.tab[0].toUpperCase()+b.dataset.tab.slice(1)}`).classList.add('active');});
