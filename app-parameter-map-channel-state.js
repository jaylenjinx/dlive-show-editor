'use strict';

// Cross-checked channel-state mappings from real dLive 2.12 shows, ConsoleFlip
// previews and isolated one-parameter clones. Fader, pan and compressor enable
// are verified writes; routing and the remaining compressor parameters are read-only.

const inputMixerEntry=PARAMETER_MAP.find(x=>x.id==='input-mixer-record');
if(inputMixerEntry)Object.assign(inputMixerEntry,{
  payload:'label + NUL + 12-byte header + 128 equal-size input blocks',
  field:'Per-input mixer state container',
  offset:'after 12-byte header; blockSize = (stateLength − 12) / 128',
  datatype:'128 repeated variable-size blocks',
  transform:'block size is mixer-configuration dependent; observed current-format sizes include 169, 208 and 224 bytes',
  confidence:'decoded',write:false,
  evidence:'Jaylen Aug 15 current scene + Hardcore Start current/controlled scenes; exact 128-block decomposition',
  notes:'Use block-relative/end-relative offsets rather than absolute offsets.'
});

const compressorEntry=PARAMETER_MAP.find(x=>x.id==='compressor-record');
if(compressorEntry)Object.assign(compressorEntry,{
  field:'Compressor model + parameter state',
  offset:'state bytes after label; enable is state + 2',
  datatype:'mixed; enable uint8',
  transform:'enable: 0x00 Off, 0x01 On',
  confidence:'decoded',write:false,
  evidence:'108/108 ConsoleFlip event-show channel cards identify state +2 as enable; controlled clones independently isolate the same byte',
  notes:'Container remains read-only as a whole; only the separately mapped enable byte is writable.'
});

PARAMETER_MAP.push(
  {
    id:'input-mixer-header',area:'Channel state',record:'Input Mixer',payload:'12-byte header + 128 × blockSize',
    field:'Mixer header',offset:'state + 0..11',datatype:'12 raw bytes',transform:'configuration-dependent; not fully mapped',
    confidence:'decoded',write:false,evidence:'Current-format shows use exactly 12 bytes before the 128 repeated input blocks',
    notes:'Header is preserved exactly.'
  },
  {
    id:'input-fader',area:'Channel state',record:'Input Mixer',payload:'per-input block; variable size',
    field:'Input fader level',offset:'block + blockSize − 84 .. −83',datatype:'int16 big-endian',
    transform:'raw == -32767 (0x8001) => −∞; otherwise dB = raw / 256',
    confidence:'verified',write:true,
    evidence:'Controlled Hardcore CH16 clones: −∞, −30, −20.3, −12.2, −5.9, ~0, +5, +10 dB changed only these two bytes; event show independently confirms the same end-relative field in 169-byte blocks',
    notes:'Writer is currently constrained to the directly tested finite range −30…+10 dB plus the −∞ sentinel. Location is block-end-relative, so it survives different MixConfig block sizes.'
  },
  {
    id:'input-pan',area:'Channel state',record:'Input Mixer',payload:'per-input block; variable size',
    field:'Input pan',offset:'block + blockSize − 82',datatype:'uint8',
    transform:'0x00 = 100% L; 0x25 = centre; 0x4A = 100% R; decode % = (raw − 37)/37 ×100; canonical write raw = 37 + trunc(%×37/100)',
    confidence:'verified',write:true,
    evidence:'Controlled CH16 pan clones changed only this byte: 100L=00, 50L=13, near-centre=24, 50R=37, 100R=4A; original Scene 10 centre=25; same end-relative offset also matches event-show ConsoleFlip pan controls',
    notes:'The near-centre controlled clone landed at raw 0x24, one step left of canonical centre 0x25. Writer uses 0x25 for exact 0/C and quantises percentages onto the 0..74 raw range.'
  },
  {
    id:'input-comp-enable',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'current-format state length 127 bytes after label',
    field:'Compressor On/Off',offset:'state + 2',datatype:'uint8',transform:'0x00 Off; 0x01 On',
    confidence:'verified',write:true,
    evidence:'108/108 ConsoleFlip event-show channel cards matched native byte; controlled CH16 scenes independently confirm it. Clean Comp 2 On/Off pair changes only state +2 outside the scene label.',
    notes:'Writer is guarded to the verified current-format compressor shape: state length 127, processor discriminator 0x08, and existing enable value 00/01. Model and all dynamics parameters are preserved.'
  },
  {
    id:'input-comp-model',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'156-byte payload observed in current reference channels 01–99',
    field:'Compressor model/type candidate',offset:'state + 1',datatype:'uint8',transform:'observed multiple values (for example 01, 04, 06)',
    confidence:'located',write:false,
    evidence:'Model byte differs across real channels while state +2 independently tracks enable',
    notes:'Needs controlled model-selection scenes before semantic labels are assigned.'
  },
  {
    id:'event-mono-aux-levels',area:'Routing',record:'Input Mixer',payload:'169-byte per-input block in Jaylen Aug 15 configuration',
    field:'Mono Aux send level fields (event configuration)',offset:'observed pairs at block +12, +16, +20, +24, +28, +32',datatype:'int16 big-endian',
    transform:'raw == -32767 => −∞; otherwise dB = raw / 256',
    confidence:'located',write:false,
    evidence:'ConsoleFlip Aux bars for M1/M3/M4/M5/M2/6 match these six level fields in Jaylen Aug 15',
    notes:'Offsets are configuration-specific evidence only. Do not generalise until the bus-layout rule is solved across different MixConfig shapes.'
  }
);
