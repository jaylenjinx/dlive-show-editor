async function analyseShow(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const entries=parseTar(await gunzip(bytes));
  if(!entries.some(e=>e.name==='Show/Version.dat'))throw new Error('This does not look like a dLive Show archive (Show/Version.dat not found).');
  const sceneMap=new Map();
  for(const e of entries){
    let m=e.name.match(/^Show\/Scenes\/StageBoxScene(\d+)\.tar\.gz$/);
    if(m){const n=Number(m[1]);sceneMap.set(n,{...(sceneMap.get(n)||{}),number:n,stagePath:e.name,dirtyStage:false,dirtySurface:false});continue;}
    m=e.name.match(/^Show\/Scenes\/SurfaceScene(\d+)\.tar\.gz$/);
    if(m){const n=Number(m[1]);sceneMap.set(n,{...(sceneMap.get(n)||{}),number:n,surfacePath:e.name,dirtyStage:false,dirtySurface:false});}
  }
  const scenes=[...sceneMap.values()].filter(s=>s.stagePath||s.surfacePath);
  scenes.sort((a,b)=>(a.number===65535?1:b.number===65535?-1:a.number-b.number));
  if(!scenes.some(s=>s.stagePath))throw new Error('No StageBox scene archives were found.');
  return {entries,scenes,mixConfig:parseMixConfig(entries)};
}

async function getStageForScene(sceneNumber){
  if(state.current?.scene.number===sceneNumber)return state.current.stage?.datBytes||null;
  if(state.baselineStageCache.has(sceneNumber))return state.baselineStageCache.get(sceneNumber);
  const scene=state.scenes.find(s=>s.number===sceneNumber);
  if(!scene?.stagePath)return null;
  const outer=state.outerEntries.find(e=>e.name===scene.stagePath);
  const pack=await unpackNested(outer,/StageBoxScene\d+\.dat$/);
  const bytes=pack?.datBytes||null;
  if(bytes)state.baselineStageCache.set(sceneNumber,bytes);
  return bytes;
}

async function loadScene(sceneNumber){
  await commitCurrentScene();
  const scene=state.scenes.find(s=>s.number===sceneNumber);if(!scene)return;
  const stageOuter=scene.stagePath?state.outerEntries.find(e=>e.name===scene.stagePath):null;
  const surfaceOuter=scene.surfacePath?state.outerEntries.find(e=>e.name===scene.surfacePath):null;
  const stage=stageOuter?await unpackNested(stageOuter,/StageBoxScene\d+\.dat$/):null;
  const surface=surfaceOuter?await unpackNested(surfaceOuter,/SurfaceScene\d+\.dat$/):null;
  if(stage){
    stage.managers=parseManagers(stage.datBytes);
    stage.ahfx=parseAhfxManagers(stage.datBytes);
    stage.structure=findStructureLabels(stage.datBytes);
    stage.dirty=false;
  }
  if(surface){
    surface.banks=parseSurfaceBanks(surface.datBytes);
    surface.structure=findStructureLabels(surface.datBytes);
    surface.dirty=false;
  }
  let baselineAhfx=[];
  if(sceneNumber!==1){
    const b=await getStageForScene(1);
    if(b)baselineAhfx=parseAhfxManagers(b);
  }
  state.current={scene,stage,surface,baselineAhfx};
  renderScene();
}

async function rebuildPart(part){
  if(!part?.dirty)return;
  part.datEntry.content=part.datBytes;
  part.datEntry.size=part.datBytes.length;
  part.outer.content=await gzip(writeTar(part.nestedEntries));
  part.outer.size=part.outer.content.length;
  part.dirty=false;
}
async function commitCurrentScene(){
  const c=state.current;if(!c)return;
  if(c.stage?.dirty){await rebuildPart(c.stage);c.scene.dirtyStage=true;state.dirtyScenes.add(c.scene.number);}
  if(c.surface?.dirty){await rebuildPart(c.surface);c.scene.dirtySurface=true;state.dirtyScenes.add(c.scene.number);}
}
function markStageDirty(){
  if(!state.current?.stage)return;
  state.current.stage.dirty=true;state.current.scene.dirtyStage=true;state.dirtyScenes.add(state.current.scene.number);
  updateDirtyStatus();renderSceneList();
}
function markSurfaceDirty(){
  if(!state.current?.surface)return;
  state.current.surface.dirty=true;state.current.scene.dirtySurface=true;state.dirtyScenes.add(state.current.scene.number);
  updateDirtyStatus();renderSceneList();
}

function setName(managerKey,index,name){
  if(!validName(name)){toast('Names must be 8 ASCII characters or fewer.',true);return false;}
  const m=state.current?.stage?.managers.find(x=>x.key===managerKey);if(!m)return false;
  const item=m.items[index-1];if(!item)return false;
  for(let i=0;i<9;i++)state.current.stage.datBytes[item.nameOffset+i]=0;
  state.current.stage.datBytes.set(asciiBytes(name),item.nameOffset);item.name=name;markStageDirty();return true;
}
function setColour(managerKey,index,colour){
  const m=state.current?.stage?.managers.find(x=>x.key===managerKey);if(!m)return false;
  const item=m.items[index-1];if(!item)return false;
  item.colour=Number(colour);state.current.stage.datBytes[item.colourOffset]=item.colour;markStageDirty();return true;
}
function setStripAssignment(bankKey,layer,fader,type,index){
  const surface=state.current?.surface;if(!surface)return false;
  const bank=surface.banks.find(b=>b.key===bankKey);if(!bank||!bank.valid)return false;
  const cell=bank.layers[layer]?.[fader];if(!cell)return false;
  const typeSpec=STRIP_TYPE_BY_CODE[Number(type)];
  if(!typeSpec)return false;
  let idx=Number(index);
  if(typeSpec.code===0)idx=0;
  if(!Number.isInteger(idx)||idx<0||idx>=typeSpec.max)return false;
  surface.datBytes[cell.offset]=typeSpec.code;
  surface.datBytes[cell.offset+1]=idx;
  cell.type=typeSpec.code;cell.index=idx;markSurfaceDirty();return true;
}

function resolveStripLabel(type,index){
  const spec=STRIP_TYPE_BY_CODE[type];
  if(!spec)return `Unknown ${type}:${index}`;
  if(type===0)return 'Blank';
  let name='';
  if(spec.manager){
    const m=state.current?.stage?.managers.find(x=>x.key===spec.manager);
    name=m?.items[index]?.name||'';
  }
  return name?`${spec.label} ${index+1} · ${name}`:`${spec.label} ${index+1}`;
}

function parseCsv(text){
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')q=false;else cell+=c;}
    else if(c==='"')q=true;
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}return rows;
}
function importCsvRows(rows){
  let section='',changed=0,skipped=0;
  const byCsv=Object.fromEntries(MANAGERS.filter(m=>m.csv).map(m=>[m.csv.toLowerCase(),m.key]));
  for(const r of rows){
    const first=(r[0]||'').trim();
    if(/^\[.+\]$/.test(first)){section=first.toLowerCase();continue;}
    if(section!=='[channels]'||!first)continue;
    const key=byCsv[first.toLowerCase()],idx=Number(r[1]);
    if(!key||!idx){skipped++;continue;}
    const m=state.current?.stage?.managers.find(x=>x.key===key);
    if(!m||idx<1||idx>m.count){skipped++;continue;}
    const name=(r[2]||'').trim(),col=(r[3]||'').trim().toLowerCase();
    if(name&&validName(name)){setName(key,idx,name);changed++;}
    if(col in COLOUR_BY_NAME)setColour(key,idx,COLOUR_BY_NAME[col]);
  }
  renderManagers();renderSurface();renderFx();return {changed,skipped};
}

async function applyCurrentToAllScenes(){
  if(!state.current?.stage)return;
  if(!confirm('Apply the currently visible recognised name/colour tables to every StageBox scene in this show? Only proven name/colour records are changed.'))return;
  const source=state.current.stage.managers.map(m=>({key:m.key,items:m.items.map(x=>({name:x.name,colour:x.colour}))}));
  const currentNo=state.current.scene.number;
  await commitCurrentScene();let n=0;
  for(const scene of state.scenes){
    if(scene.number===currentNo||!scene.stagePath)continue;
    const outer=state.outerEntries.find(e=>e.name===scene.stagePath);
    const pack=await unpackNested(outer,/StageBoxScene\d+\.dat$/);if(!pack)continue;
    const managers=parseManagers(pack.datBytes);let changed=false;
    for(const src of source){
      const dst=managers.find(m=>m.key===src.key);if(!dst)continue;
      const max=Math.min(dst.items.length,src.items.length);
      for(let i=0;i<max;i++){
        const it=dst.items[i],v=src.items[i];
        for(let j=0;j<9;j++)pack.datBytes[it.nameOffset+j]=0;
        pack.datBytes.set(asciiBytes(v.name).slice(0,8),it.nameOffset);
        pack.datBytes[it.colourOffset]=v.colour;changed=true;
      }
    }
    if(changed){
      pack.datEntry.content=pack.datBytes;
      outer.content=await gzip(writeTar(pack.nestedEntries));outer.size=outer.content.length;
      scene.dirtyStage=true;state.dirtyScenes.add(scene.number);n++;
    }
  }
  toast(`Applied names/colours to ${n} other scenes.`);renderSceneList();
}

async function exportShow(){
  try{
    await commitCurrentScene();
    const originalCount=state.outerEntries.length;
    const gz=await gzip(writeTar(state.outerEntries));
    const check=parseTar(await gunzip(gz));
    if(check.length!==originalCount)throw new Error(`Export validation failed: archive entry count changed (${originalCount} → ${check.length}).`);
    if(!check.some(e=>e.name==='Show/Version.dat'))throw new Error('Export validation failed: Version.dat missing.');
    for(const scene of state.scenes.filter(s=>s.dirtyStage||s.dirtySurface)){
      for(const [path,regex] of [[scene.stagePath,/StageBoxScene\d+\.dat$/],[scene.surfacePath,/SurfaceScene\d+\.dat$/]]){
        if(!path)continue;
        const e=check.find(x=>x.name===path);if(!e)throw new Error(`Export validation failed: ${path} missing.`);
        const nested=parseTar(await gunzip(e.content));
        if(!nested.some(x=>regex.test(x.name)))throw new Error(`Export validation failed inside ${path}.`);
      }
    }
    const blob=new Blob([gz],{type:'application/gzip'}),a=document.createElement('a');
    const base=state.fileName.replace(/\.tar\.gz$/i,'').replace(/\.tgz$/i,'');
    a.href=URL.createObjectURL(blob);a.download=`${base||'dLive Show'} - v2 edited.tar.gz`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    toast(`Exported validated copy (${formatBytes(gz.length)}).`);
  }catch(e){toast(e.message,true);console.error(e);}
}
