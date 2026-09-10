'use strict';

const channelStateInsert=DOC_SECTIONS.findIndex(s=>s.id==='surface');
DOC_SECTIONS.splice(channelStateInsert<0?DOC_SECTIONS.length:channelStateInsert,0,{
  id:'channel-state',title:'Channel state',eyebrow:'Cross-checked read',
  html:`
    <h1>Input Mixer channel state</h1>
    <p>Two real dLive 2.12 shows with different mixer configurations reveal a repeatable structure inside the labelled <code>Input Mixer</code> record:</p>
    <pre><code>Input Mixer\0
12-byte mixer header
128 × variable-size input-channel blocks</code></pre>
    <p>The event show uses 169-byte channel blocks. The earlier Hardcore Start show uses 224-byte blocks. Despite that difference, fader and pan remain at fixed offsets measured from the <em>end</em> of each block.</p>

    <h2>Input fader</h2>
    <pre><code>offset = blockStart + blockSize - 84
raw    = int16_be(bytes)

raw == 0x8001 (-32767)  =>  -∞
otherwise               =>  dB = raw / 256</code></pre>
    <p>Examples from the event show include 0 dB as <code>00 00</code>, approximately +4.71 dB as <code>04 B6</code>, −20 dB as <code>EC 00</code>, and −∞ as <code>80 01</code>. ConsoleFlip's rendered fader heights independently agree with these values.</p>

    <h2>Input pan</h2>
    <pre><code>offset = blockStart + blockSize - 82
0x00 = 100% L
0x25 = centre
0x4A = 100% R

pan_percent = (raw - 37) / 37 × 100</code></pre>
    <p>ConsoleFlip's rendered pan dial angles agree with this mapping, including hard-left, centre, intermediate positions and hard-right examples.</p>

    <h2>Input compressor enable</h2>
    <p>The separate <code>Compressor, Input Channel NN</code> record has an independently cross-checked enable byte:</p>
    <pre><code>state + 2 = 00  -> Comp Off
state + 2 = 01  -> Comp On</code></pre>
    <p>All 108 visible channel cards in the event-show ConsoleFlip preview matched this byte. Other compressor parameters and the model/type byte are still being mapped.</p>

    <h2>Aux-send evidence</h2>
    <p>In the 169-byte event configuration, six mono Aux send levels are visible as signed 16-bit fixed-point values at block offsets <code>+12,+16,+20,+24,+28,+32</code>. They use the same <code>raw/256 dB</code> convention and <code>0x8001</code> −∞ sentinel. These offsets are <strong>not yet treated as universal</strong> because the earlier show has a different bus configuration and channel-block length.</p>

    <div class="docs-callout warning"><strong>Write policy:</strong> fader, pan, compressor and aux state stay read-only until isolated one-parameter scene clones prove that writing the identified byte does not require coupled state elsewhere.</div>
  `
});
