'use strict';

// Cross-checked channel-state mappings from two real dLive 2.12 shows plus
// ConsoleFlip previews. Keep write=false until isolated one-parameter clones
// demonstrate safe generation.

const inputMixerEntry=PARAMETER_MAP.find(x=>x.id==='input-mixer-record');
if(inputMixerEntry)Object.assign(inputMixerEntry,{
  payload:'label + NUL + 12-byte header + 128 equal-size input blocks',
  field:'Per-input mixer state container',
  offset:'after 12-byte header; blockSize = (stateLength − 12) / 128',
  datatype:'128 repeated variable-size blocks',
  transform:'block size is mixer-configuration dependent; observed 169 and 224 bytes',
  confidence:'decoded',write:false,
  evidence:'Jaylen Aug 15 current scene + Hardcore Start current scene; exact 128-block decomposition in both',
  notes:'Use block-relative/end-relative offsets rather than absolute offsets.'
});

const compressorEntry=PARAMETER_MAP.find(x=>x.id==='compressor-record');
if(compressorEntry)Object.assign(compressorEntry,{
  field:'Compressor model + parameter state',
  offset:'state bytes after label; enable is state + 2',
  datatype:'mixed; enable uint8',
  transform:'enable: 0x00 Off, 0x01 On',
  confidence:'decoded',write:false,
  evidence:'108/108 ConsoleFlip event-show channel cards: state +2 separates Comp On/Off exactly',
  notes:'Enable is decoded but writer remains disabled pending isolated compressor On/Off clones. Other compressor fields remain unmapped.'
});

PARAMETER_MAP.push(
  {
    id:'input-mixer-header',area:'Channel state',record:'Input Mixer',payload:'12-byte header + 128 × blockSize',
    field:'Mixer header',offset:'state + 0..11',datatype:'12 raw bytes',transform:'configuration-dependent; not fully mapped',
    confidence:'decoded',write:false,evidence:'Both real 2.12 shows use exactly 12 bytes before the 128 repeated input blocks',
    notes:'Header is preserved exactly.'
  },
  {
    id:'input-fader',area:'Channel state',record:'Input Mixer',payload:'per-input block; variable size',
    field:'Input fader level',offset:'block + blockSize − 84 .. −83',datatype:'int16 big-endian',
    transform:'raw == -32767 (0x8001) => −∞; otherwise dB = raw / 256',
    confidence:'decoded',write:false,
    evidence:'Event show: 169-byte blocks, offset +85; Hardcore Start: 224-byte blocks, offset +140; ConsoleFlip fader graphics match decoded values',
    notes:'The end-relative location is stable across both observed mixer configurations. Awaiting isolated fader clones before writer promotion.'
  },
  {
    id:'input-pan',area:'Channel state',record:'Input Mixer',payload:'per-input block; variable size',
    field:'Input pan',offset:'block + blockSize − 82',datatype:'uint8',
    transform:'0 = 100% L, 37 (0x25) = C, 74 (0x4A) = 100% R; pan% = (raw − 37) / 37 × 100',
    confidence:'decoded',write:false,
    evidence:'Same end-relative offset across 169/224-byte blocks; ConsoleFlip pan dial angles match raw values exactly in event preview',
    notes:'Awaiting isolated L/C/R pan clones before write support.'
  },
  {
    id:'input-comp-enable',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'156-byte payload observed in current event reference',
    field:'Compressor On/Off',offset:'state + 2',datatype:'uint8',transform:'0x00 Off; 0x01 On',
    confidence:'decoded',write:false,
    evidence:'108/108 ConsoleFlip event-show channel cards matched native byte; active examples include CH14, CH16 and CH18',
    notes:'Read-only until isolated On/Off scenes prove there is no coupled state elsewhere.'
  },
  {
    id:'input-comp-model',area:'Input compressor',record:'Compressor, Input Channel NN',payload:'156-byte payload observed in current event reference',
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
