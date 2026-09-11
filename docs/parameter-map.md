# dLive 2.12 parameter map

This is the canonical human-readable index for fields currently identified in the dLive show-file format. It is **unofficial reverse-engineering documentation**, not an Allen & Heath specification.

Confidence states:

- **Verified write** — encoding and a narrow safe write boundary are independently established.
- **Partial / conservative write** — semantics are understood but the writer deliberately emits only a canonical subset.
- **Decoded / read-only** — meaning is high-confidence, but generation remains disabled until isolated write tests are complete.
- **Located / unknown** — the record/field is identifiable but its transform or semantics remain incomplete.

Primary target: **dLive firmware 2.12**.

## Common framed-record rule

Many StageBox and Surface objects use:

```text
uint16_be payload_length
payload[payload_length]
```

For labelled objects the payload normally begins with a NUL-terminated printable ASCII label. This framing is confirmed across name/colour managers, surface banks, PEQ, HPF, compressors, Input Mixer and RackUltra records.

## Names and colours

| Field | Offset / shape | Type | Transform | Confidence | Write |
|---|---|---|---|---|---|
| Object name | N × 9-byte slots after manager signature/version | fixed ASCII[9] | max 8 printable ASCII bytes + NUL/padding | **Verified write** | **Yes** |
| Colour | immediately after all name slots | `uint8` | `0 Off, 1 Red, 2 Green, 3 Yellow, 4 Blue, 5 Magenta, 6 Cyan, 7 White` | **Verified write** | **Yes** |

Recognised managers include Inputs, mono/stereo Groups, mono/stereo Auxes, Mains, mono/stereo Matrices, RackExtra FX sends/returns, RackUltra FX sends/returns and DCAs.

## Surface bank assignments

Each C-class strip assignment is:

```text
[ strip_type, zero_based_object_index ]
```

Both bytes are **Verified Write**, based on factory C1500/C2500/C3500/S3000/S5000/S7000 strip-assignment scenes.

Verified type IDs include `00 Blank`, `01 Input`, `02 Mono Group`, `03 Stereo Group`, `04 Mono Aux`, `05 Stereo Aux`, `06 RackExtra FX Send`, `08 Main`, `0A Mono Matrix`, `0B Stereo Matrix`, `0C RackExtra FX Return`, `0D DCA`, `13 RackUltra FX Return`.

## Input PEQ

Each input has four 9-byte bands:

```text
GG GG  FF FF  WW WW  SS SS SS
│      │      │      └─ filter/state/type — unknown
│      │      └──────── Bell Width
│      └─────────────── frequency
└────────────────────── gain
```

| Field | Band offset | Type | Transform | Confidence | Write |
|---|---:|---|---|---|---|
| Gain | `+0..1` | `int16_be` | `dB = raw / 256` | **Verified write** | **Yes** |
| Frequency | `+2..3` | `uint16_be` | `raw = floor(4608 × log2(f/4))` | **Verified write** | **Yes** |
| Bell Width | `+4..5` | `uint16_be` | high byte = A&H width index; low byte = internal fraction | **Partial write** | **Yes** |
| Filter/state/type | `+6..8` | 3 raw bytes | unknown | Unknown | No |

Controlled evidence covers gain `+1,+3,-3,-15,+15 dB`, frequency `100,200,500,1k,5k,10k Hz`, and Bell Width from `1.5` through `1/9`.

## Input HPF

Current-format record state after the label:

```text
03 FF FF SS BB
│  └─┬─┘ │  └─ bypass: 00 On, 01 Off
│    │   └──── slope / filter-type enum
│    └──────── frequency
└───────────── HPF discriminator/type
```

| Field | State offset | Type | Transform | Confidence | Write |
|---|---:|---|---|---|---|
| Discriminator/type | `+0` | `uint8` | observed `03` | Decoded/parser guard | No |
| Frequency | `+1..2` | `uint16_be` | `raw = floor(4608 × log2(f/4))`; `f = 4 × 2^(raw/4608)` | **Verified write** | **Yes** |
| Slope / filter type | `+3` | `uint8 enum` | `05=6 dB BW`, `00=12 dB BW`, `01=18 dB BW`, `02=24 dB BW`, `03=18 dB Bessel`; `04` unmapped | **Verified write** | **Yes** |
| Bypass | `+4` | `uint8` | `00` active/on, `01` bypassed/off | **Verified write** | **Yes** |

Evidence: the `Jaylen Aug 15` event show contains active and bypassed HPFs across multiple frequencies. ConsoleFlip independently rendered 108 input cards; **108/108 matched** native On/Off state and rounded decoded frequency. A later controlled CH16 experiment changed only byte `+3` across the labelled slope scenes `6db BW`, `12db BW`, `18db BW`, `24db BW` and `18db Bessel`. The writer modifies only bytes `+1..2`, a known value at `+3`, and byte `+4`.

See [`input-hpf.md`](input-hpf.md).

## Input Mixer / channel state

Two different real dLive 2.12 mixer configurations reveal:

```text
Input Mixer\0
12-byte mixer header
128 × blockSize-byte input blocks

blockSize = (stateLength - 12) / 128
```

Observed block sizes:

| Show | blockSize |
|---|---:|
| Jaylen Aug 15 | 169 bytes |
| Hardcore Start | 224 bytes |

### Input fader

```text
offset = blockStart + blockSize - 84
raw    = int16_be
0x8001 -> -infinity
else dB = raw / 256
```

**Verified write.** Controlled CH16 clones at `-∞`, `-30`, `-20.3`, `-12.2`, `-5.9`, approximately `0`, `+5` and `+10 dB` changed only these two bytes. The end-relative locator also matches the 169-byte event configuration. The editor currently writes the directly tested finite range `-30…+10 dB` plus `-∞`.

### Input pan

```text
offset = blockStart + blockSize - 82
0x00 = 100% L
0x25 = centre
0x4A = 100% R
pan_percent = (raw - 37) / 37 × 100
```

**Decoded / read-only.** ConsoleFlip's dial angles agree with native values in the event show. Isolated pan clones are the next promotion test.

### Event-config mono Aux sends

In the 169-byte event block, six mono Aux level fields are observed at `+12,+16,+20,+24,+28,+32`, each as `int16_be / 256 dB` with `0x8001 = -infinity`. These offsets are **configuration-specific evidence only** and are not writable until the variable bus-layout rule is solved.

See [`input-mixer.md`](input-mixer.md).

## Input compressor

Record: `Compressor, Input Channel NN`.

| Field | State offset | Type | Transform | Confidence | Write |
|---|---:|---|---|---|---|
| Processor/type byte | `+0` | `uint8` | observed `08` in current event material | Located | No |
| Model/type candidate | `+1` | `uint8` | multiple values observed (`01`,`04`,`06`, ...) | Located | No |
| Enable | `+2` | `uint8` | `00` Off, `01` On | **Decoded / read-only** | No |
| Remaining parameters | `+3...` | mixed | unknown | Unknown | No |

ConsoleFlip's event preview matched compressor state byte `+2` on all 108 visible cards, including active CH14, CH16 and CH18.

## RackUltra / AHFX

`AHFX Manager 01` through `AHFX Manager 08` use a 262-byte payload in the current reference, or 264 bytes including the two-byte frame prefix.

| Field | Offset | Confidence | Write |
|---|---|---|---|
| Payload length | frame `-2..-1` | Verified framing | No |
| Engine/model ID | signature `+0x13..0x14` | Decoded | No |
| Preset label | signature `+0x15` | Decoded | No |
| DSP state | remainder | Unknown | No |

Observed model IDs include Spaces (`1c03`,`1c04`), Plate (`1d00`), Rhythm Delay (`2d00`), Saturator (`2b00`), Amp/Cab (`2a00`), Shifter (`2400`), Dual Harmony (`2300`), Tuner (`1e00`) and Gridder (`2800`).

## MixConfig.dat

The observed file is 13 bytes. Several count fields have plausible/high-confidence labels in the current parser, but not every byte has been independently proved across configurations. **No MixConfig field is writable.** As more mixer configurations are analysed, labels that cannot be independently reproduced should be downgraded rather than assumed.

## Other located records

| Record | Status | Next useful controlled experiment |
|---|---|---|
| `Gate, Input Channel NN` | Located | threshold/depth/attack/hold/release/on-off |
| `Delay, Input Channel NN` | Located | 0 ms plus several known delays |
| `Stereo Image, Input Channel NN` | Located | width/stereo-image modes; ordinary input pan is now known to live in `Input Mixer` |
| `Digital Attenuator Input Channel NN` | Located; variable historical lengths observed | current-scene digital trim/attenuation values |
| `Send Source Select ...` | Located | one Aux source/pre-post sequence |
| `Preamp Model ...` | Located | gain/pad/48V controlled scenes |
| RackUltra DSP | Located inside `AHFX Manager NN` | one-parameter clones for one engine |

## Promotion policy

A field becomes writable only when the project can define a narrow safe byte boundary and reproduce the intended value. Controlled one-parameter clones are preferred. Independent semantic evidence such as ConsoleFlip output or the dLive MIDI protocol is used as a cross-check, not as permission to guess unknown bytes.

The interactive site's source of truth is [`app-parameter-map.js`](../app-parameter-map.js) plus focused add-on registries such as [`app-parameter-map-hpf.js`](../app-parameter-map-hpf.js) and [`app-parameter-map-channel-state.js`](../app-parameter-map-channel-state.js).