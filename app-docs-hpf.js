'use strict';

DOC_SECTIONS.splice(DOC_SECTIONS.findIndex(s=>s.id==='rackultra'),0,{
  id:'hpf', title:'Input HPF', eyebrow:'High-confidence read',
  html:`
    <h1>Input high-pass filter</h1>
    <p>The current dLive 2.12 reference stores each input HPF in a compact five-byte state payload after the record label.</p>
    <pre><code>03 53 96 00 01
│  └─┬─┘ │  └─ observed constant tail/state byte
│    │   └──── enable candidate (00 = Off in reference file)
│    └──────── frequency coordinate
└───────────── observed HPF discriminator/type</code></pre>
    <h2>Frequency candidate</h2>
    <p>The reference value <code>53 96</code> is decimal 21398 and decodes to exactly 100 Hz with the same high-resolution logarithmic coordinate already proven for input PEQ:</p>
    <pre><code>raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)</code></pre>
    <p>This is independently consistent with the dLive MIDI implementation, which maps HPF frequency logarithmically across 20–2000 Hz.</p>
    <h2>Enable candidate</h2>
    <p>Byte 3 is <code>00</code> for all analysed reference channels. ConsoleFlip independently rendered the same channels as <strong>HPF Off</strong>, making this a strong Off-state candidate. The On representation has not yet been observed.</p>
    <div class="docs-callout warning"><strong>Read-only for now:</strong> this evidence is strong enough to decode and display, but not enough to write. A controlled HPF On/Off pair plus several frequency values is still required.</div>
    <h2>Controlled test matrix</h2>
    <pre><code>HPF OFF 100
HPF ON 100
HPF ON 20
HPF ON 50
HPF ON 200
HPF ON 500
HPF ON 1000
HPF ON 2000</code></pre>
    <p>Use the same channel and same cloned dLive 2.12 baseline for every scene, changing nothing except HPF.</p>
  `
});
