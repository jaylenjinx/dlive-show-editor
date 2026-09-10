'use strict';

// HPF findings layered onto the canonical registry until controlled on/off scenes
// justify promotion into the core writer.
PARAMETER_MAP.push(
  {
    id:'hpf-discriminator', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'HPF discriminator / type', offset:'state + 0', datatype:'uint8', transform:'observed constant 0x03',
    confidence:'decoded', write:false, evidence:'All 128 input HPF records in Scene 10/current/reset use 0x03; neighbouring Lowpass records use a different discriminator',
    notes:'Semantics are not fully proven. Treated as a parser guard, not a user parameter.'
  },
  {
    id:'hpf-frequency', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'HPF frequency', offset:'state + 1..2', datatype:'uint16 big-endian', transform:'candidate exact mapping: raw = floor(4608 × log2(f/4)); f = 4 × 2^(raw/4608)',
    confidence:'decoded', write:false, evidence:'Reference raw 0x5396 decodes exactly to 100 Hz; independent dLive MIDI code documents logarithmic 20–2000 Hz HPF control',
    notes:'High-confidence read. Needs controlled 20/50/100/200/500/1000/2000 Hz clones before writer promotion.'
  },
  {
    id:'hpf-enable', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'HPF enable candidate', offset:'state + 3', datatype:'uint8', transform:'0x00 = Off in current reference; non-zero On representation not yet observed',
    confidence:'partial', write:false, evidence:'All reference records store 00 and ConsoleFlip independently renders the same channels as HPF Off',
    notes:'Requires an isolated HPF On/Off scene pair before any write support.'
  },
  {
    id:'hpf-tail', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'Trailing state/version byte', offset:'state + 4', datatype:'uint8', transform:'observed constant 0x01',
    confidence:'unknown', write:false, evidence:'All analysed current/reference input HPF records',
    notes:'Preserved exactly.'
  }
);
