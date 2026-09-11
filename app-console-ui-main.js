'use strict';

// Console UI entry point. Requires input-processing, PEQ, compressor and input
// visual modules first.
function renderConsoleEditor() {
  const root = $('#consoleEditor'); if (!root) return;
  root.innerHTML = '';
  const stage = state.current?.stage;
  if (!stage) { root.innerHTML = '<div class="notice warn">No MixRack scene data.</div>'; return; }
  const decoded = ensureChannelState(); const peqs = ensureInputPeqs(); ensureInputProcessing();
  if (!decoded?.mixer || !peqs?.length) { root.innerHTML = '<div class="notice warn">This scene does not expose the mapped input processing structures.</div>'; return; }

  const channel = selectedChannel(root); root.dataset.channel = String(channel); syncChannel(channel);
  const mode = root.dataset.processor || 'preamp';
  const modes = [
    ['preamp','Preamp'],['gate','Gate'],['peq','PEQ'],['comp','Compressor'],['delay','Delay'],['routing','Routing']
  ];
  const toolbar = document.createElement('section'); toolbar.className = 'console-toolbar';
  toolbar.innerHTML = `<div class="console-toolbar-channel"><span>Input Channel</span><select data-k="channel"></select></div><div class="console-processor-switch">${modes.map(([id,label])=>`<button type="button" data-mode="${id}" class="${mode===id?'active':''}">${label}</button>`).join('')}</div><div class="console-toolbar-meta"><span class="confidence verified">Verified writers only</span></div>`;
  root.appendChild(toolbar);
  const chSel = toolbar.querySelector('[data-k="channel"]');
  for (let i = 1; i <= 128; i++) {
    const o = document.createElement('option'); o.value = i; const name = channelName(i); o.textContent = `CH ${i}${name ? ` · ${name}` : ''}`; chSel.appendChild(o);
  }
  chSel.value = String(channel);
  chSel.onchange = () => { root.dataset.channel = chSel.value; root.dataset.preampSocket=chSel.value; syncChannel(chSel.value); renderConsoleEditor(); };
  toolbar.querySelectorAll('[data-mode]').forEach(btn => btn.onclick = () => { root.dataset.processor = btn.dataset.mode; renderConsoleEditor(); });

  if (mode === 'comp') {
    const comp = decoded.compressors?.find(c => c.channel === channel);
    if (comp) renderCompressorConsole(root, comp); else root.insertAdjacentHTML('beforeend', '<div class="notice warn">No compressor record found for this input.</div>');
  } else if (mode === 'gate') {
    renderGateConsole(root,getInputGate(channel));
  } else if (mode === 'delay') {
    renderDelayConsole(root,getInputDelay(channel));
  } else if (mode === 'routing') {
    renderRoutingConsole(root,channel);
  } else if (mode === 'preamp') {
    renderPreampConsole(root,channel);
  } else {
    const peq = getInputPeq(channel);
    if (peq) renderPeqConsole(root, peq); else root.insertAdjacentHTML('beforeend', '<div class="notice warn">No PEQ record found for this input.</div>');
  }
}

window.renderConsoleEditor = renderConsoleEditor;
const renderSceneBeforeConsoleUi = renderScene;
renderScene = function() { renderSceneBeforeConsoleUi(); renderConsoleEditor(); };
