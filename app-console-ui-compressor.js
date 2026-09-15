'use strict';

// Console-style compressor surface. Requires app-console-ui-peq.js first.
// ---------- compressor ----------
function ratioNumber(comp) {
  const label = comp?.ratioLabel || '';
  if (String(label).includes('∞')) return 1000;
  const m = String(label).match(/([\d.]+)\s*:/); return m ? Number(m[1]) : 1;
}
function transferOutDb(inputDb, threshold, ratio, makeup, soft) {
  const r = Math.max(1, ratioNumber({ ratioLabel: ratio }));
  if (!soft) return inputDb <= threshold ? inputDb + makeup : threshold + (inputDb - threshold) / r + makeup;
  const knee = 6;
  if (inputDb < threshold - knee / 2) return inputDb + makeup;
  if (inputDb > threshold + knee / 2) return threshold + (inputDb - threshold) / r + makeup;
  const x = inputDb - (threshold - knee / 2);
  return inputDb + makeup + (1 / r - 1) * x * x / (2 * knee);
}
function compGraphX(db, W, pad = 44) { return pad + ((clamp(db, -60, 12) + 60) / 72) * (W - pad * 2); }
function compGraphY(db, H, pad = 32) { return H - pad - ((clamp(db, -60, 12) + 60) / 72) * (H - pad * 2); }
function renderCompressorGraph(svg, comp) {
  const W = 600, H = 420, pad = 44;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = '';
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, class: 'console-graph-bg' }));
  for (const db of [-60, -40, -20, 0, 10]) {
    const x = compGraphX(db, W, pad), y = compGraphY(db, H, pad);
    svg.appendChild(svgEl('line', { x1: x, y1: pad, x2: x, y2: H - pad, class: 'console-grid-line' }));
    svg.appendChild(svgEl('line', { x1: pad, y1: y, x2: W - pad, y2: y, class: 'console-grid-line' }));
    const tx = svgEl('text', { x, y: H - 12, class: 'console-axis-label', 'text-anchor': 'middle' }); tx.textContent = db; svg.appendChild(tx);
    const ty = svgEl('text', { x: 8, y: y + 4, class: 'console-axis-label' }); ty.textContent = db; svg.appendChild(ty);
  }
  const unity = [];
  for (let xdb = -60; xdb <= 12; xdb += 1) unity.push([compGraphX(xdb, W, pad), compGraphY(xdb, H, pad)]);
  svg.appendChild(svgEl('path', { d: pathFromPoints(unity), class: 'console-unity-line' }));
  const threshold = Number(comp.thresholdDb ?? 0), makeup = Number(comp.makeupDb ?? 0), ratioLabel = comp.ratioLabel || '1:1';
  const curve = [];
  for (let xdb = -60; xdb <= 12; xdb += .5) curve.push([compGraphX(xdb, W, pad), compGraphY(transferOutDb(xdb, threshold, ratioLabel, makeup, comp.kneeRaw === 1), H, pad)]);
  svg.appendChild(svgEl('path', { d: pathFromPoints(curve), class: 'console-comp-curve' }));
  const tx = compGraphX(threshold, W, pad), ty = compGraphY(transferOutDb(threshold, threshold, ratioLabel, makeup, comp.kneeRaw === 1), H, pad);
  const handle = svgEl('circle', { cx: tx, cy: ty, r: 10, class: 'console-comp-handle', tabindex: 0 }); svg.appendChild(handle);
  if (comp.thresholdWritableShape) {
    let drag = null;
    handle.addEventListener('pointerdown', e => { handle.setPointerCapture(e.pointerId); drag = e.pointerId; });
    handle.addEventListener('pointermove', e => {
      if (drag !== e.pointerId) return;
      const rect = svg.getBoundingClientRect(); const sx = (e.clientX - rect.left) * W / rect.width;
      const value = -60 + clamp((sx - pad) / (W - pad * 2), 0, 1) * 72;
      const step = Number(comp.thresholdStepDb || 0.1);
      setInputCompressorThreshold(comp.channel, Math.round(value / step) * step);
      const fresh = ensureChannelState()?.compressors?.find(c => c.channel === comp.channel);
      if (fresh) {
        const ntx = compGraphX(Number(fresh.thresholdDb ?? 0), W, pad);
        const nty = compGraphY(transferOutDb(Number(fresh.thresholdDb ?? 0), Number(fresh.thresholdDb ?? 0), fresh.ratioLabel || '1:1', Number(fresh.makeupDb ?? 0), fresh.kneeRaw === 1), H, pad);
        handle.setAttribute('cx', ntx); handle.setAttribute('cy', nty);
      }
    });
    handle.addEventListener('pointerup', e => { if (drag === e.pointerId) { drag = null; triggerConsoleRerender(); } });
  } else handle.classList.add('disabled');
}

function sidechainCurveDb(comp, hz) {
  if (!comp?.scFilterActive) return 0;
  let db = 0;
  const lo = Number(comp.scLoFreqHz || 20), hi = Number(comp.scHiFreqHz || 20000);
  if (comp.scLoTypeRaw === 4 && hz < lo) db += Math.max(-24, 12 * Math.log2(hz / lo));
  if (comp.scLoTypeRaw === 6 && hz < lo) db += -5 * Math.min(1, Math.log2(lo / hz) / 3);
  if (comp.scHiTypeRaw === 3 && hz > hi) db += Math.max(-24, -12 * Math.log2(hz / hi));
  if (comp.scHiTypeRaw === 7 && hz > hi) db += -5 * Math.min(1, Math.log2(hz / hi) / 3);
  if (comp.scMiddleActive && comp.scBpfFreqHz) {
    const oct = Math.abs(Math.log2(hz / comp.scBpfFreqHz)); db += Math.max(-18, -18 * oct / 2);
  }
  return db;
}
function renderSidechainGraph(svg, comp) {
  const W = 360, H = 230, padX = 32, padY = 24;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = '';
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, class: 'console-graph-bg' }));
  for (const f of [50, 100, 500, 1000, 5000, 10000]) {
    const x = logX(f, W, padX); svg.appendChild(svgEl('line', { x1: x, y1: padY, x2: x, y2: H - padY, class: 'console-grid-line' }));
  }
  for (const db of [0, -6, -12, -20]) {
    const y = padY + ((0 - db) / 24) * (H - padY * 2); svg.appendChild(svgEl('line', { x1: padX, y1: y, x2: W - padX, y2: y, class: db === 0 ? 'console-grid-zero' : 'console-grid-line' }));
  }
  const pts = [];
  for (let i = 0; i <= 220; i++) {
    const x = padX + i / 220 * (W - padX * 2), hz = invLogX(x, W, padX), db = clamp(sidechainCurveDb(comp, hz), -24, 0);
    const y = padY + ((0 - db) / 24) * (H - padY * 2); pts.push([x, y]);
  }
  svg.appendChild(svgEl('path', { d: pathFromPoints(pts), class: 'console-sidechain-curve' }));
}

function makeToggle(label, on, disabled, handler) {
  const b = document.createElement('button'); b.type = 'button'; b.className = `console-toggle ${on ? 'on' : ''}`; b.textContent = label; b.disabled = disabled; b.onclick = handler; return b;
}

function renderCompressorConsole(root, comp) {
  const src = typeof getInputCompressorSidechainSource === 'function' ? getInputCompressorSidechainSource(comp.channel) : null;
  const shell = document.createElement('section'); shell.className = 'dlive-console-frame compressor-console';
  shell.innerHTML = `
    <div class="console-section-head">
      <div><span class="console-kicker">INPUT COMPRESSOR</span><strong>CH ${comp.channel}${channelName(comp.channel) ? ` · ${safeText(channelName(comp.channel))}` : ''}</strong></div>
      <div class="console-head-cluster"><span class="console-model">${safeText(comp.modelLabel || `Model 0x${hexByte(comp.modelRaw)}`)}</span></div>
    </div>
    <div class="console-comp-main">
      <section class="console-sidechain-panel">
        <div class="console-subhead"><span>Side Chain</span></div>
        <label>Source<select data-k="sc-source"></select></label>
        <div class="console-sidechain-top"><div data-k="sc-filter-toggle"></div><select data-k="sc-lo-type"></select><select data-k="sc-hi-type"></select></div>
        <svg class="console-sidechain-svg"></svg>
        <div class="console-sidechain-controls">
          <label>Low<select data-k="sc-lo-freq"></select></label>
          <label>BPF<div data-k="sc-bpf-toggle"></div><select data-k="sc-bpf-freq"></select></label>
          <label>High<select data-k="sc-hi-freq"></select></label>
        </div>
      </section>
      <section class="console-transfer-panel">
        <div class="console-comp-topline"><div class="console-model-large">${safeText(comp.modelLabel || 'Compressor')}</div><div class="console-time-pair"><label>Attack<select data-k="attack"></select></label><label>Release<select data-k="release"></select></label></div><div data-k="knee-toggle"></div></div>
        <svg class="console-comp-svg"></svg>
      </section>
      <section class="console-comp-controls">
        <label>Ratio<select data-k="ratio"></select></label>
        <label>Threshold<div class="console-value-row"><input data-k="threshold" type="number" step="${comp.thresholdStepDb || .1}" value="${comp.thresholdDb?.toFixed(2) ?? ''}"><span>dB</span></div></label>
        <label>Gain<div class="console-value-row"><input data-k="makeup" type="number" min="0" max="18" step="0.1" value="${comp.makeupDb?.toFixed(2) ?? ''}"><span>dB</span></div></label>
        <div class="console-comp-in" data-k="comp-toggle"></div>
      </section>
    </div>
    <div class="console-comp-bottom">
      <section class="console-parallel-box"><div class="console-subhead"><span>Parallel Path</span><div data-k="parallel-toggle"></div></div><div class="console-parallel-values"><label>Dry<div class="console-value-row"><input data-k="parallel-dry" type="number" min="-40" max="0" step="0.1" value="${comp.parallelDryInfinite ? '' : (comp.parallelDryDb?.toFixed(1) ?? '')}" placeholder="−∞"><span>dB</span></div></label><label>Wet<div class="console-value-row"><input data-k="parallel-wet" type="number" min="-40" max="0" step="0.1" value="${comp.parallelWetInfinite ? '' : (comp.parallelWetDb?.toFixed(1) ?? '')}" placeholder="−∞"><span>dB</span></div></label></div></section>
      <section class="console-gr-box"><span>Gain reduction</span><div class="console-gr-meter"><i></i></div><small>Offline editor — no live metering</small></section>
      <div class="console-note">Only controls with independently verified writers are enabled. Compressor model switching remains read-only because model changes rewrite additional state.</div>
    </div>`;
  root.appendChild(shell);

  renderCompressorGraph(shell.querySelector('.console-comp-svg'), comp);
  renderSidechainGraph(shell.querySelector('.console-sidechain-svg'), comp);

  const compToggleHost = shell.querySelector('[data-k="comp-toggle"]');
  compToggleHost.appendChild(makeToggle(comp.active ? 'Comp In' : 'Comp Out', comp.active, !comp.writableShape, () => {
    if (setInputCompressorActive(comp.channel, !comp.active)) triggerConsoleRerender(); else toast('Compressor On/Off write blocked.', true);
  }));

  const threshold = shell.querySelector('[data-k="threshold"]');
  threshold.min = comp.thresholdMinDb ?? -46; threshold.max = comp.thresholdMaxDb ?? 18; threshold.disabled = !comp.thresholdWritableShape;
  threshold.onchange = () => { if (setInputCompressorThreshold(comp.channel, threshold.value)) triggerConsoleRerender(); else toast('Threshold write blocked for this compressor model.', true); };

  const ratio = shell.querySelector('[data-k="ratio"]');
  if (typeof COMP_RATIO_RAW_TO_LABEL !== 'undefined') {
    ratio.innerHTML = [...COMP_RATIO_RAW_TO_LABEL.entries()].map(([raw, label]) => `<option value="${raw}">${safeText(label)}</option>`).join('');
    if (comp.ratioKnown) ratio.value = String(comp.ratioRaw); else injectCurrentOption(ratio, comp.ratioLabel || 'Unknown');
  }
  ratio.disabled = !comp.ratioWritableShape;
  ratio.onchange = () => { if (setInputCompressorRatioRaw(comp.channel, ratio.value)) triggerConsoleRerender(); else toast('Ratio write blocked: use a verified Manual RMS value.', true); };

  const attack = shell.querySelector('[data-k="attack"]'), release = shell.querySelector('[data-k="release"]');
  if (typeof COMP_ATTACK_MS_TO_RAW !== 'undefined') attack.innerHTML = [...COMP_ATTACK_MS_TO_RAW.entries()].map(([ms, raw]) => `<option value="${raw}">${safeText(compFormatTimeMs(ms))}</option>`).join('');
  if (typeof COMP_RELEASE_MS_TO_RAW !== 'undefined') release.innerHTML = [...COMP_RELEASE_MS_TO_RAW.entries()].map(([ms, raw]) => `<option value="${raw}">${safeText(compFormatTimeMs(ms))}</option>`).join('');
  if (comp.attackExact) attack.value = String(comp.attackRaw); else injectCurrentOption(attack, `Current ≈ ${compFormatTimeMs(Number(comp.attackMs || 0))}`);
  if (comp.releaseExact) release.value = String(comp.releaseRaw); else injectCurrentOption(release, `Current ≈ ${compFormatTimeMs(Number(comp.releaseMs || 0))}`);
  attack.disabled = release.disabled = !comp.timeWritableShape;
  attack.onchange = () => { if (setInputCompressorTimeRaw(comp.channel, 'attack', attack.value)) triggerConsoleRerender(); };
  release.onchange = () => { if (setInputCompressorTimeRaw(comp.channel, 'release', release.value)) triggerConsoleRerender(); };

  const makeup = shell.querySelector('[data-k="makeup"]'); makeup.disabled = !comp.kneeGainWritableShape;
  makeup.onchange = () => { if (setInputCompressorMakeup(comp.channel, makeup.value)) triggerConsoleRerender(); else toast('Makeup gain write blocked for this compressor model.', true); };
  const kneeHost = shell.querySelector('[data-k="knee-toggle"]');
  kneeHost.appendChild(makeToggle(comp.kneeRaw === 1 ? 'Soft Knee' : 'Normal Knee', comp.kneeRaw === 1, !comp.kneeGainWritableShape || !comp.kneeKnown, () => {
    if (setInputCompressorKnee(comp.channel, comp.kneeRaw === 1 ? 0 : 1)) triggerConsoleRerender(); else toast('Knee write blocked.', true);
  }));

  const parallelHost = shell.querySelector('[data-k="parallel-toggle"]');
  parallelHost.appendChild(makeToggle(comp.parallelActive ? 'On' : 'Off', comp.parallelActive, !comp.parallelWritableShape, () => {
    if (setInputCompressorParallelEnable(comp.channel, !comp.parallelActive)) triggerConsoleRerender();
  }));
  for (const kind of ['wet', 'dry']) {
    const input = shell.querySelector(`[data-k="parallel-${kind}"]`); input.disabled = !comp.parallelWritableShape;
    input.onchange = () => { if (setInputCompressorParallelLevel(comp.channel, kind, input.value === '' ? '-inf' : input.value)) triggerConsoleRerender(); };
  }

  // Sidechain controls use exact mapped options only.
  const scSource = shell.querySelector('[data-k="sc-source"]');
  if (src && typeof COMP_SC_SOURCE_TESTED !== 'undefined') {
    scSource.innerHTML = COMP_SC_SOURCE_TESTED.map(x => `<option value="${x.type}:${x.index}">${safeText(x.label)}</option>`).join('');
    const current = `${src.typeRaw}:${src.indexRaw}`;
    if (COMP_SC_SOURCE_TESTED.some(x => `${x.type}:${x.index}` === current)) scSource.value = current; else injectCurrentOption(scSource, `Current ${src.typeLabel} ${src.indexRaw + 1}`);
    scSource.disabled = !src.writableShape;
    scSource.onchange = () => { const [type, index] = scSource.value.split(':').map(Number); if (setInputCompressorSidechainSource(comp.channel, type, index)) triggerConsoleRerender(); };
  } else scSource.disabled = true;

  const filterHost = shell.querySelector('[data-k="sc-filter-toggle"]');
  filterHost.appendChild(makeToggle(comp.scFilterActive ? 'Filter In' : 'Filter Out', comp.scFilterActive, !comp.scWritableShape || !comp.scFilterKnown, () => {
    if (setInputCompressorSidechainToggle(comp.channel, 'filter', !comp.scFilterActive)) triggerConsoleRerender();
  }));
  const bpfHost = shell.querySelector('[data-k="sc-bpf-toggle"]');
  bpfHost.appendChild(makeToggle(comp.scMiddleActive ? 'BPF On' : 'BPF Off', comp.scMiddleActive, !comp.scWritableShape || !comp.scMiddleKnown, () => {
    if (setInputCompressorSidechainToggle(comp.channel, 'middle', !comp.scMiddleActive)) triggerConsoleRerender();
  }));

  const loType = shell.querySelector('[data-k="sc-lo-type"]'), hiType = shell.querySelector('[data-k="sc-hi-type"]');
  if (typeof COMP_SC_LO_TYPE_LABELS !== 'undefined') loType.innerHTML = selectOptionsFromMap(COMP_SC_LO_TYPE_LABELS);
  if (typeof COMP_SC_HI_TYPE_LABELS !== 'undefined') hiType.innerHTML = selectOptionsFromMap(COMP_SC_HI_TYPE_LABELS);
  if (comp.scLoTypeKnown) loType.value = String(comp.scLoTypeRaw); else injectCurrentOption(loType, comp.scLoTypeLabel || 'Unknown');
  if (comp.scHiTypeKnown) hiType.value = String(comp.scHiTypeRaw); else injectCurrentOption(hiType, comp.scHiTypeLabel || 'Unknown');
  loType.disabled = hiType.disabled = !comp.scWritableShape;
  loType.onchange = () => { if (setInputCompressorSidechainType(comp.channel, 'lo', loType.value)) triggerConsoleRerender(); };
  hiType.onchange = () => { if (setInputCompressorSidechainType(comp.channel, 'hi', hiType.value)) triggerConsoleRerender(); };

  const loFreq = shell.querySelector('[data-k="sc-lo-freq"]'), hiFreq = shell.querySelector('[data-k="sc-hi-freq"]'), bpfFreq = shell.querySelector('[data-k="sc-bpf-freq"]');
  if (typeof COMP_SC_LO_HZ_TO_RAW !== 'undefined') loFreq.innerHTML = selectOptionsFromValues([...COMP_SC_LO_HZ_TO_RAW.keys()], formatHz);
  if (typeof COMP_SC_HI_HZ_TO_RAW !== 'undefined') hiFreq.innerHTML = selectOptionsFromValues([...COMP_SC_HI_HZ_TO_RAW.keys()], formatHz);
  if (typeof COMP_SC_BPF_HZ_TO_RAW !== 'undefined') bpfFreq.innerHTML = selectOptionsFromValues([...COMP_SC_BPF_HZ_TO_RAW.keys()], formatHz);
  if (comp.scLoFreqExact && typeof COMP_SC_LO_RAW_TO_HZ !== 'undefined') loFreq.value = String(COMP_SC_LO_RAW_TO_HZ.get(comp.scLoFreqRaw)); else injectCurrentOption(loFreq, `Current ≈ ${formatHz(comp.scLoFreqHz || 20)}`);
  if (comp.scHiFreqExact && typeof COMP_SC_HI_RAW_TO_HZ !== 'undefined') hiFreq.value = String(COMP_SC_HI_RAW_TO_HZ.get(comp.scHiFreqRaw)); else injectCurrentOption(hiFreq, `Current ≈ ${formatHz(comp.scHiFreqHz || 20000)}`);
  if (comp.scBpfFreqExact && typeof COMP_SC_BPF_RAW_TO_HZ !== 'undefined') bpfFreq.value = String(COMP_SC_BPF_RAW_TO_HZ.get(comp.scBpfFreqRaw)); else injectCurrentOption(bpfFreq, `Current ≈ ${formatHz(comp.scBpfFreqHz || 1000)}`);
  loFreq.disabled = hiFreq.disabled = !comp.scWritableShape;
  bpfFreq.disabled = !comp.scBpfWritableShape;
  loFreq.onchange = () => { if (setInputCompressorSidechainFrequency(comp.channel, 'lo', loFreq.value)) triggerConsoleRerender(); };
  hiFreq.onchange = () => { if (setInputCompressorSidechainFrequency(comp.channel, 'hi', hiFreq.value)) triggerConsoleRerender(); };
  bpfFreq.onchange = () => { if (setInputCompressorSidechainBpfFrequency(comp.channel, bpfFreq.value)) triggerConsoleRerender(); };
}
