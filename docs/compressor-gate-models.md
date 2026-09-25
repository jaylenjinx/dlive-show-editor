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

## Model parameters found so far (Main LR, `RevEngModels`)

Changing a control on a recalled preset and diffing the scene gave these layouts (same coordinates as the input compressor):

- **Ducker (`05`)**: threshold `+8..9` (int16/256, −46…+18 dB), attack `+10..11` (30 µs…300 ms), release `+12..13` (50 ms…2 s), hold `+25..26` (10 ms…5 s) — all `time_log` for the times — and depth `+23..24` (int16/256, 0…60 dB). Values written match the anchors exactly (e.g. 10 ms → `5D18`, 100 ms → `745E`, 500 ms → `84A2`).
- **Output gain `+16..17`** (int16/256): 16T (`03`, −18…+18 dB), 16VU (`04`) and Mighty (`07`) (both −10…+18 dB).
- **Ratio**: 16T and 16VU store ratio at `+15` but in their own tables (16T: 2:1 → `08`, 6:1 → `19`; 16VU: 2:1 → `06`, 6:1 → `1C`), not the 41-step Manual RMS/Peak table.
- Threshold on the 16T/16VU/Mighty side panel is display-only (typing did not change any byte); CompStortion, PeakLimiter76 and OptTronik expose no typeable control, so their parameters need knob sweeps and are not mapped.

The editor's Buses tab writes the Ducker fields and the output gain above. Other model parameters stay read-only.

## Peak Limiter 76 (`06`) — knob sweeps (scenes 300–359, input 13)

The plug-in GUI has no numeric readouts, so knobs were dragged to their end stops and stepped, and buttons clicked one at a time, reading the changed bytes.

| Control | Offset | Finding |
|---|---|---|
| Input knob | `+34` (int8) | continuous, −40…+18 (`D8`…`12`); steps seen `DA, EE, F8, FF, 06, 0D, 10, 12` |
| Output knob | `+36` (int8) | −80 (`B0`, the ∞ end)…+18 |
| Attack knob | `+28..29` | `time_log` word in **nanoseconds**: `A9E9` = 20 µs … `C481` = 277.5 µs (stepping the knob gave a smooth monotonic sequence) |
| Release knob | `+30..31` | `time_log` word in ms: `73DD` = 95 ms … `94E4` = 2497 ms |
| Ratio buttons | `+27` | `00` All, `01` 4, `02` 8, `03` 12, `04` 20 |
| Gain Link | `+32` | `00`/`01` |
| Unit switch | `+33` | `00` = unit 1, `01` = unit 2 |
| GR / OUT / OUT+8 meter buttons | — | change no scene byte |

The attack/release words fit the shared `time_log` coordinate exactly at both ends (attack 19 980 ns, release 95.1 ms), which is why they are treated as continuous. The dB meaning of the Input/Output bytes is inferred from the printed knob scales, not read from a display. The Buses tab writes these controls, flagged "end stops swept".
