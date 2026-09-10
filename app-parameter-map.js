'use strict';

// Canonical dLive 2.12 reverse-engineering registry.
// Keep this file conservative: unknown or partly proven fields remain explicitly read-only.
const PARAMETER_MAP = [
  {
    id:'show-version', area:'Show', record:'Show/Version.dat', payload:'text',
    field:'Show format version', offset:'whole file', datatype:'ASCII integer', transform:'parseInt(text)',
    confidence:'decoded', write:false, evidence:'Observed reference shows; current primary target reports 14',
    notes:'Used for compatibility/reporting. The editor does not synthesize a different show-format version.'
  },
  {
    id:'manager-name', area:'Names & colours', record:'* Channel Name Colour Manager', payload:'signature + 2 + N×10',
    field:'Name', offset:'after signature + 2; N × 9-byte slots', datatype:'fixed ASCII[9]', transform:'max 8 printable ASCII bytes + NUL/padding',
    confidence:'verified', write:true, evidence:'Real Scene 10 tables + successful archive round-trip edit',
    notes:'Writer validates the expected manager payload identity before changing bytes.'
  },
  {
    id:'manager-colour', area:'Names & colours', record:'* Channel Name Colour Manager', payload:'signature + 2 + N×10',
    field:'Colour', offset:'after all N × 9-byte name slots', datatype:'uint8', transform:'0 Off, 1 Red, 2 Green, 3 Yellow, 4 Blue, 5 Magenta, 6 Cyan, 7 White',
    confidence:'verified', write:true, evidence:'Real Scene 10 tables + dLive MIDI colour constants',
    notes:'One byte per object.'
  },
  {
    id:'surface-type', area:'Surface layout', record:'Channel {Left|Middle|Right} Bank Switcher', payload:'label + NUL + 2-byte header + 12×WIDTH assignment bytes',
    field:'Strip type', offset:'assignment[2k + 0]', datatype:'uint8 enum', transform:'00 Blank, 01 Input, 02 Mono Group, 03 Stereo Group, 04 Mono Aux, 05 Stereo Aux, 06 RackExtra FX Send, 08 Main, 0A Mono Matrix, 0B Stereo Matrix, 0C RackExtra FX Return, 0D DCA, 13 RackUltra FX Return',
    confidence:'verified', write:true, evidence:'Factory C1500/C2500/C3500/S3000/S5000/S7000 Strip Assign scenes',
    notes:'Only independently identified type IDs are offered by the writer.'
  },
  {
    id:'surface-index', area:'Surface layout', record:'Channel {Left|Middle|Right} Bank Switcher', payload:'label + NUL + 2-byte header + 12×WIDTH assignment bytes',
    field:'Strip object index', offset:'assignment[2k + 1]', datatype:'uint8', transform:'zero-based object index',
    confidence:'verified', write:true, evidence:'Factory strip-assignment scenes + Scene 10 C1500 layout',
    notes:'Range is constrained by selected strip type.'
  },
  {
    id:'peq-band-count', area:'Input PEQ', record:'Parametric EQ, Input Channel NN', payload:'label-dependent; 4 × 9-byte bands + tail',
    field:'Band count', offset:'NUL(label) + 1', datatype:'uint8', transform:'expected value 4',
    confidence:'verified', write:false, evidence:'All analysed current 2.12 input PEQ records',
    notes:'Used as a parser guard; not user-editable.'
  },
  {
    id:'peq-gain', area:'Input PEQ', record:'Parametric EQ, Input Channel NN', payload:'label-dependent; 4 × 9-byte bands + tail',
    field:'Band gain', offset:'band + 0..1', datatype:'int16 big-endian', transform:'gain_dB = raw / 256; raw = round(dB × 256)',
    confidence:'verified', write:true, evidence:'Controlled clones: +1, +3, −3, −15, +15 dB; Scene 10 ≈ +6 dB',
    notes:'Signed 8.8 fixed-point representation. Editor clamps to −15…+15 dB.'
  },
  {
    id:'peq-frequency', area:'Input PEQ', record:'Parametric EQ, Input Channel NN', payload:'label-dependent; 4 × 9-byte bands + tail',
    field:'Band frequency', offset:'band + 2..3', datatype:'uint16 big-endian', transform:'raw = floor(4608 × log2(f/4)); f = 4 × 2^(raw/4608)',
    confidence:'verified', write:true, evidence:'Controlled clones: 100, 200, 500, 1k, 5k, 10k Hz; exact fit to A&H logarithmic coordinate',
    notes:'Editor constrains frequency to 20 Hz…20 kHz.'
  },
  {
    id:'peq-width', area:'Input PEQ', record:'Parametric EQ, Input Channel NN', payload:'label-dependent; 4 × 9-byte bands + tail',
    field:'Bell Width', offset:'band + 4..5', datatype:'uint16 big-endian', transform:'high byte = A&H Bell Width index; low byte = additional internal fractional precision',
    confidence:'partial', write:true, evidence:'Controlled width clones matching A&H sequence from 1.5 through 1/9',
    notes:'Untouched raw values are preserved exactly. Deliberate edits write canonical index<<8 with low byte 00.'
  },
  {
    id:'peq-state', area:'Input PEQ', record:'Parametric EQ, Input Channel NN', payload:'label-dependent; 4 × 9-byte bands + tail',
    field:'Filter/state/type', offset:'band + 6..8', datatype:'3 raw bytes', transform:'unknown',
    confidence:'unknown', write:false, evidence:'Stable across gain/frequency/width experiments',
    notes:'Needs controlled Bell/Shelf/HPF/LPF and PEQ In/Out scenes.'
  },
  {
    id:'ahfx-length', area:'RackUltra', record:'AHFX Manager 01…08', payload:'262 bytes observed',
    field:'Record payload length', offset:'frame −2..−1', datatype:'uint16 big-endian', transform:'0x0106 = 262 bytes in current reference show',
    confidence:'verified', write:false, evidence:'Eight consecutive managers; identical framing across Scene 1 and Scene 10',
    notes:'Total framed record size is 264 bytes in the current 2.12 reference.'
  },
  {
    id:'ahfx-engine', area:'RackUltra', record:'AHFX Manager NN', payload:'262 bytes observed',
    field:'Engine/model ID', offset:'signature + 0x13..0x14', datatype:'uint16 / two raw bytes', transform:'observed IDs mapped by same-engine comparisons',
    confidence:'decoded', write:false, evidence:'Scene 1 reset + Scene 10 models across all eight RackUltra slots',
    notes:'Observed: 1c03/1c04 Spaces families, 1d00 Plate, 2d00 Rhythm Delay, 2b00 Saturator, 2a00 Amp/Cab, 2400 Shifter, 2300 Dual Harmony, 1e00 Tuner, 2800 Gridder.'
  },
  {
    id:'ahfx-preset', area:'RackUltra', record:'AHFX Manager NN', payload:'262 bytes observed',
    field:'Stored preset label', offset:'signature + 0x15', datatype:'NUL-terminated ASCII string in fixed region', transform:'display text only',
    confidence:'decoded', write:false, evidence:'Scene 1 vs Scene 10 preset/model labels',
    notes:'Field may contain stale bytes after its terminating NUL. Writer remains disabled.'
  },
  {
    id:'ahfx-dsp', area:'RackUltra', record:'AHFX Manager NN', payload:'262 bytes observed',
    field:'DSP parameter payload', offset:'after AHFX header/preset region', datatype:'mixed fixed-position values', transform:'not yet mapped parameter-by-parameter',
    confidence:'unknown', write:false, evidence:'Localised same-engine differences visible between reset and edited scenes',
    notes:'Next step requires one-parameter clones for a single RackUltra engine.'
  },
  {
    id:'mixconfig-version', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Record/version byte', offset:'0', datatype:'uint8', transform:'observed 01',
    confidence:'decoded', write:false, evidence:'Reference show MixConfig.dat',
    notes:'Meaning beyond a version/record discriminator is not proven.'
  },
  {
    id:'mixconfig-mono-groups', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Mono Group count', offset:'1', datatype:'uint8', transform:'direct count',
    confidence:'decoded', write:false, evidence:'Global config count agrees with Scene 10 Input Mixer configuration', notes:'Read-only until complete MixConfig semantics are known.'
  },
  {
    id:'mixconfig-st-groups', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Stereo Group count', offset:'2', datatype:'uint8', transform:'direct count',
    confidence:'decoded', write:false, evidence:'Global config count agrees with Scene 10 mixer structures', notes:'Read-only.'
  },
  {
    id:'mixconfig-mono-fx', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Mono RackExtra FX send count', offset:'3', datatype:'uint8', transform:'direct count',
    confidence:'decoded', write:false, evidence:'Global config + mixer structures', notes:'Read-only.'
  },
  {
    id:'mixconfig-st-fx', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Stereo RackExtra FX send count', offset:'4', datatype:'uint8', transform:'direct count',
    confidence:'decoded', write:false, evidence:'Global config + mixer structures', notes:'Read-only.'
  },
  {
    id:'mixconfig-mono-aux', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Mono Aux count', offset:'5', datatype:'uint8', transform:'direct count',
    confidence:'decoded', write:false, evidence:'Global config + Scene 10 bus layout', notes:'Read-only.'
  },
  {
    id:'mixconfig-st-aux', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Stereo Aux count', offset:'6', datatype:'uint8', transform:'direct count',
    confidence:'decoded', write:false, evidence:'Global config + Scene 10 bus layout', notes:'Read-only.'
  },
  {
    id:'mixconfig-unknown-7-8', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Unknown fields', offset:'7, 8', datatype:'uint8 ×2', transform:'unknown',
    confidence:'unknown', write:false, evidence:'Observed but not independently labelled', notes:'Preserved exactly.'
  },
  {
    id:'mixconfig-mono-matrix', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Mono Matrix count', offset:'9', datatype:'uint8', transform:'direct count',
    confidence:'decoded', write:false, evidence:'Global config + Scene 10 matrix layout', notes:'Read-only.'
  },
  {
    id:'mixconfig-st-matrix', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Stereo Matrix count', offset:'10', datatype:'uint8', transform:'direct count',
    confidence:'decoded', write:false, evidence:'Global config + Scene 10 matrix layout', notes:'Read-only.'
  },
  {
    id:'mixconfig-unknown-11-12', area:'Mixer config', record:'Show/MixConfig/MixConfig.dat', payload:'13 bytes',
    field:'Unknown fields', offset:'11, 12', datatype:'uint8 ×2', transform:'unknown',
    confidence:'unknown', write:false, evidence:'Observed but not independently labelled', notes:'Preserved exactly.'
  },
  {
    id:'hpf-record', area:'Input processing', record:'Highpass Filter Input Channel NN', payload:'framed, current size to catalogue per scene',
    field:'HPF enable/frequency', offset:'unknown', datatype:'unknown', transform:'unknown',
    confidence:'located', write:false, evidence:'Labelled record found by Structure inspector; live MIDI independently exposes HPF frequency/on',
    notes:'High-value next controlled-diff target.'
  },
  {
    id:'compressor-record', area:'Input processing', record:'Compressor, Input Channel NN', payload:'156 bytes observed for current reference channels',
    field:'Compressor parameters', offset:'unknown', datatype:'mixed', transform:'unknown',
    confidence:'located', write:false, evidence:'Labelled framed records in Scene 10',
    notes:'Need threshold/ratio/attack/release/knee/makeup/on-off one-parameter experiments.'
  },
  {
    id:'gate-record', area:'Input processing', record:'Gate, Input Channel NN', payload:'framed; exact field map pending',
    field:'Gate parameters', offset:'unknown', datatype:'mixed', transform:'unknown',
    confidence:'located', write:false, evidence:'Labelled record found by Structure inspector',
    notes:'Pending controlled diffs.'
  },
  {
    id:'delay-record', area:'Input processing', record:'Delay, Input Channel NN', payload:'framed; exact field map pending',
    field:'Input delay', offset:'unknown', datatype:'unknown', transform:'unknown',
    confidence:'located', write:false, evidence:'Labelled record found by Structure inspector',
    notes:'Pending controlled diffs.'
  },
  {
    id:'stereo-image-record', area:'Input processing', record:'Stereo Image, Input Channel NN', payload:'framed; exact field map pending',
    field:'Pan / width / stereo-image state', offset:'unknown', datatype:'unknown', transform:'unknown',
    confidence:'located', write:false, evidence:'Labelled record found by Structure inspector',
    notes:'Do not assume this record alone contains every pan value.'
  },
  {
    id:'attenuator-record', area:'Input processing', record:'Digital Attenuator Input Channel NN', payload:'variable across analysed factory/current scenes',
    field:'Digital attenuation state', offset:'unknown', datatype:'unknown / possibly sparse', transform:'unknown',
    confidence:'located', write:false, evidence:'Same label observed with differing serialized lengths',
    notes:'Important warning against assuming a fixed struct across historical/factory scenes.'
  },
  {
    id:'send-source-record', area:'Routing', record:'Send Source Select …', payload:'framed; field map pending',
    field:'Send source / pre-post routing state', offset:'unknown', datatype:'unknown', transform:'unknown',
    confidence:'located', write:false, evidence:'Labelled records in StageBox scenes + live MIDI routing semantics',
    notes:'Pending controlled aux/group routing experiments.'
  },
  {
    id:'input-mixer-record', area:'Routing', record:'Input Mixer', payload:'framed; mixer-config dependent',
    field:'Input mix assignments/levels', offset:'unknown', datatype:'mixed / likely repeated channel-bus data', transform:'unknown',
    confidence:'located', write:false, evidence:'Scene 10 structure + count sequence matching MixConfig',
    notes:'Likely important for fader/pan/sends, but no writable offsets promoted yet.'
  },
  {
    id:'preamp-model-record', area:'Input processing', record:'Preamp Model …', payload:'framed; field map pending',
    field:'Preamp model/state', offset:'unknown', datatype:'unknown', transform:'unknown',
    confidence:'located', write:false, evidence:'Labelled records in StageBox scenes; live SysEx provides independent preamp semantics',
    notes:'Offline show representation not yet mapped.'
  }
];

const PARAMETER_MAP_CONFIDENCE = {
  verified:{label:'VERIFIED WRITE', css:'verified'},
  partial:{label:'PARTIAL / CONSERVATIVE WRITE', css:'decoded'},
  decoded:{label:'DECODED / READ ONLY', css:'decoded'},
  located:{label:'LOCATED / UNMAPPED', css:'unknown'},
  unknown:{label:'UNKNOWN', css:'unknown'}
};
