'use strict';

// Console-style visual editor helpers and PEQ surface.
// Writes are delegated to the existing guarded reverse-engineering setters.
const BAND_COLORS = ['#b33ad5', '#00c7c7', '#2878d7', '#ff2847'];
const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const GRID_GAINS = [-12, -6, 0, 6, 12];
const SVG_NS = 'http://www.w3.org/2000/svg';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v))); }
function logX(hz, width, pad = 34) {
  const f = clamp(hz, 20, 20000);
  return pad + (Math.log10(f / 20) / Math.log10(1000)) * (width - pad * 2);
}
function invLogX(x, width, pad = 34) {
  const t = clamp((x - pad) / (width - pad * 2), 0, 1);
  return 20 * Math.pow(1000, t);
}
function gainY(db, height, pad = 26) {
  return pad + ((15 - clamp(db, -15, 15)) / 30) * (height - pad * 2);
}
function invGainY(y, height, pad = 26) {
  const t = clamp((y - pad) / (height - pad * 2), 0, 1);
  return 15 - t * 30;
}
function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
function safeText(value) { return escapeHtml(String(value ?? '')); }
function channelName(channel) {
  const items = state.current?.stage?.managers?.find(x => x.key === 'inputs')?.items || [];
  return items[Number(channel) - 1]?.name || '';
}
function selectedChannel(root) {
  const candidates = [root.dataset.channel, $('#peqEditor')?.dataset.channel, $('#channelStateEditor')?.dataset.channel, 1];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 1 && n <= 128) return n;
  }
  return 1;
}
function syncChannel(channel) {
  const n = String(channel);
  const peq = $('#peqEditor'); if (peq) peq.dataset.channel = n;
  const comp = $('#channelStateEditor'); if (comp) comp.dataset.channel = n;
}
function triggerConsoleRerender() {
  if (typeof renderConsoleEditor === 'function') renderConsoleEditor();
}

function selectOptionsFromMap(map, formatter = x => x) {
  if (!map) return '';
  return [...map.entries()].map(([value, label]) => `<option value="${value}">${safeText(formatter(label, value))}</option>`).join('');
}
function selectOptionsFromValues(values, formatter = x => x) {
  return values.map(value => `<option value="${value}">${safeText(formatter(value))}</option>`).join('');
}
function injectCurrentOption(select, label) {
  const o = document.createElement('option');
  o.value = '';
  o.textContent = label;
  o.selected = true;
  select.prepend(o);
}

// ---------- PEQ graph ----------
function octaveWidthValue(band) {
  const raw = PEQ_WIDTH_TABLE?.[band.widthIndex] || band.widthLabel || '1';
  const s = String(raw);
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return b ? a / b : 1;
  }
  return Number(s) || 1;
}
function biquadCoeffs(band, fs = 48000) {
  const type = band.typeRaw;
  const f0 = clamp(band.frequencyHz, 20, Math.min(20000, fs * 0.45));
  const gain = clamp(band.gainDb, -15, 15);
  const w0 = 2 * Math.PI * f0 / fs;
  const cosw = Math.cos(w0), sinw = Math.sin(w0);
  const A = Math.pow(10, gain / 40);
  const widthOct = Math.max(0.12, octaveWidthValue(band));
  const alphaBw = sinw * Math.sinh((Math.LN2 / 2) * widthOct * w0 / Math.max(1e-7, sinw));
  let b0, b1, b2, a0, a1, a2;
  if (type === 4 || type === 3) {
    const q = 0.7071;
    const alpha = sinw / (2 * q);
    if (type === 4) {
      b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = (1 - cosw) / 2;
    } else {
      b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2;
    }
    a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
  } else if (type === 1 || type === 2) {
    // RBJ shelf preview. The console's exact DSP slope is not claimed here.
    const S = 1;
    const alpha = sinw / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    if (type === 1) {
      b0 = A * ((A + 1) - (A - 1) * cosw + twoSqrtAAlpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosw);
      b2 = A * ((A + 1) - (A - 1) * cosw - twoSqrtAAlpha);
      a0 = (A + 1) + (A - 1) * cosw + twoSqrtAAlpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosw);
      a2 = (A + 1) + (A - 1) * cosw - twoSqrtAAlpha;
    } else {
      b0 = A * ((A + 1) + (A - 1) * cosw + twoSqrtAAlpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosw);
      b2 = A * ((A + 1) + (A - 1) * cosw - twoSqrtAAlpha);
      a0 = (A + 1) - (A - 1) * cosw + twoSqrtAAlpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosw);
      a2 = (A + 1) - (A - 1) * cosw - twoSqrtAAlpha;
    }
  } else {
    const alpha = alphaBw;
    b0 = 1 + alpha * A; b1 = -2 * cosw; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cosw; a2 = 1 - alpha / A;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function responseDb(coeffs, hz, fs = 48000) {
  const [b0, b1, b2, a1, a2] = coeffs;
  const w = 2 * Math.PI * hz / fs;
  const c1 = Math.cos(w), s1 = -Math.sin(w), c2 = Math.cos(2 * w), s2 = -Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = b1 * s1 + b2 * s2;
  const dr = 1 + a1 * c1 + a2 * c2, di = a1 * s1 + a2 * s2;
  const n = Math.sqrt(nr * nr + ni * ni), d = Math.sqrt(dr * dr + di * di);
  return 20 * Math.log10(Math.max(1e-8, n / Math.max(1e-8, d)));
}
function pathFromPoints(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
}
function renderPeqGraph(svg, peq) {
  const W = 1000, H = 430, padX = 44, padY = 32;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, class: 'console-graph-bg' }));
  for (const f of GRID_FREQS) {
    const x = logX(f, W, padX);
    svg.appendChild(svgEl('line', { x1: x, y1: padY, x2: x, y2: H - padY, class: 'console-grid-line' }));
    const t = svgEl('text', { x, y: H - 9, class: 'console-axis-label', 'text-anchor': 'middle' });
    t.textContent = f >= 1000 ? `${f / 1000}k` : String(f); svg.appendChild(t);
  }
  for (const g of GRID_GAINS) {
    const y = gainY(g, H, padY);
    svg.appendChild(svgEl('line', { x1: padX, y1: y, x2: W - padX, y2: y, class: g === 0 ? 'console-grid-zero' : 'console-grid-line' }));
    const t = svgEl('text', { x: 10, y: y + 4, class: 'console-axis-label' }); t.textContent = g > 0 ? `+${g}` : String(g); svg.appendChild(t);
  }
  if (!peq.active) {
    const t = svgEl('text', { x: W / 2, y: H / 2, class: 'console-bypass-label', 'text-anchor': 'middle' });
    t.textContent = 'PEQ OUT / BYPASSED'; svg.appendChild(t);
  }
  const combined = [];
  const coeffs = peq.bands.map(b => biquadCoeffs(b));
  coeffs.forEach((coeff, idx) => {
    const pts = [];
    for (let i = 0; i <= 220; i++) {
      const x = padX + (i / 220) * (W - padX * 2), hz = invLogX(x, W, padX);
      pts.push([x, gainY(clamp(responseDb(coeff, hz), -15, 15), H, padY)]);
    }
    const zero = gainY(0, H, padY);
    const d = `${pathFromPoints(pts)} L${pts[pts.length - 1][0].toFixed(2)},${zero.toFixed(2)} L${pts[0][0].toFixed(2)},${zero.toFixed(2)} Z`;
    const area = svgEl('path', { d, class: 'console-band-area', fill: BAND_COLORS[idx] });
    area.style.opacity = '.28'; svg.appendChild(area);
  });
  for (let i = 0; i <= 320; i++) {
    const x = padX + (i / 320) * (W - padX * 2);
    const hz = invLogX(x, W, padX);
    let db = 0;
    for (const c of coeffs) db += responseDb(c, hz);
    combined.push([x, gainY(clamp(db, -15, 15), H, padY)]);
  }
  svg.appendChild(svgEl('path', { d: pathFromPoints(combined), class: 'console-peq-curve' }));
  peq.bands.forEach((band, idx) => {
    const x = logX(band.frequencyHz, W, padX), y = gainY(band.typeRaw === 3 || band.typeRaw === 4 ? 0 : band.gainDb, H, padY);
    const c = svgEl('circle', { cx: x, cy: y, r: 11, class: 'console-peq-handle', fill: '#111', stroke: BAND_COLORS[idx], 'stroke-width': 4, 'data-band': idx + 1, tabindex: 0 });
    svg.appendChild(c);
    const label = svgEl('text', { x, y: y - 17, class: 'console-handle-label', 'text-anchor': 'middle', fill: BAND_COLORS[idx] });
    label.textContent = `${idx + 1}`; svg.appendChild(label);
    let drag = null;
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId); drag = { id: e.pointerId };
    });
    c.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const rect = svg.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * W / rect.width;
      const sy = (e.clientY - rect.top) * H / rect.height;
      const hz = Math.round(invLogX(sx, W, padX));
      setPeqFrequency(peq.channel, idx + 1, hz);
      if (band.typeRaw !== 3 && band.typeRaw !== 4) setPeqGain(peq.channel, idx + 1, Math.round(invGainY(sy, H, padY) * 10) / 10);
      const current = getInputPeq(peq.channel)?.bands?.[idx];
      if (current) {
        const nx = logX(current.frequencyHz, W, padX);
        const ny = gainY(current.typeRaw === 3 || current.typeRaw === 4 ? 0 : current.gainDb, H, padY);
        c.setAttribute('cx', nx); c.setAttribute('cy', ny);
        label.setAttribute('x', nx); label.setAttribute('y', ny - 17);
      }
    });
    c.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) { drag = null; triggerConsoleRerender(); } });
  });
}

function renderPeqConsole(root, peq) {
  const shell = document.createElement('section'); shell.className = 'dlive-console-frame peq-console';
  shell.innerHTML = `
    <div class="console-section-head">
      <div><span class="console-kicker">INPUT PEQ</span><strong>CH ${peq.channel}${channelName(peq.channel) ? ` · ${safeText(channelName(peq.channel))}` : ''}</strong></div>
      <button type="button" class="console-toggle ${peq.active ? 'on' : ''}" data-k="peq-active">${peq.active ? 'In' : 'Out'}</button>
    </div>
    <div class="console-peq-graph-wrap"><svg class="console-peq-svg" role="img" aria-label="Input PEQ response graph"></svg></div>
    <div class="console-note">Response curve is a visual biquad preview for editing; the byte mappings/writes are verified, but this is not claimed as a bit-exact model of dLive DSP.</div>
    <div class="console-band-strip"></div>`;
  root.appendChild(shell);
  const svg = shell.querySelector('svg'); renderPeqGraph(svg, peq);
  const activeBtn = shell.querySelector('[data-k="peq-active"]');
  activeBtn.disabled = !peq.bypassKnown;
  activeBtn.onclick = () => {
    if (setPeqActive(peq.channel, !peq.active)) triggerConsoleRerender();
    else toast('PEQ In/Out write blocked by structure validation.', true);
  };
  const strip = shell.querySelector('.console-band-strip');
  peq.bands.forEach((b, idx) => {
    const card = document.createElement('article'); card.className = 'console-band-card'; card.style.setProperty('--band', BAND_COLORS[idx]);
    const typeOpts = peqTypeOptions(b.band);
    card.innerHTML = `
      <div class="console-band-title"><span class="console-band-dot"></span><strong>Band ${b.band}</strong><span>${safeText(b.typeLabel)}</span></div>
      ${typeOpts.length ? `<label>Type<select data-k="type">${typeOpts.map(x => `<option value="${x.raw}">${safeText(x.label)}</option>`).join('')}</select></label>` : `<div class="console-readonly-chip">${safeText(b.typeLabel || 'Bell')}</div>`}
      <label>Frequency<div class="console-value-row"><input data-k="freq" type="number" min="20" max="20000" step="1" value="${Math.round(b.frequencyHz)}"><span>Hz</span></div></label>
      <label>Width<select data-k="width">${PEQ_WIDTH_TABLE.map((name, i) => `<option value="${i}">${safeText(name)}</option>`).join('')}</select></label>
      <label>Gain<div class="console-value-row"><input data-k="gain" type="number" min="-15" max="15" step="0.1" value="${b.gainDb.toFixed(1)}"><span>dB</span></div></label>`;
    const type = card.querySelector('[data-k="type"]'); if (type) type.value = String(b.typeRaw);
    card.querySelector('[data-k="width"]').value = String(b.widthIndex);
    const gain = card.querySelector('[data-k="gain"]');
    gain.disabled = b.typeRaw === 3 || b.typeRaw === 4;
    card.querySelector('[data-k="freq"]').onchange = e => { if (setPeqFrequency(peq.channel, b.band, e.target.value)) triggerConsoleRerender(); };
    gain.onchange = e => { if (setPeqGain(peq.channel, b.band, e.target.value)) triggerConsoleRerender(); };
    card.querySelector('[data-k="width"]').onchange = e => { if (setPeqWidth(peq.channel, b.band, e.target.value)) triggerConsoleRerender(); };
    if (type) type.onchange = e => { if (setPeqType(peq.channel, b.band, e.target.value)) triggerConsoleRerender(); else toast('PEQ filter type write blocked.', true); };
    strip.appendChild(card);
  });
}
