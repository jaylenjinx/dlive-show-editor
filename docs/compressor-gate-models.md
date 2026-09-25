# Compressor and gate models

Source: Director's *Deep Compressor Libraries* and *Gate Libraries*, each preset recalled on one channel, then the stored scene read back.

## Compressor — `state +1`

Every preset in the library maps to the model byte the editor already labelled:

| Library preset | Model byte |
|---|---:|
| Manual Pk | `00` |
| Manual RMS | `01` |
| Opto | `02` |
| 16T | `03` |
| 16VU | `04` |
| Ducker, Ducker Slow | `05` |
| PeakLimiter76 | `06` |
| Mighty | `07` |
| OptTronik | `08` |
| Bus | `09` |
| CompStortion | `0A` |

The library holds 12 presets covering 11 models (Ducker and Ducker Slow share `05` and differ only in their stored parameters). Recalling a preset rewrites model-specific defaults elsewhere in the 127-byte record, so the editor keeps the model byte read-only.

## Gate — `state +1` of `Gate, Input Channel NN`

| Library preset | Model byte |
|---|---:|
| Gate | `00` |
| Ducker, Ducker Slow | `01` |
| Dual Expander | `02` |
| Source Expander | `03` |

Threshold (`+2..3`), depth (`+8..9`), hold (`+10..11`), release (`+13..14`), attack (`+15..16`) and enable (`+18`) sit at the same offsets for every gate model in the recalled presets (Ducker stores its threshold/depth as `F9 00`, i.e. −7 dB); the presets differ in their default values and in a few unmapped bytes (`+4..7`, `+12`, `+17`).
