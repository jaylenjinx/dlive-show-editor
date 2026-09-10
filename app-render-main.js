// UI and orchestration for dLive Show Editor v2.

function toast(msg,error=false){
  const el=$('#toast');el.textContent=msg;el.classList.toggle('error',error);el.classList.add('show');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3600);
}
function updateDirtyStatus(){
  if(!state.current)return;
  const parts=[];
  if(state.current.stage?.dirty||state.current.scene.dirtyStage)parts.push('MixRack');
  if(state.current.surface?.dirty||state.current.scene.dirtySurface)parts.push('Surface');
  $('#sceneStatus').textContent=parts.length?`Modified ${parts.join(' + ')} data — original file untouched.`:
    `${state.current.stage?.managers.length||0} name/colour tables • ${state.current.surface?.banks.filter(b=>b.width).length||0} active surface bank(s)`;
}
function renderSceneList(){
  const root=$('#sceneList');root.innerHTML='';
  for(const s of state.scenes){
    const b=document.createElement('button');b.className='scene-btn';
    if(state.current?.scene.number===s.number)b.classList.add('active');
    if(s.dirtyStage||s.dirtySurface||state.dirtyScenes.has(s.number))b.classList.add('dirty');
    const label=s.number===65535?'Current':`Scene ${s.number}`;
    const flags=[s.stagePath?'MR':'',s.surfacePath?'S':''].filter(Boolean).join('+');
    b.innerHTML=`<span><span>${label}</span><small>${flags}</small></span><span class="dot"></span>`;
    b.onclick=()=>loadScene(s.number).catch(e=>toast(e.message,true));root.appendChild(b);
  }
}
function renderScene(){
  $('#emptyState').classList.add('hidden');$('#editor').classList.remove('hidden');
  const c=state.current;
  $('#sceneTitle').textContent=c.scene.number===65535?'Current state':`Scene ${c.scene.number}`;
  $('#sceneName').textContent=c.stage?extractShowName(c.stage.datBytes):'Surface-only scene';
  updateDirtyStatus();renderSceneList();renderManagers();renderPeq();renderSurface();renderFx();renderSystem();renderResearch();renderArchive();
}
function renderManagers(){
  const root=$('#managerGrid');root.innerHTML='';
  if(!state.current?.stage){root.innerHTML='<div class="notice warn">No StageBox/MixRack scene data is paired with this scene.</div>';return;}
  const showUnused=$('#showUnused').checked;
  for(const m of state.current.stage.managers){
    const items=showUnused?m.items:m.items.filter((x,i)=>!isDefaultName(x.name,i));
    if(!items.length&&!showUnused)continue;
    const el=document.createElement('section');el.className='manager';
    el.innerHTML=`<div class="manager-head"><h2>${escapeHtml(m.label)}</h2><span class="count">offset 0x${m.pos.toString(16)} • ${items.length}${showUnused?` / ${m.count}`:''}</span></div><div class="rows"></div>`;
    const rows=el.querySelector('.rows');
    for(const item of items){
      const row=document.createElement('div');row.className='ch-row';
      const colour=COLOURS.find(c=>c.id===item.colour)||COLOURS[0];
      row.innerHTML=`<div class="ch-num">${item.index}</div><input class="name-input" maxlength="8" value="${escapeHtml(item.name)}"><select class="colour-select" style="--swatch:${colour.hex}"></select>`;
      const input=row.querySelector('input');
      input.addEventListener('change',()=>{if(!setName(m.key,item.index,input.value))input.value=item.name;renderSurface();renderFx();});
      const sel=row.querySelector('select');
      for(const co of COLOURS){const o=document.createElement('option');o.value=co.id;o.textContent=co.name;o.selected=co.id===item.colour;sel.appendChild(o);}
      sel.addEventListener('change',()=>{setColour(m.key,item.index,sel.value);const co=COLOURS.find(x=>x.id===Number(sel.value));sel.style.setProperty('--swatch',co.hex);});
      rows.appendChild(row);
    }
    root.appendChild(el);
  }
}

function surfaceCell(bank,layerIndex,faderIndex,cell){
  const wrap=document.createElement('div');wrap.className='strip-cell';
  const known=STRIP_TYPE_BY_CODE[cell.type];
  wrap.innerHTML=`<div class="strip-fader">F${faderIndex+1}</div><div class="strip-resolved">${escapeHtml(resolveStripLabel(cell.type,cell.index))}</div>`;
  if(!known){
    wrap.classList.add('unknown');
    wrap.innerHTML+=`<div class="strip-warning">Unknown raw assignment ${cell.type}:${cell.index} — preserved</div>`;
    return wrap;
  }
  const controls=document.createElement('div');controls.className='strip-controls';
  const typeSel=document.createElement('select');typeSel.className='compact-select';
  for(const t of STRIP_TYPES){const o=document.createElement('option');o.value=t.code;o.textContent=t.label;o.selected=t.code===cell.type;typeSel.appendChild(o);}
  const idx=document.createElement('input');idx.type='number';idx.className='index-input';idx.min='1';
  idx.max=String(known.max);idx.value=String(cell.index+1);idx.disabled=known.code===0;
  const apply=()=>{
    const spec=STRIP_TYPE_BY_CODE[Number(typeSel.value)];
    idx.disabled=spec.code===0;idx.max=String(spec.max);
    let zero=spec.code===0?0:Math.max(0,Math.min(spec.max-1,(Number(idx.value)||1)-1));
    idx.value=String(zero+1);
    if(setStripAssignment(bank.key,layerIndex,faderIndex,spec.code,zero)){
      wrap.querySelector('.strip-resolved').textContent=resolveStripLabel(spec.code,zero);
    }else toast('Invalid surface strip assignment.',true);
  };
  typeSel.onchange=apply;idx.onchange=apply;
  controls.append(typeSel,idx);wrap.appendChild(controls);return wrap;
}
function renderSurface(){
  const root=$('#surfaceBanks');root.innerHTML='';
  const surface=state.current?.surface;
  if(!surface){root.innerHTML='<div class="notice warn">No paired Surface scene archive was found, so layer editing is unavailable.</div>';return;}
  const active=surface.banks.filter(b=>b.width>0);
  if(!active.length){root.innerHTML='<div class="notice">This surface scene has no active bank widths.</div>';return;}
  for(const bank of active){
    const panel=document.createElement('section');panel.className='panel layout-panel';
    panel.innerHTML=`<div class="manager-head inline"><h2>${bank.label} bank · ${bank.width} faders</h2><span class="confidence ${bank.valid?'verified':'unknown'}">${bank.valid?'VERIFIED SHAPE':'READ ONLY'}</span></div>`;
    const sc=document.createElement('div');sc.className='layout-scroll';
    for(let l=0;l<6;l++){
      const grid=document.createElement('div');grid.className='layer-grid';
      grid.style.setProperty('--bank-width',bank.width);
      const lab=document.createElement('div');lab.className='layer-label';lab.textContent=`Layer ${String.fromCharCode(65+l)}`;grid.appendChild(lab);
      for(let f=0;f<bank.width;f++)grid.appendChild(surfaceCell(bank,l,f,bank.layers[l][f]));
      sc.appendChild(grid);
    }
    panel.appendChild(sc);root.appendChild(panel);
  }
}
