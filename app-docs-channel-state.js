'use strict';

const channelStateInsert=DOC_SECTIONS.findIndex(s=>s.id==='surface');
DOC_SECTIONS.splice(channelStateInsert<0?DOC_SECTIONS.length:channelStateInsert,0,{
  id:'channel-state',title:'Channel state',eyebrow:'Fader + pan verified write',
  html:`
    <h1>Input Mixer channel state</h1>
    <p>Real dLive 2.12 shows with different mixer configurations reveal a repeatable structure inside the labelled <code>Input Mixer</code> record:</p>
    <pre><code>Input Mixer\0
12-byte mixer header
128 × variable-size input-channel blocks</code></pre>
    <p>Observed current-format channel blocks include 169, 208 and 224 bytes. Despite that variation, fader and pan remain at fixed offsets measured from the <em>end</em> of each block.</p>

    <h2>Input fader — verified write</h2>
    <pre><code>offset = blockStart + blockSize - 84
raw    = int16_be(bytes)

raw == 0x8001 (-32767)  =>  -∞
otherwise               =>  dB = raw / 256</code></pre>
    <p>A controlled CH16 series used −∞, −30, −20.3, −12.2, −5.9, approximately 0, +5 and +10 dB. Across that series, only the two bytes at <code>blockSize − 84</code> changed inside the channel block.</p>
    <div class="docs-callout"><strong>Current fader guard:</strong> the editor computes <code>blockSize = (stateLength - 12) / 128</code> and writes only current-format records whose 12-byte header starts with <code>03</code>. Finite writes are intentionally constrained to the directly tested range −30…+10 dB; −∞ uses <code>80 01</code>.</div>

    <h2>Input pan — verified write</h2>
    <pre><code>offset = blockStart + blockSize - 82
0x00 = 100% L
0x25 = exact centre
0x4A = 100% R

pan_percent = (raw - 37) / 37 × 100
canonical raw = 37 + trunc(pan_percent × 37 / 100)</code></pre>
    <p>A controlled CH16 series changed only this one byte and produced <code>00</code> for 100L, <code>13</code> for 50L, <code>24</code> for the labelled near-centre clone, <code>37</code> for 50R and <code>4A</code> for 100R. The original Scene 10 exact centre is <code>25</code>.</p>
    <p>The <code>24</code> near-centre result is one raw step left of canonical centre, consistent with normal control quantisation. The writer uses <code>25</code> for an exact 0/C request and quantises other percentages onto the 0…74 raw range.</p>

    <h2>Input compressor enable — read only</h2>
    <p>The separate <code>Compressor, Input Channel NN</code> record has an independently cross-checked enable byte:</p>
    <pre><code>state + 2 = 00  -> Comp Off
state + 2 = 01  -> Comp On</code></pre>
    <p>All 108 visible channel cards in the event-show ConsoleFlip preview matched this byte. Other compressor parameters and the model/type byte are still being mapped.</p>

    <h2>Aux-send evidence</h2>
    <p>In the 169-byte event configuration, six mono Aux send levels are visible as signed 16-bit fixed-point values at block offsets <code>+12,+16,+20,+24,+28,+32</code>. They use the same <code>raw/256 dB</code> convention and <code>0x8001</code> −∞ sentinel. These offsets are <strong>not yet treated as universal</strong> because bus configuration changes the variable portion of each channel block.</p>

    <div class="docs-callout warning"><strong>Write policy:</strong> fader and pan are verified writable. Compressor and aux state remain read-only until their own isolated one-parameter scene clones prove safe generation.</div>
  `
});
