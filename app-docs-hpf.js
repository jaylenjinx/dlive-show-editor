'use strict';

DOC_SECTIONS.splice(DOC_SECTIONS.findIndex(s=>s.id==='rackultra'),0,{
  id:'hpf', title:'Input HPF', eyebrow:'Verified write',
  html:`
    <h1>Input high-pass filter</h1>
    <p>A second real dLive 2.12 event show plus its ConsoleFlip preview resolves the five-byte input-HPF state layout:</p>
    <pre><code>03 FF FF MM BB
│  └─┬─┘ │  └─ bypass: 00 active/on, 01 bypassed/off
│    │   └──── unknown mode/state byte — preserve
│    └──────── frequency coordinate
└───────────── observed HPF discriminator/type</code></pre>

    <h2>Frequency</h2>
    <p>HPF uses the same high-resolution logarithmic frequency coordinate as input PEQ:</p>
    <pre><code>raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)</code></pre>
    <p>The editor constrains this control to the documented dLive HPF range of 20–2000 Hz.</p>

    <h2>Bypass / enable</h2>
    <pre><code>state + 4 = 00  -> HPF active/on
state + 4 = 01  -> HPF bypassed/off</code></pre>
    <p>ConsoleFlip independently rendered 108 input-channel cards from the event show. Every visible card matched both the native bypass byte and this decoder's rounded frequency.</p>

    <h2>Unknown byte 3</h2>
    <p>This byte is usually <code>00</code>, but at least one real event scene contains <code>01</code>. Its purpose is unresolved, so the writer never changes it.</p>

    <div class="docs-callout"><strong>Writer boundary:</strong> HPF editing changes only state bytes 1–2 for frequency and byte 4 for bypass. Byte 0 and the unknown byte 3 are preserved exactly.</div>
  `
});
