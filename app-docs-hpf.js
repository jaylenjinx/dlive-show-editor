'use strict';

DOC_SECTIONS.splice(DOC_SECTIONS.findIndex(s=>s.id==='rackultra'),0,{
  id:'hpf', title:'Input HPF', eyebrow:'Verified write',
  html:`
    <h1>Input high-pass filter</h1>
    <p>Real-event evidence plus controlled dLive 2.12 scene clones now resolve all user-facing fields in the five-byte input-HPF state:</p>
    <pre><code>03 FF FF SS BB
│  └─┬─┘ │  └─ bypass: 00 active/on, 01 bypassed/off
│    │   └──── slope / filter-type enum
│    └──────── frequency coordinate
└───────────── observed HPF discriminator/type</code></pre>

    <h2>Frequency</h2>
    <p>HPF uses the same high-resolution logarithmic frequency coordinate as input PEQ:</p>
    <pre><code>raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)</code></pre>
    <p>The editor constrains this control to 20–2000 Hz.</p>

    <h2>Slope / filter type</h2>
    <p>Controlled CH16 clones changed only state byte <code>+3</code> while frequency and bypass stayed constant:</p>
    <pre><code>05 = 6 dB BW
00 = 12 dB BW
01 = 18 dB BW
02 = 24 dB BW
03 = 18 dB Bessel
04 = unmapped</code></pre>
    <p>The scene labels supplied with the experiment are preserved above exactly. The writer offers only these five observed values; an unknown raw value is preserved until a known slope is deliberately selected.</p>

    <h2>Bypass / enable</h2>
    <pre><code>state + 4 = 00  -> HPF active/on
state + 4 = 01  -> HPF bypassed/off</code></pre>
    <p>ConsoleFlip independently rendered 108 input-channel cards from a real event show. Every visible card matched both the native bypass byte and this decoder's rounded frequency.</p>

    <div class="docs-callout"><strong>Writer boundary:</strong> HPF editing changes only state bytes 1–2 for frequency, byte 3 for a verified slope/type value, and byte 4 for bypass. Byte 0 is preserved exactly.</div>
  `
});
