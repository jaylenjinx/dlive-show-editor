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

// Add the console-style visual editing surface without replacing the existing
// research-oriented PEQ / Channel State tabs. All writes still go through the
// guarded reverse-engineered setters.
(function installConsoleUi(){
  if($('#tabConsole'))return;
  const tab=document.createElement('button');
  tab.className='tab';tab.type='button';tab.dataset.tab='console';tab.textContent='Console UI';
  const namesTab=document.querySelector('.tab[data-tab="names"]');
  if(namesTab)namesTab.insertAdjacentElement('afterend',tab);else document.querySelector('.tabs')?.appendChild(tab);
  tab.onclick=()=>activateEditorTab(tab);

  const panel=document.createElement('div');panel.id='tabConsole';panel.className='tab-panel';
  panel.innerHTML='<div class="notice safe"><strong>Visual editor:</strong> console-style Preamp, Gate, PEQ, Compressor, Delay and Routing views backed by controlled-diff verified byte writers. Gate sidechain and model-specific compressor controls are enabled only where independently mapped; unsupported controls remain disabled.</div><div id="consoleEditor"></div>';
  const namesPanel=$('#tabNames');
  if(namesPanel)namesPanel.insertAdjacentElement('afterend',panel);else $('#editor')?.appendChild(panel);

  for(const href of ['console-ui.css','console-ui-input.css','console-ui-batch3.css'])if(!document.querySelector(`link[href="${href}"]`)){
    const css=document.createElement('link');css.rel='stylesheet';css.href=href;document.head.appendChild(css);
  }
  const consoleScripts=['app-input-processing.js','app-gate-sidechain.js','app-compressor-extra-models.js','app-rackultra-verified.js','app-parameter-map-input-processing.js','app-console-ui-peq.js','app-console-ui-compressor.js','app-console-ui-input.js','app-console-ui-reverse-batch3.js','app-console-ui-main.js'];
  const loadConsoleScript=index=>{
    if(index>=consoleScripts.length){if(state.current?.stage&&typeof renderConsoleEditor==='function')renderConsoleEditor();if(state.current?.stage&&typeof renderFx==='function')renderFx();return;}
    const src=consoleScripts[index];
    if(document.querySelector(`script[src="${src}"]`)){loadConsoleScript(index+1);return;}
    const script=document.createElement('script');script.src=src;script.async=false;
    script.onload=()=>loadConsoleScript(index+1);
    script.onerror=()=>toast(`Failed to load ${src}.`,true);
    document.body.appendChild(script);
  };
  loadConsoleScript(0);
})();
