'use strict';

// HPF mapping verified against a second real dLive 2.12 event show + ConsoleFlip
// for frequency/bypass, then controlled CH16 clones for slope/type.
PARAMETER_MAP.push(
  {
    id:'hpf-discriminator', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'HPF discriminator / type', offset:'state + 0', datatype:'uint8', transform:'observed 0x03 in current 2.12 input HPF records',
    confidence:'decoded', write:false, evidence:'Current-format scenes across multiple real shows; neighbouring processing records use other discriminators',
    notes:'Parser guard only; not a user parameter.'
  },
  {
    id:'hpf-frequency', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'HPF frequency', offset:'state + 1..2', datatype:'uint16 big-endian', transform:'raw = floor(4608 × log2(f/4)); f = 4 × 2^(raw/4608)',
    confidence:'verified', write:true, evidence:'Real event show contains many active HPFs; 108/108 ConsoleFlip channel cards matched decoded rounded frequency',
    notes:'Same high-resolution logarithmic coordinate as input PEQ. Editor constrains HPF to 20–2000 Hz.'
  },
  {
    id:'hpf-slope', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'HPF slope / filter type', offset:'state + 3', datatype:'uint8 enum',
    transform:'05=6 dB BW; 00=12 dB BW; 01=18 dB BW; 02=24 dB BW; 03=18 dB Bessel; 04 unmapped',
    confidence:'verified', write:true,
    evidence:'Controlled CH16 clones labelled 6db BW, 12db BW, 18db BW, 24db BW and 18db Bessel changed only state byte +3',
    notes:'Writer offers only the five observed values. Any unrecognised raw value is preserved until the user deliberately chooses a known slope.'
  },
  {
    id:'hpf-bypass', area:'Input HPF', record:'Highpass Filter Input Channel NN', payload:'5 state bytes after NUL label terminator',
    field:'HPF bypass / enable', offset:'state + 4', datatype:'uint8', transform:'0x00 = active/on; 0x01 = bypassed/off',
    confidence:'verified', write:true, evidence:'108/108 ConsoleFlip channel cards agree with native show byte across active and bypassed HPFs',
    notes:'Editor writes only 00/01 here.'
  }
);
