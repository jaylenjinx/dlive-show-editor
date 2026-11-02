'use strict';

// Performance layer, loaded last. Two changes, both behaviour-preserving:
//
// 1. Indexed byte search. Every record is located with indexOfBytes(dat, label), and a scene
//    triggers well over a thousand of those searches, each a linear scan of a ~400 KB file.
//    The index maps every 4-byte window of printable ASCII to its positions, built once per
//    buffer, so a search only verifies the few candidates that share the needle's first four
//    bytes. It returns exactly what the linear scan returns (the first match at or after
//    `from`). The index is dropped whenever the stage or surface is marked dirty, and buffers
//    that are replaced (record rebuilds) get a fresh index automatically.
//
// 2. Render only the visible tab. renderScene() redraws every tab after every edit; hidden
//    tabs are now marked stale and redrawn when they are opened.

(function(){
  const linearIndexOf=indexOfBytes;
  const cache=new WeakMap();
  const printable=b=>b>=32&&b<=126;
  function buildIndex(hay){
    const map=new Map();
    let run=0;
    for(let i=0;i<hay.length;i++){
      if(printable(hay[i]))run++;else{run=0;continue;}
      if(run>=4){
        const p=i-3,k=(hay[p]<<24|hay[p+1]<<16|hay[p+2]<<8|hay[p+3])>>>0;
        const list=map.get(k);if(list)list.push(p);else map.set(k,[p]);
      }
    }
    return map;
  }
  function indexFor(hay){
    let entry=cache.get(hay);
    if(!entry||entry.length!==hay.length){entry={length:hay.length,map:buildIndex(hay)};cache.set(hay,entry);}
    return entry.map;
  }
  window.indexOfBytes=function(hay,needle,from=0){
    if(!(hay instanceof Uint8Array)||!needle||needle.length<4||hay.length<65536)return linearIndexOf(hay,needle,from);
    for(let j=0;j<4;j++)if(!printable(needle[j]))return linearIndexOf(hay,needle,from);
    const k=(needle[0]<<24|needle[1]<<16|needle[2]<<8|needle[3])>>>0;
    const list=indexFor(hay).get(k);if(!list)return -1;
    // positions are ascending: binary-search the first candidate >= from
    let lo=0,hi=list.length;while(lo<hi){const mid=(lo+hi)>>1;if(list[mid]<from)lo=mid+1;else hi=mid;}
    outer: for(let c=lo;c<list.length;c++){
      const i=list[c];if(i>hay.length-needle.length)return -1;
      for(let j=4;j<needle.length;j++)if(hay[i+j]!==needle[j])continue outer;
      return i;
    }
    return -1;
  };
  window.dropByteIndex=function(hay){if(hay)cache.delete(hay);};
  for(const name of ['markStageDirty','markSurfaceDirty']){
    const f=window[name];if(typeof f!=='function')continue;
    window[name]=function(...a){
      const c=state.current;
      if(name==='markStageDirty')dropByteIndex(c?.stage?.datBytes);else dropByteIndex(c?.surface?.datBytes);
      return f.apply(this,a);
    };
  }

  // ---- lazy tab rendering ----
  const RENDERERS={
    renderManagers:'#tabNames',renderPeq:'#tabPeq',renderHpf:'#tabHpf',renderLpf:'#tabLpf',
    renderSurface:'#tabSurface',renderFx:'#tabFx',renderSystem:'#tabSystem',renderResearch:'#tabResearch',
    renderArchive:'#tabArchive',renderChannelState:'#tabChannelstate',renderBuses:'#tabBuses',
    renderDynamicsLibrary:'#tabBuses',renderPatching:'#tabPatching',renderConsoleEditor:'#tabConsole'
  };
  const stale=new Set(),wrapped=new Set();
  const visible=sel=>{const el=document.querySelector(sel);return !el||el.classList.contains('active');};
  function installLazy(){
    for(const [name,sel] of Object.entries(RENDERERS)){
      if(wrapped.has(name)||typeof window[name]!=='function')continue;
      const inner=window[name];wrapped.add(name);
      const lazy=function(...a){
        if(!visible(sel)){stale.add(name);return;}
        stale.delete(name);return inner.apply(this,a);
      };
      lazy.inner=inner;window[name]=lazy;
    }
  }
  installLazy();
  const renderSceneInner=window.renderScene;
  window.renderScene=function(...a){installLazy();return renderSceneInner.apply(this,a);};
  const activateInner=window.activateEditorTab;
  window.activateEditorTab=function(button){
    const r=activateInner.apply(this,arguments);
    installLazy();
    for(const name of [...stale]){if(visible(RENDERERS[name])&&state.current)window[name]();}
    return r;
  };
  // Tabs installed before this file bound their click handlers to the global name, which now
  // resolves to the wrapper above; nothing else to rebind.
})();
