'use strict';

// Load Director's factory dynamics library presets (Deep Compressor Libraries / Gate Libraries)
// by writing the record state Director itself writes on a library recall. Captured on input 1
// (RevEng scenes 220–237, 2026-11-01): a compressor recall rewrites only the 127-byte Compressor
// record; a gate recall rewrites the 19-byte Gate record and the 23-byte SCF Gate record.
// The channel's In/Out switch is preserved, so loading a preset never switches a processor on or off.
// Library preset states captured from Director 2.12 (Deep Compressor / Gate Libraries recalled on input 1).
const COMP_LIBRARY_STATES={
  '16T':'0803010000800100000049eb770400140000000000000000007a8e00ba2d849f0000000000000000006d5c0000000000000000000000000000000000320032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041970d000400000000dd2e0d0003000001006597',
  '16VU':'080401000080010000003ed0721c00140000000000000000007a8e00ba2d849f0000000000000000006d5c0000000000000000000000000000000000320032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041970d000400000000dd2e0d0003000001006597',
  'Bus':'0809010000800100fa00443f7a8e00140000000000000000007a8e00ba2d849f0000000000000000006d5c0000000000000000560005000000020000320032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041970d000400000000dd2e0d0003000001006597',
  'CompStortion':'080a010000800100fa00443f7a8e00140000000000000000007a8e00ba2d849f0000000000000000006d5c0000000000000000000000000000000000320032fa34086600000000000000000000000000000000000000000000000000000000000000000000000000000000659665960000000000bffdbffd00000000006597',
  'Ducker':'0805010000800100f900683272d700000000000000000014007a8700ba2d849f0000000000000000006d5c0000000000000000000000000000000000320032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041970d000400000000dd2e0d0003000001006597',
  'Ducker Slow':'0805010000800100f9007f797f92000000000000000000140074a700ba2d849f0000000000000000006d5c0000000000000000000000000000000000320032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041970d000400000000dd2e0d0003000001006597',
  'Manual Pk':'08000100008001000000443f7a8e00140000000000000000007a8e00ba2d849f0000000000000000006d5c0000000000000000000000000000000000320032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041970d000400000000dd2e0d0003000001006597',
  'Mighty':'08070100008001000000315a84a200140000000000000000007a8e00ba2d849f000000000000000000702a0000000000000000000000000000000000320032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041970d000400000000dd2e0d0003000001006597',
  'Opto':'08020100008001000000553f84a200190000000200000100007a8e00ba2d849f0000000000000000006d5c0000000000000000000000000000000000320032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041970d000400000000dd2e0d0003000001006597',
  'OptTronik':'0808010000800100f200553f84a2001e0000000000000000007a8e00ba2d849f0000000000000000006d5c001600000a001e0000000000000000000032003200000000000000000000000000000000000000000000000000000000000000000000000000000000000000004dcb00000100000000d1fd000003000000006597',
  'PeakLimiter76':'0806010000800100fa00443f7a8e00140000000000000000007a8e01b58d92a30001fa0006000000006d5c0000000000000000000000000000000000320032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041970d000400000000dd2e0d0003000001006597',
  'Manual RMS':'08010100008001000000553f7a8e00140000000000000000007a8e00ba2d849f0000000000000000006d5c0000000000000000000000000000000000320032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041970d000400000000dd2e0d0003000001006597',
};
const GATE_LIBRARY_STATES={
  'Dual Expander':{gate:'0302dc00dc00cc0014007a8e00745e50ed0200',scf:'04000041970d000400000000dd2e0d0003000001006597'},
  'Ducker':{gate:'0301f900f900f600140076dc00702a64190200',scf:'04000041970a800400000000dd2e0a8003000001006597'},
  'Ducker Slow':{gate:'0301f8f8f900f600140076e20084787f790200',scf:'04000041970a800400000000dd2e0a8003000001006597'},
  'Source Expander':{gate:'0303dc00dc00cc0014007a8e00745e50ed0200',scf:'04000041970d000400000000dd2e0d0003000001006597'},
  'Gate':{gate:'0300dc00dc00d90014007a8e0070b42f280200',scf:'04000041970a800400000000dd2e0a8003000001006597'},
};

function dynHexBytes(h){const b=new Uint8Array(h.length/2);for(let i=0;i<b.length;i++)b[i]=parseInt(h.substr(i*2,2),16);return b;}
function dynWriteRecord(label,hex,keep){
  const dat=state.current?.stage?.datBytes;if(!dat)return false;
  const src=dynHexBytes(hex),r=ipParseRecord(dat,label,src.length);if(!r||dat[r.stateStart]!==src[0])return false;
  const kept=keep.map(o=>[o,dat[r.stateStart+o]]);
  dat.set(src,r.stateStart);for(const [o,v] of kept)dat[r.stateStart+o]=v;return true;
}
function dynInvalidate(){const s=state.current?.stage;if(!s)return;delete s.compressorStates;delete s.inputGates;delete s.busList;markStageDirty();}
function dynCompLabels(target){
  // target: an input number, or a bus object from busById() (stereo buses carry Left and Right records)
  if(typeof target==='number')return [`Compressor, Input Channel ${String(target).padStart(2,'0')}`];
  return (target?.rec?.comp||[]).map(r=>r.label);
}
function loadCompressorLibraryPreset(target,name){
  const hex=COMP_LIBRARY_STATES[name];if(!hex)return false;
  const labels=dynCompLabels(target);if(!labels.length)return false;
  let ok=true;for(const l of labels)ok=dynWriteRecord(l,hex,[2])&&ok;
  dynInvalidate();return ok;
}
function loadGateLibraryPreset(ch,name){
  const p=GATE_LIBRARY_STATES[name];if(!p)return false;
  const n=String(ch).padStart(2,'0');
  const a=dynWriteRecord(`Gate, Input Channel ${n}`,p.gate,[18]);
  const b=a&&dynWriteRecord(`SCF Gate, Input Channel ${n}`,p.scf,[]);
  dynInvalidate();return a&&b;
}

function renderDynamicsLibrary(){
  const root=$('#dynLibEditor');if(!root||!state.current?.stage)return;
  const names=state.current.stage.managers?.find(m=>m.key==='inputs')?.items||[];
  const chOpts=Array.from({length:128},(_,i)=>`<option value="${i+1}">Input ${i+1}${names[i]?.name?' · '+escapeHtml(names[i].name):''}</option>`).join('');
  const buses=typeof busList==='function'?busList():[];
  const busOpts=buses.map(b=>`<option value="bus:${b.id}">${escapeHtml(b.title)}</option>`).join('');
  root.innerHTML=`<section class="panel"><div class="manager-head inline"><h2>Dynamics library</h2><span class="confidence verified">CAPTURED FROM DIRECTOR</span></div>
    <div class="notice">Loads a factory preset exactly as Director's library Recall writes it. The processor's In/Out switch is left as it is.</div>
    <div class="peq-field"><span>Channel</span><div><select id="dynTarget">${chOpts}${busOpts}</select></div></div>
    <div class="peq-field"><span>Compressor preset</span><div><select id="dynComp">${Object.keys(COMP_LIBRARY_STATES).map(n=>`<option>${escapeHtml(n)}</option>`).join('')}</select> <button class="btn" id="dynCompGo" type="button">Load</button></div></div>
    <div class="peq-field"><span>Gate preset <small>inputs only</small></span><div><select id="dynGate">${Object.keys(GATE_LIBRARY_STATES).map(n=>`<option>${escapeHtml(n)}</option>`).join('')}</select> <button class="btn" id="dynGateGo" type="button">Load</button></div></div></section>`;
  const target=()=>{const v=$('#dynTarget').value;return v.startsWith('bus:')?busById(v.slice(4)):Number(v);};
  $('#dynCompGo').onclick=()=>{const ok=loadCompressorLibraryPreset(target(),$('#dynComp').value);toast(ok?`Loaded ${$('#dynComp').value}.`:'Compressor record not found or wrong shape.',!ok);renderScene();};
  $('#dynGateGo').onclick=()=>{const t=target();if(typeof t!=='number'){toast('Gate presets apply to inputs only.',true);return;}const ok=loadGateLibraryPreset(t,$('#dynGate').value);toast(ok?`Loaded ${$('#dynGate').value}.`:'Gate record not found or wrong shape.',!ok);renderScene();};
}
(function installDynLib(){
  if($('#dynLibEditor'))return;
  const host=document.querySelector('#tabBuses')||document.querySelector('#tabChannelstate');if(!host)return;
  const div=document.createElement('div');div.id='dynLibEditor';host.insertBefore(div,host.firstChild);
})();
const renderSceneBeforeDynLib=renderScene;
renderScene=function(){renderSceneBeforeDynLib();renderDynamicsLibrary();};
