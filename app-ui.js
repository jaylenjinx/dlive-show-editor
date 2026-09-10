async function openFile(file){
  try{
    $('#openBtn').disabled=true;
    const result=await analyseShow(file);
    state.fileName=file.name;state.outerEntries=result.entries;state.scenes=result.scenes;state.mixConfig=result.mixConfig;state.current=null;state.dirtyScenes.clear();state.baselineStageCache.clear();
    const target=state.scenes.find(s=>s.number===10&&s.stagePath)||state.scenes.find(s=>s.number===65535&&s.stagePath)||state.scenes.find(s=>s.stagePath);
    let name=file.name;
    if(target){
      const outer=state.outerEntries.find(e=>e.name===target.stagePath);
      const p=await unpackNested(outer,/StageBoxScene\d+\.dat$/);if(p)name=extractShowName(p.datBytes);
    }
    $('#showName').textContent=name;
    const paired=state.scenes.filter(s=>s.stagePath&&s.surfacePath).length;
    $('#showMeta').textContent=`${state.scenes.length} scene IDs • ${paired} paired MixRack/Surface • ${formatBytes(file.size)} • local only`;
    $('#exportBtn').disabled=false;$('#importCsvBtn').disabled=false;$('#reportBtn').disabled=false;
    renderSceneList();await loadScene(target.number);toast(`Loaded ${file.name}`);
  }catch(e){toast(e.message,true);console.error(e);}finally{$('#openBtn').disabled=false;}
}

$('#openBtn').onclick=$('#openBtn2').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=e=>{const f=e.target.files[0];if(f)openFile(f);e.target.value='';};
$('#exportBtn').onclick=exportShow;
$('#reportBtn').onclick=exportResearchReport;
$('#importCsvBtn').onclick=()=>$('#csvInput').click();
$('#csvInput').onchange=async e=>{
  const f=e.target.files[0];if(!f||!state.current?.stage)return;
  const res=importCsvRows(parseCsv(await f.text()));toast(`CSV applied: ${res.changed} name rows${res.skipped?`, ${res.skipped} skipped`:''}.`);e.target.value='';
};
$('#showUnused').onchange=renderManagers;
$('#applyAllBtn').onclick=()=>applyCurrentToAllScenes().catch(e=>toast(e.message,true));
$$('.tab').forEach(b=>b.onclick=()=>{
  $$('.tab').forEach(x=>x.classList.remove('active'));$$('.tab-panel').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');const id=`#tab${b.dataset.tab[0].toUpperCase()+b.dataset.tab.slice(1)}`;$(id).classList.add('active');
});
