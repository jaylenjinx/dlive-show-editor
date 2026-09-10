'use strict';

// HPF mapping verified against a second real dLive 2.12 event show and an
// independent ConsoleFlip preview (108/108 rendered input cards matched).
PARAMETER_MAP.push(
  {
    id:'hpf-discriminator', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'HPF discriminator / type', offset:'state + 0', datatype:'uint8', transform:'observed 0x03 in current 2.12 input HPF records',
    confidence:'decoded', write:false, evidence:'Current-format scenes across two real shows; neighbouring processing records use other discriminators',
    notes:'Parser guard only; not a user parameter.'
  },
  {
    id:'hpf-frequency', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'HPF frequency', offset:'state + 1..2', datatype:'uint16 big-endian', transform:'raw = floor(4608 × log2(f/4)); f = 4 × 2^(raw/4608)',
    confidence:'verified', write:true, evidence:'Second real event show contains many active HPFs; 108/108 ConsoleFlip channel cards matched decoded rounded frequency',
    notes:'Same high-resolution logarithmic coordinate as input PEQ. Editor constrains HPF to 20–2000 Hz.'
  },
  {
    id:'hpf-mode', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'Unknown mode/state', offset:'state + 3', datatype:'uint8', transform:'unknown; usually 0x00, at least one real event record contains 0x01',
    confidence:'unknown', write:false, evidence:'Real event show disproves the earlier constant-byte assumption',
    notes:'Always preserved exactly by the HPF writer.'
  },
  {
    id:'hpf-bypass', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'HPF bypass / enable', offset:'state + 4', datatype:'uint8', transform:'0x00 = active/on; 0x01 = bypassed/off',
    confidence:'verified', write:true, evidence:'108/108 ConsoleFlip channel cards agree with native show byte across active and bypassed HPFs',
    notes:'Editor writes only 00/01 here and leaves byte 3 untouched.'
  }
);
