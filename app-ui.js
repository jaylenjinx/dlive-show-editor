function setPrimaryView(view){
  const docs=view==='docs';
  $('#editorShell').classList.toggle('hidden',docs);
  $('#docsView').classList.toggle('hidden',!docs);
  $('#editorNavBtn').classList.toggle('active',!docs);
  $('#docsNavBtn').classList.toggle('active',docs);
  if(docs && typeof renderDocs==='function')renderDocs();
  if(!docs && location.hash.startsWith('#docs-'))history.replaceState(null,'',location.pathname+location.search);
}

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

function activateEditorTab(button){
  $$('.tab').forEach(x=>x.classList.remove('active'));$$('.tab-panel').forEach(x=>x.classList.remove('active'));
  button.classList.add('active');const id=`#tab${button.dataset.tab[0].toUpperCase()+button.dataset.tab.slice(1)}`;$(id)?.classList.add('active');
}
$$('.tab').forEach(b=>b.onclick=()=>activateEditorTab(b));

$('#editorNavBtn').onclick=()=>setPrimaryView('editor');
$('#docsNavBtn').onclick=()=>setPrimaryView('docs');
if(location.hash.startsWith('#docs-'))setPrimaryView('docs');
window.addEventListener('hashchange',()=>{
  if(location.hash.startsWith('#docs-')){setPrimaryView('docs'); if(typeof renderDocs==='function')renderDocs();}
});

// Add the optional console-style visual editing surface without replacing the
// existing research-oriented PEQ and Channel State tabs. The visual layer uses
// only the guarded writers already defined by the reverse-engineering modules.
(function installConsoleUi(){
  if($('#tabConsole'))return;
  const tab=document.createElement('button');
  tab.className='tab';tab.type='button';tab.dataset.tab='console';tab.textContent='Console UI';
  const namesTab=document.querySelector('.tab[data-tab="names"]');
  if(namesTab)namesTab.insertAdjacentElement('afterend',tab);else document.querySelector('.tabs')?.appendChild(tab);
  tab.onclick=()=>activateEditorTab(tab);

  const panel=document.createElement('div');panel.id='tabConsole';panel.className='tab-panel';
  panel.innerHTML='<div class="notice safe"><strong>Visual editor:</strong> console-style PEQ and compressor views backed by the same verified byte writers as the research tabs. Unsupported model-specific controls stay read-only.</div><div id="consoleEditor"></div>';
  const namesPanel=$('#tabNames');
  if(namesPanel)namesPanel.insertAdjacentElement('afterend',panel);else $('#editor')?.appendChild(panel);

  if(!document.querySelector('link[href="console-ui.css"]')){
    const css=document.createElement('link');css.rel='stylesheet';css.href='console-ui.css';document.head.appendChild(css);
  }
  if(!document.querySelector('script[src="app-console-ui.js"]')){
    const script=document.createElement('script');script.src='app-console-ui.js';script.async=false;
    script.onload=()=>{if(state.current?.stage&&typeof renderConsoleEditor==='function')renderConsoleEditor();};
    document.body.appendChild(script);
  }
})();
