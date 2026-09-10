const DOC_SECTIONS = [
  {
    id:'overview',
    title:'Overview',
    eyebrow:'Reverse engineering',
    html:`
      <h1>dLive show-file documentation</h1>
      <p class="docs-lead">These notes document structures observed in Allen &amp; Heath dLive show archives while developing this editor. They are <strong>not an official Allen &amp; Heath specification</strong>. The current primary target is dLive firmware 2.12.</p>
      <div class="docs-callout warning"><strong>Safety rule:</strong> only fields promoted to <em>Verified write</em> are changed by the editor. Decoded-but-unproven and unknown bytes are preserved exactly.</div>
      <h2>Current confidence model</h2>
      <div class="docs-status-grid">
        <div><span class="confidence verified">VERIFIED WRITE</span><p>Names/colours, C-class strip assignments, PEQ gain and PEQ frequency. Bell Width has a conservative canonical writer.</p></div>
        <div><span class="confidence decoded">DECODED / READ ONLY</span><p>RackUltra record framing and model IDs, large parts of MixConfig, generic labelled record framing.</p></div>
        <div><span class="confidence unknown">UNKNOWN</span><p>Anything whose meaning or encoding has not been reproduced from controlled scene diffs.</p></div>
      </div>
      <h2>How the format is approached</h2>
      <p>The project uses controlled scene cloning: duplicate a known scene, change exactly one console parameter, then compare the resulting nested scene payloads byte-for-byte. A field is only promoted when the change is isolated, repeatable, and its numerical transform is understood.</p>
    `
  },
  {
    id:'archive', title:'Show archive', eyebrow:'Container format',
    html:`
      <h1>Show archive layout</h1>
      <p>A dLive show is a gzip-compressed TAR. The archive contains global configuration plus nested gzip/TAR archives for MixRack and Surface scene state.</p>
      <pre><code>Show/
├── Version.dat
├── MixConfig/MixConfig.dat
└── Scenes/
    ├── StageBoxScene010.tar.gz
    ├── SurfaceScene010.tar.gz
    └── ...</code></pre>
      <p>Each nested scene archive contains a principal <code>.dat</code> payload. The editor preserves unrecognised outer entries and rebuilds only scene archives that were actually modified.</p>
      <h2>Export validation</h2>
      <p>Before download, the editor reopens the generated gzip/TAR, verifies the outer entry count and confirms that modified nested scene archives still contain their expected <code>.dat</code> payloads.</p>
    `
  },
  {
    id:'records', title:'Scene records', eyebrow:'Binary framing',
    html:`
      <h1>Length-prefixed scene records</h1>
      <p>Many dLive scene objects use a common framing:</p>
      <pre><code>uint16_be payload_length
payload[payload_length]</code></pre>
      <p>For labelled objects, the payload generally begins with a NUL-terminated printable ASCII label followed by state bytes. This framing has been independently observed on name/colour managers, surface bank switchers, RackUltra managers, PEQs, compressors and other processing records.</p>
      <h2>Why this matters</h2>
      <p>The two-byte length prefix provides a hard boundary for safe parsing. We no longer infer record size from the location of the next printable string.</p>
      <div class="docs-callout"><strong>Important:</strong> equal labels do not guarantee identical state layouts across every historical/factory scene. Current 2.12 scenes are treated as the primary parameter reference.</div>
    `
  },
  {
    id:'names', title:'Names & colours', eyebrow:'Verified write',
    html:`
      <h1>Name and colour managers</h1>
      <p>Recognised channel-class managers contain fixed-width names followed by one-byte colour IDs.</p>
      <pre><code>uint16_be payload_length
ASCII signature
00 01
N × 9-byte name slots
N × 1-byte colour IDs</code></pre>
      <p>Names are limited to eight printable ASCII characters with NUL/padding in the ninth byte.</p>
      <table><thead><tr><th>ID</th><th>Colour</th></tr></thead><tbody>
      <tr><td>0</td><td>Off</td></tr><tr><td>1</td><td>Red</td></tr><tr><td>2</td><td>Green</td></tr><tr><td>3</td><td>Yellow</td></tr><tr><td>4</td><td>Blue</td></tr><tr><td>5</td><td>Magenta</td></tr><tr><td>6</td><td>Cyan</td></tr><tr><td>7</td><td>White</td></tr>
      </tbody></table>
    `
  },
  {
    id:'surface', title:'Surface layout', eyebrow:'Verified write',
    html:`
      <h1>C-class surface strip assignments</h1>
      <p>Factory C1500/C2500/C3500 strip-assignment scenes provided controlled examples for the Surface bank records. Each fader assignment is two bytes:</p>
      <pre><code>[ strip_type, zero_based_object_index ]</code></pre>
      <p>A bank payload contains six layers. For a C1500 left bank, the observed width is 12, giving 72 assignments.</p>
      <h2>Verified strip type IDs</h2>
      <table><thead><tr><th>Hex</th><th>Object</th></tr></thead><tbody>
      <tr><td>00</td><td>Blank</td></tr><tr><td>01</td><td>Input</td></tr><tr><td>02</td><td>Mono Group</td></tr><tr><td>03</td><td>Stereo Group</td></tr><tr><td>04</td><td>Mono Aux</td></tr><tr><td>05</td><td>Stereo Aux</td></tr><tr><td>06</td><td>RackExtra FX Send</td></tr><tr><td>08</td><td>Main</td></tr><tr><td>0A</td><td>Mono Matrix</td></tr><tr><td>0B</td><td>Stereo Matrix</td></tr><tr><td>0C</td><td>RackExtra FX Return</td></tr><tr><td>0D</td><td>DCA</td></tr><tr><td>13</td><td>RackUltra FX Return</td></tr>
      </tbody></table>
      <p>Unidentified type values are displayed but never overwritten by the editor.</p>
    `
  },
  {
    id:'peq', title:'Input PEQ', eyebrow:'Controlled-diff verified',
    html:`
      <h1>Input PEQ record</h1>
      <p>Each input PEQ contains four 9-byte band records. Controlled Scene 10 clones isolated gain, frequency and Bell Width.</p>
      <pre><code>GG GG  FF FF  WW WW  SS SS SS
│      │      │      └─ state / filter-type bytes (unmapped)
│      │      └──────── Bell Width
│      └─────────────── frequency
└────────────────────── gain</code></pre>
      <h2>Gain</h2>
      <p>Gain is a signed big-endian 16-bit fixed-point value:</p>
      <pre><code>gain_dB = int16_be(raw) / 256
raw     = round(gain_dB × 256)</code></pre>
      <p>Example: <code>06 00</code> = +6.0 dB; <code>F1 00</code> = −15.0 dB.</p>
      <h2>Frequency</h2>
      <p>The controlled 100 Hz, 200 Hz, 500 Hz, 1 kHz, 5 kHz and 10 kHz scenes all match this logarithmic mapping exactly:</p>
      <pre><code>raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)</code></pre>
      <p>Example: 1 kHz is stored as <code>8F 62</code>.</p>
      <h2>Bell Width</h2>
      <p>The high byte maps to Allen &amp; Heath's Bell Width index. The low byte carries additional internal precision. Untouched values are preserved exactly; when deliberately changed, the editor writes the canonical table index with a zero fractional byte.</p>
      <div class="docs-callout warning"><strong>Still unresolved:</strong> the final three bytes contain filter/state/type information. They remain read-only until controlled Bell/Shelf/HPF/LPF and PEQ In/Out diffs are available.</div>
    `
  },
  {
    id:'rackultra', title:'RackUltra', eyebrow:'Decoded / read only',
    html:`
      <h1>RackUltra / AHFX records</h1>
      <p>Eight records are anchored by <code>AHFX Manager 01</code> through <code>AHFX Manager 08</code>. In the current 2.12 reference show the payload is 262 bytes, or 264 bytes including its 2-byte length prefix.</p>
      <h2>Observed model IDs</h2>
      <table><thead><tr><th>ID</th><th>Observed model family</th></tr></thead><tbody>
      <tr><td>1c03</td><td>Spaces / 480 Large family</td></tr><tr><td>1c04</td><td>Spaces / 480 Medium family</td></tr><tr><td>1d00</td><td>Plate Reverb Designer</td></tr><tr><td>2d00</td><td>Rhythm Delay</td></tr><tr><td>2b00</td><td>Saturator</td></tr><tr><td>2a00</td><td>Amp/Cab</td></tr><tr><td>2400</td><td>Shifter</td></tr><tr><td>2300</td><td>Dual Harmony</td></tr><tr><td>1e00</td><td>Tuner</td></tr><tr><td>2800</td><td>Gridder</td></tr>
      </tbody></table>
      <p>Preset labels and same-engine byte differences can be inspected, but DSP parameter writing is still disabled until one-parameter controlled diffs prove offsets and scaling.</p>
    `
  },
  {
    id:'mixconfig', title:'MixConfig', eyebrow:'High-confidence read',
    html:`
      <h1>MixConfig.dat</h1>
      <p>The reference show uses a 13-byte mixer-configuration record. Several count bytes are strongly identified, but the record is still read-only because four fields remain unidentified.</p>
      <pre><code>byte 0   record/version
byte 1   mono group count
byte 2   stereo group count
byte 3   mono RackExtra FX send count
byte 4   stereo RackExtra FX send count
byte 5   mono aux count
byte 6   stereo aux count
byte 9   mono matrix count
byte 10  stereo matrix count</code></pre>
      <p>Bytes 7, 8, 11 and 12 remain unresolved in the current research set.</p>
    `
  },
  {
    id:'method', title:'Research method', eyebrow:'How to contribute',
    html:`
      <h1>Controlled-diff research method</h1>
      <p>The fastest way to extend the format map is to create labelled clones of one current 2.12 scene and change exactly one parameter in each clone.</p>
      <ol>
        <li>Clone the same baseline scene.</li>
        <li>Change one parameter only.</li>
        <li>Use several values across the parameter range.</li>
        <li>Label every scene with the exact value.</li>
        <li>Export the complete show without making unrelated changes.</li>
      </ol>
      <h2>High-value next experiments</h2>
      <p>PEQ filter type and in/out, HPF enable/frequency, channel fader, mute/pan, compressor parameters, aux send level/on/pre-post, and then individual RackUltra parameters.</p>
      <div class="docs-callout"><strong>Promotion rule:</strong> a field should not become writable just because two files differ at one offset. We want repeatability, known range behaviour, and preferably an independent reference such as the dLive MIDI protocol.</div>
      <p>Repository research files live under <code>/docs</code> and <code>KNOWN_FORMAT.md</code>.</p>
    `
  }
];

function renderDocs(){
  const nav=$('#docsNav');
  const article=$('#docsArticle');
  if(!nav||!article)return;
  if(!nav.children.length){
    for(const section of DOC_SECTIONS){
      const b=document.createElement('button');
      b.className='docs-nav-item';b.dataset.doc=section.id;b.textContent=section.title;
      b.onclick=()=>showDoc(section.id);
      nav.appendChild(b);
    }
  }
  const selected=location.hash.startsWith('#docs-')?location.hash.slice(6):'overview';
  showDoc(DOC_SECTIONS.some(s=>s.id===selected)?selected:'overview',false);
}

function showDoc(id,updateHash=true){
  const section=DOC_SECTIONS.find(s=>s.id===id)||DOC_SECTIONS[0];
  $$('.docs-nav-item').forEach(b=>b.classList.toggle('active',b.dataset.doc===section.id));
  const article=$('#docsArticle');
  article.innerHTML=`<div class="eyebrow">${section.eyebrow}</div>${section.html}<div class="docs-footer">Unofficial reverse-engineering documentation · target reference: dLive 2.12 · <a href="https://github.com/jaylenjinx/dlive-show-editor/tree/main/docs" target="_blank" rel="noreferrer">repository docs</a></div>`;
  if(updateHash)history.replaceState(null,'',`#docs-${section.id}`);
  article.scrollTop=0;window.scrollTo({top:0,behavior:'smooth'});
}
