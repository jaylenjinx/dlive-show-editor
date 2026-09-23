# RackUltra / AHFX records

**Status:** decoded generally; **verified restricted writes for growing subsets of Spaces / 480 Large (`1c03`), Spaces / 480 Medium (`1c04`), Plate Reverb Designer (`1d00`) and Rhythm Delay (`2d00`)**.

Eight records are anchored by:

```text
AHFX Manager 01
...
AHFX Manager 08
```

In the current 2.12 reference shows, each AHFX payload is 262 bytes. Including the 2-byte length prefix, a record occupies 264 bytes.

## Observed engine IDs

| ID | Observed model family |
|---|---|
| `1c03` | Spaces / 480 Large family |
| `1c04` | Spaces / 480 Medium family |
| `1d00` | Plate Reverb Designer |
| `2d00` | Rhythm Delay |
| `2b00` | Saturator |
| `2a00` | Amp/Cab |
| `2400` | Shifter |
| `2300` | Dual Harmony |
| `1e00` | Tuner |
| `2800` | Gridder |

The editor exposes record offset, size, engine ID, stored preset label and same-engine byte differences for every RackUltra record. DSP writes remain disabled by default unless a field has an independently controlled mapping.

## 480 Large / Spaces (`1c03`) — verified writes

### Pre Delay

```text
state +30..31
payload +46..47
raw = 0x8000 + 16 * preDelay_ms
```

Controlled anchors:

| Pre Delay | Raw |
|---:|---:|
| `0 ms` | `80 00` |
| `85 ms` | `85 50` |
| `170 ms` | `8A A0` |

The writer is guarded to engine `1c03`, the observed 262-byte payload and the directly established `0…170 ms` range. The UI uses integer-millisecond values.

### Decay Time

```text
state +58..59
payload +74..75
```

Controlled anchors:

| Decay | Raw |
|---:|---:|
| `0.10 s` | `74 5E` |
| `≈2.45 s` | `94 B2` |
| `≈60 s` | `B5 07` |

The raw coordinate follows the same logarithmic-time family seen elsewhere in dLive processing, but only these three exact words are writable for now. Intermediate decay values are not guessed.

### Space / model selector

`state +29` / payload `+45` is a one-byte enum:

| Raw | Model |
|---:|---|
| `10` | Large Hall |
| `20` | Medium Hall |
| `30` | Small Hall |
| `40` | Room |
| `60` | Classic Large |
| `50` | Classic Medium |
| `70` | Classic Small |
| `80` | Classic Room |

### Low Cut and High Cut

Low Cut is `state +76..77` / payload `+92..93`:

- `20 Hz = 29 CB`
- `500 Hz = 7D 62`
- `1 kHz = 8F 63`

High Cut is `state +78..79` / payload `+94..95`:

- `1 kHz = 8F 63`
- `10 kHz = CB 2D`
- `20 kHz = DD 2E`

These fields use the familiar dLive logarithmic-frequency coordinate family, but exact scene-proven words are used for writes because displayed frequency labels are rounded.

### Width, Length, DS and Spread

Four independent sweeps prove the same linear coordinate:

```text
raw = 0x8000 + 16 * value
```

| Control | Offset | Verified range / anchors |
|---|---:|---|
| DS | `state +42..43` | 0, 50, 100 |
| Width | `state +60..61` | 1, 15, 30 |
| Length | `state +62..63` | 1, 20, 35 |
| Spread | `state +122..123` | 0, 50, 100 |

The editor permits continuous integer writes only inside the directly observed ranges.

### EL / LL / SL

The original batch isolated three distinct 16-bit controls. They are unnumbered faders on the console, so the editor treats their labels as control names rather than physical units.

| Control | Offset | Low | Mid / Medium | High |
|---|---:|---:|---:|---:|
| EL | `state +68..69` | `6C00` | `7646` | `8000` |
| LL | `state +70..71` | `6C00` | `767E` | `8000` |
| SL | `state +94..95` | `6C00` | `7B69` | `8A00` |

### Size Link and Echo toggles

All four controls use `10` for enabled and `00` for disabled:

| Control | Offset |
|---|---:|
| Echo section In/Out | `state +125` |
| Echo 1 On/Off | `state +127` |
| Echo 2 On/Off | `state +133` |
| Size Link On/Off | `state +147` |

## 480 Medium / Spaces (`1c04`) — verified writes

`ReverseEngineer2.tar.gz` starts with a clean `CTL 1` / `CTL 2` pair; the two StageBox scenes differ only in one scene-name byte. UFX1 is engine `1c04` with the same 262-byte AHFX payload shape.

### LL / EL / SL fader positions

The new file confirms that LL, EL and SL are **unnumbered faders** and supplies five physical-position anchors for each. Percentages in the editor mean fader position only.

| Control | Offset | Min | 25% | 50% | 75% | Max |
|---|---:|---:|---:|---:|---:|---:|
| LL | `state +70..71` | `6C00` | `7123` | `7582` | `79E1` | `8000` |
| EL | `state +68..69` | `6C00` | `7193` | `760E` | `7AA5` | `8000` |
| SL | `state +94..95` | `6C00` | `730D` | `7A97` | `817A` | `8A00` |

The curves are not treated as linear; only the five exact positions are writable.

### Echo taps (Echo 1–6)

The six Echoes-page taps are consecutive 4-byte blocks from `state +96`, in record order L1, L2, L3, R1, R2, R3. The On/Off bytes are a separate run from `state +127` with a 2-byte stride. Echo 1/2 keep their batch-5 names (L1/R1); Echo 3–6 are L2, R2, L3, R3.

| Echo | Tap | Time | Gain | On/Off |
|---:|---|---:|---:|---:|
| 1 | L1 | `+96..97` | `+98..99` | `+127` |
| 3 | L2 | `+100..101` | `+102..103` | `+129` |
| 5 | L3 | `+104..105` | `+106..107` | `+131` |
| 2 | R1 | `+108..109` | `+110..111` | `+133` |
| 4 | R2 | `+112..113` | `+114..115` | `+135` |
| 6 | R3 | `+116..117` | `+118..119` | `+137` |

Time: `raw = 0x8000 + 16 * time_ms` (1/16 ms resolution), proven on all six taps. The editor allows continuous integer writes inside `0…200 ms`.

Gain (called Feedback in batch 5): exact anchors `−40=5800`, `−20=6BFD`, `−10=75FD`, `0=8003`, `+10=8A00` on every tap. The stored words fit an offset-binary `/256 dB` coordinate, but typed round values carry small low-byte offsets, so gain stays exact-anchor-only.

On/Off: `10 = On`, `00 = Off`.

See [ReverseEngineer6](reverse-engineer-batch6.md) for the evidence.

### Remaining 480 Medium controls

Pre Delay, Density, Impact, Diffusion Early/Mid/Late, Direct Send, Width, Length, Modulation Rate/Depth and Stereo Spread are linear `raw = 0x8000 + 16 × value` words. Decay Time is the `time_log` coordinate. Output LF/HF Cut and Colour HF Tone/frequency use the PEQ log-frequency coordinate, and Colour gain is offset dB. Offsets, ranges and anchors are in [ReverseEngineer7](reverse-engineer-batch7.md).

### Damping LF / HF

Damping LF frequency is `state +46..47` with exact anchors `20, 50, 100, 200, 500, 1000 Hz`.

Damping HF type is `state +93`:

```text
10 = 6 dB
20 = 12 dB
30 = Shelf
```

Damping HF frequency is `state +64..65` with exact anchors from `40 Hz` through `20 kHz`.

Damping HF shelf gain is `state +66..67` with exact anchors `0, −6, −12, −15 dB`.

### Output HF

Output HF type is `state +83` using the same enum:

```text
10 = 6 dB
20 = 12 dB
30 = Shelf
```

Output HF shelf gain is `state +86..87` with exact anchors `0, −6, −12, −15 dB`.

## Guard policy

All RackUltra writes are guarded to the exact engine ID and observed payload shape. Values are continuous only when the controlled scenes establish an exact transform over a bounded range; otherwise the editor offers exact observed anchors/enums only. Every unmapped DSP byte and every other RackUltra engine remains preserved and read-only.

See [`reverse-engineer-batch4.md`](reverse-engineer-batch4.md) for the 480 Large batch-4 evidence and [`reverse-engineer-batch5.md`](reverse-engineer-batch5.md) for the new 480 Medium / Echo evidence.

## Plate Reverb Designer (`1d00`) — verified restricted writes

Same 262-byte AHFX payload as the Spaces engines, and the same coordinate systems throughout: linear `0x8000 + 16 × value`, the PEQ log-frequency table, and (for Decay) the Spaces `time_log` coordinate.

Pre Delay, Diffusion, Size, Shape, Modulation Speed/Depth, Width and Position (`+30`, `+36`, `+38`, `+40`, `+66`, `+68`, `+112`, `+120`) are continuous linear writes. Decay Time (`+56`) and Output LF/HF Cut (`+70`/`+72`) use exact anchors, identical in places to the Spaces anchor tables.

Echo taps 1–6 share the Spaces record order (L1, L2, L3, R1, R2, R3) at a 4-byte stride from `state +88`, with On/Off at a 2-byte stride from `+133`. L1 and R2 are independently proven; the rest follow by analogy. Echo gain is a clean continuous `raw = 0x8000 + round(dB × 256)` formula (no low-byte quantisation noise), verified `−39…+10 dB` — Director shows a non-numeric `Off` state below −39 dB. The Echoes section bypass (`+131`) uses an inverted convention: `00 = In`, `10 = Out`.

Type preset (`+85`) is a single enum byte selecting one of eleven Director library presets, but selecting one rewrites many other bytes at once, so it stays read-only.

See [RevEngPlate1](reverse-engineer-plate1.md) for the full evidence.

## Rhythm Delay (`2d00`) — verified restricted writes, Simple mode

Same 262-byte AHFX payload as the other RackUltra engines. Simple mode's Tempo, Feedback, Auto Pan, Drive, Amplitude, Global Tap and Groove (Dotted/Triplet, one shared enum) are writable.

Tempo introduces a new coordinate: `raw = round(60000 / BPM)`, verified `33…1000` BPM. Feedback is a clean continuous `raw = 0x8000 + round(dB × 256)`, verified `−39…+5 dB`, without the typed-entry quantisation noise seen on the Spaces engines. Auto Pan, Drive and Amplitude reuse the standard `0x8000 + 16 × value` percentage coordinate. Amplitude also proportionally scales several tap-gain bytes belonging to Advanced mode's pattern editor, which is not itself mapped.

See [RevEngRD1](reverse-engineer-rhythmdelay1.md) for the full evidence, an unexplained incidental byte, and the controls that were not swept (Type preset, Interval, Number of Repeats, and Advanced mode's variable-length tap pattern).
