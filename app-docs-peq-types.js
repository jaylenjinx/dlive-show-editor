'use strict';

const peqDocs=DOC_SECTIONS.find(s=>s.id==='peq');
if(peqDocs){
  peqDocs.eyebrow='Gain/frequency/type/bypass verified';
  peqDocs.html=`
    <h1>Input PEQ record</h1>
    <p>Each input PEQ contains four 9-byte band records followed by one trailing PEQ bypass byte. Controlled dLive 2.12 scene clones now resolve gain, frequency, Bell Width, edge-band filter type and global PEQ In/Out.</p>
    <pre><code>4 × band:
GG GG  FF FF  WW WW  TT  SS SS
│      │      │      │   └─ remaining state — unknown / preserved
│      │      │      └──── filter type byte
│      │      └─────────── Bell Width
│      └────────────────── frequency
└───────────────────────── gain

then:
BB  global PEQ bypass</code></pre>

    <h2>Gain</h2>
    <pre><code>gain_dB = int16_be(raw) / 256
raw     = round(gain_dB × 256)</code></pre>
    <p>Controlled scenes at +1, +3, −3, −15 and +15 dB isolate only the two gain bytes.</p>

    <h2>Frequency</h2>
    <pre><code>raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)</code></pre>
    <p>Controlled values at 100, 200, 500, 1k, 5k and 10k Hz fit this coordinate exactly.</p>

    <h2>Bell Width</h2>
    <p>The high byte follows the Allen &amp; Heath Bell Width index and the low byte carries additional fractional precision. Untouched values are preserved. Deliberate edits write the canonical index with a zero fractional byte.</p>

    <h2>Band 1 / Band 4 filter type — verified write</h2>
    <p>The first byte of the previous three-byte state field, band offset <code>+6</code>, is the filter-type enum. Controlled CH16 scenes changed exactly this one byte outside the scene label.</p>
    <table class="docs-table"><thead><tr><th>Band</th><th>Type</th><th>Raw</th></tr></thead><tbody>
      <tr><td>1</td><td>HPF</td><td><code>04</code></td></tr>
      <tr><td>1</td><td>PEQ / Bell</td><td><code>00</code></td></tr>
      <tr><td>1</td><td>Low Shelf</td><td><code>01</code></td></tr>
      <tr><td>4</td><td>LPF</td><td><code>03</code></td></tr>
      <tr><td>4</td><td>PEQ / Bell</td><td><code>00</code></td></tr>
      <tr><td>4</td><td>High Shelf</td><td><code>02</code></td></tr>
    </tbody></table>
    <p>The observed global sequence is <code>00 Bell</code>, <code>01 Low Shelf</code>, <code>02 High Shelf</code>, <code>03 LPF</code>, <code>04 HPF</code>. The editor exposes only the combinations directly proven for Bands 1 and 4.</p>

    <h2>PEQ In / Out — verified write</h2>
    <pre><code>single trailing byte after Band 4
00 = PEQ In / active
01 = PEQ Out / bypassed</code></pre>
    <p>Controlled CH16 scenes <code>EQ In</code>, <code>EQ Out</code>, <code>EQ In 2</code> and <code>EQ Out 2</code> reproduce the same toggle. In the clean duplicate pair, the trailing PEQ byte is the only byte that changes after the fixed scene-name header in the complete 412,047-byte StageBox scene.</p>

    <h2>Remaining state</h2>
    <p>Band offsets <code>+7..8</code> remain unknown and are preserved exactly. Bands 2 and 3 have no type writer because no controlled type variants were supplied for those bands.</p>

    <div class="docs-callout"><strong>Write boundary:</strong> band gain <code>+0..1</code>, frequency <code>+2..3</code>, Bell Width <code>+4..5</code>, proven Band 1/4 type byte <code>+6</code>, plus the single trailing PEQ bypass byte. Band bytes <code>+7..8</code> remain untouched.</div>
  `;
}
