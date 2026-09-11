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

For labelled objects the payload normally begins with a NUL-terminated printable ASCII label. This framing is confirmed across name/colour managers, surface banks, PEQ, HPF, LPF, compressors, Input Mixer and RackUltra records.

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

Each input PEQ contains four 9-byte band records followed by one trailing PEQ bypass byte:

```text
4 × band:
GG GG  FF FF  WW WW  TT  SS SS
│      │      │      │   └─ remaining state bytes — unknown/preserved
│      │      │      └──── filter type
│      │      └─────────── Bell Width
│      └────────────────── frequency
└───────────────────────── gain

then:
BB  global PEQ bypass
```

| Field | Offset | Type | Transform | Confidence | Write |
|---|---:|---|---|---|---|
| Gain | band `+0..1` | `int16_be` | `dB = raw / 256` | **Verified write** | **Yes** |
| Frequency | band `+2..3` | `uint16_be` | `raw = floor(4608 × log2(f/4))` | **Verified write** | **Yes** |
| Bell Width | band `+4..5` | `uint16_be` | high byte = A&H width index; low byte = internal fraction | **Partial write** | **Yes** |
| Filter type | band `+6` | `uint8 enum` | `00 Bell`, `01 Low Shelf`, `02 High Shelf`, `03 LPF`, `04 HPF` | **Verified write for Bands 1 & 4** | **Yes, restricted** |
| Remaining band state | band `+7..8` | 2 raw bytes | unknown | Unknown | No |
| PEQ In/Out | trailing byte after Band 4 | `uint8` | `00` In/active, `01` Out/bypassed | **Verified write** | **Yes** |

Controlled evidence covers gain `+1,+3,-3,-15,+15 dB`, frequency `100,200,500,1k,5k,10k Hz`, and Bell Width from `1.5` through `1/9`.

Band-type controlled scenes isolate only byte `+6`: Band 1 proves `04=HPF`, `00=PEQ/Bell`, `01=Low Shelf`; Band 4 proves `03=LPF`, `00=PEQ/Bell`, `02=High Shelf`. The editor exposes only those directly proven choices for those bands. Bands 2–3 type remains untouched.

PEQ bypass is independently isolated by controlled CH16 scenes `EQ In`, `EQ Out`, `EQ In 2`, `EQ Out 2`. The duplicate pair changes exactly one byte after the fixed scene-name/header region in the complete 412,047-byte StageBox scene: the single PEQ tail byte toggles `00 ↔ 01`.

See [`input-peq.md`](input-peq.md).

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

Evidence: the `Jaylen Aug 15` event show contains active and bypassed HPFs across multiple frequencies. ConsoleFlip independently rendered 108 input cards; **108/108 matched** native On/Off state and rounded decoded frequency. A later controlled CH16 experiment changed only byte `+3` across the labelled slope scenes `6db BW`, `12db BW`, `18db BW`, `24db BW` and `18db Bessel`.

See [`input-hpf.md`](input-hpf.md).

## Input LPF

Current-format record state after the label:

```text
04 00 00 FF FF SS SS SS SS SS BB
│        └─┬─┘                └─ bypass: 00 On, 01 Off
│          └──────────────────── frequency
└─────────────────────────────── LPF discriminator/type
```

| Field | State offset | Type | Transform | Confidence | Write |
|---|---:|---|---|---|---|
| Discriminator/type | `+0` | `uint8` | observed `04` | Decoded/parser guard | No |
| Preserved state | `+1..2` | 2 raw bytes | unknown | Located | No |
| Frequency | `+3..4` | `uint16_be` | same high-resolution log coordinate as PEQ/HPF; 20 kHz endpoint observed as `0xDD2E` | **Verified write** | **Yes** |
| Filter shape/state | `+5..9` | 5 raw bytes | not fully decoded; real-show variation observed | Located | No |
| Bypass | `+10` | `uint8` | `00` active/on, `01` bypassed/off | **Verified write** | **Yes** |

Controlled CH16 scenes cover Off, 20 kHz, 10 kHz, 5 kHz, 1 kHz, 500 Hz, 200 Hz, 50 Hz and 20 Hz. `LPF Off` versus `LPF On 20khz` changes only byte `+10` outside the scene label; adjacent frequency scenes change only bytes `+3..4` outside the label.

Interior frequency points follow:

```text
raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)
```

The observed 20 kHz maximum is `0xDD2E`, one code above the simple floor result, so the writer reproduces that endpoint explicitly. Bytes `+1..2` and `+5..9` are always preserved.

See [`input-lpf.md`](input-lpf.md).

## Input Mixer / channel state

Current-format `Input Mixer` records decompose as:

```text
Input Mixer\0
12-byte mixer header
128 × blockSize-byte input blocks

blockSize = (stateLength - 12) / 128
```

Observed block sizes include 169, 208 and 224 bytes. The fader and pan fields remain stable relative to the end of each block.

### Input fader

```text
offset = blockStart + blockSize - 84
raw    = int16_be
0x8001 -> -infinity
else dB = raw / 256
```

**Verified write.** Controlled CH16 clones at `-∞`, `-30`, `-20.3`, `-12.2`, `-5.9`, approximately `0`, `+5` and `+10 dB` changed only these two bytes. The editor currently writes the directly tested finite range `-30…+10 dB` plus `-∞`.

### Input pan

```text
offset = blockStart + blockSize - 82
0x00 = 100% L
0x25 = exact centre
0x4A = 100% R
pan_percent = (raw - 37) / 37 × 100
canonical raw = 37 + trunc(pan_percent × 37 / 100)
```

**Verified write.** Controlled CH16 pan clones changed only this byte: `100L=00`, `50L=13`, labelled near-centre `=24`, `50R=37`, `100R=4A`. The original Scene 10 centre is `25`, establishing the exact centre code. The writer uses `25` for exact centre and quantises percentages across the 0…74 coordinate.

### Event-config mono Aux sends

In the 169-byte event block, six mono Aux level fields are observed at `+12,+16,+20,+24,+28,+32`, each as `int16_be / 256 dB` with `0x8001 = -infinity`. These offsets are **configuration-specific evidence only** and are not writable until the variable bus-layout rule is solved.

See [`input-mixer.md`](input-mixer.md).

## Input compressor

Record: `Compressor, Input Channel NN`.

| Field | State offset | Type | Transform | Confidence | Write |
|---|---:|---|---|---|---|
| Processor/type byte | `+0` | `uint8` | observed `08` in verified current-format shape | Decoded/parser guard | No |
| Model / engine family | `+1` | `uint8 enum` | `00 Manual Peak`, `01 Manual RMS`, `02 Opto`, `03 16T`, `04 16VU`, `05 Ducker family`, `06 Peak Limiter 76`, `07 Mighty`, `08 Optronik`, `09 Bus`, `0A Compstortion` | **Decoded / read-only** | No |
| Enable | `+2` | `uint8` | `00` Off, `01` On | **Verified write** | **Yes** |
| Parallel Wet | `+3..4` | `int16_be` | `8001=-∞`; otherwise `dB=raw/256` | **Verified write, Manual RMS** | **Yes, guarded** |
| Parallel Dry | `+5..6` | `int16_be` | `8001=-∞`; otherwise `dB=raw/256` | **Verified write, Manual RMS** | **Yes, guarded** |
| Parallel On/Off | `+7` | `uint8` | `00 Off`, `01 On` | **Verified write, Manual RMS** | **Yes, guarded** |
| Common threshold | `+8..9` | `int16_be` | `threshold_dB=raw/256` | **Verified write, Manual RMS + Opto** | **Yes, guarded** |
| Attack | `+10..11` | `uint16_be` | logarithmic time coordinate; exact controlled anchors | **Verified restricted, Manual RMS** | **Yes, restricted** |
| Release | `+12..13` | `uint16_be` | same time coordinate as Attack; exact controlled anchors | **Verified restricted, Manual RMS** | **Yes, restricted** |
| Ratio | `+15` | `uint8 table` | `00=1:1,10=2:1,18=4:1,24=12:1,26=20:1,27=40:1,28=∞:1` | **Verified restricted, Manual RMS** | **Yes, restricted** |
| Makeup gain | `+16..17` | `int16_be` | `dB=raw/256` | **Verified write, Manual RMS** | **Yes, guarded** |
| Knee | `+18` | `uint8 enum` | `00 Normal`, `01 Soft` | **Verified write, Manual RMS** | **Yes, guarded** |
| Bus threshold | `+51` | `uint8` | `dB=raw/4-15` | **Verified write, Bus model** | **Yes, guarded** |
| SC low frequency | `+107..108` | `uint16_be` | exact controlled anchors `20 Hz…5 kHz` | **Verified restricted, Manual RMS** | **Yes, restricted** |
| SC low type | `+111` | `uint8 enum` | `04 Lo-Cut`, `06 Low Shelf` | **Verified write, Manual RMS** | **Yes, guarded** |
| SC high frequency | `+116..117` | `uint16_be` | exact controlled anchors `120 Hz…20 kHz` | **Verified restricted, Manual RMS** | **Yes, restricted** |
| SC high type | `+120` | `uint8 enum` | `03 Hi-Cut`, `07 High Shelf` | **Verified write, Manual RMS** | **Yes, guarded** |
| SC Filter In/Out | `+123` | `uint8` | `00 In`, `01 Out/bypassed` | **Verified write, Manual RMS** | **Yes, guarded** |
| SC BPF / scene-labelled notch | `+124` | `uint8` | `00 Off`, `01 On` | **Verified write, Manual RMS** | **Yes, guarded** |
| SC Source | unresolved / possibly separate source-selection structure | — | not varied in controlled scenes | **Unmapped** | No |
| Remaining parameters | other state bytes | mixed | unknown / preserved | Unknown | No |

Controlled model-selection scenes identify all model IDs above. Model selection remains read-only because switching models on the console also rewrites model-specific defaults/state; changing only `state +1` would create a hybrid state not generated by dLive.

Manual RMS and Opto independently prove the common `+8..9` threshold coordinate. Bus uses its separate one-byte threshold at `+51`. Manual RMS controlled clones then isolate Parallel, Ratio, Attack, Release, Makeup and Knee to the fields listed above.

The renamed `ReverseEngineer` controlled show isolates the sidechain filter tail. The low-frequency series changes only `+107..108` at `20,100,500,2000,5000 Hz`; low type changes only `+111` (`04→06`). The high-frequency series changes only `+116..117` at `120,200,500,1000,5000,10000,20000 Hz`; high type changes only `+120` (`03→07`). Two Filter In/Out pairs change only `+123`; the scene-labelled notch pair changes only `+124`.

The sidechain frequency words belong to the same logarithmic family seen elsewhere, but some rounded console labels land one raw code either side of a simple floor/round transform. Therefore the current writer emits only the **exact controlled anchors**, rather than extrapolating a continuous formula. Allen & Heath's published sidechain ranges independently match the controlled endpoints: Lo-Cut 20 Hz–5 kHz and Hi-Cut 120 Hz–20 kHz.

Sidechain Source was explicitly not included in this experiment and remains untouched.

See [`compressor-models.md`](compressor-models.md).

## RackUltra / AHFX

`AHFX Manager 01` through `AHFX Manager 08` use a 262-byte payload in the current reference, or 264 bytes including the two-byte frame prefix.

| Field | Offset | Confidence | Write |
|---|---|---|---|
| Payload length | frame `-2..-1` | Verified framing | No |
| Engine/model ID | signature `+0x13..+0x14` | Decoded | No |
| Preset label | signature `+0x15` | Decoded | No |
| DSP state | remainder | Unknown | No |

Observed model IDs include Spaces (`1c03`,`1c04`), Plate (`1d00`), Rhythm Delay (`2d00`), Saturator (`2b00`), Amp/Cab (`2a00`), Shifter (`2400`), Dual Harmony (`2300`), Tuner (`1e00`) and Gridder (`2800`).

## MixConfig.dat

The observed file is 13 bytes. Several count fields have plausible/high-confidence labels in the current parser, but not every byte has been independently proved across configurations. **No MixConfig field is writable.**

## Other located records

| Record | Status | Next useful controlled experiment |
|---|---|---|
| `Gate, Input Channel NN` | Located | threshold/depth/attack/hold/release/on-off |
| `Delay, Input Channel NN` | Located | 0 ms plus several known delays |
| `Stereo Image, Input Channel NN` | Located | width/stereo-image modes; ordinary input pan lives in `Input Mixer` |
| `Digital Attenuator Input Channel NN` | Located; variable historical lengths observed | current-scene digital trim/attenuation values |
| `Send Source Select ...` | Located | one Aux source/pre-post sequence |
| `Preamp Model ...` | Located | gain/pad/48V controlled scenes |
| RackUltra DSP | Located inside `AHFX Manager NN` | one-parameter clones for one engine |

## Promotion policy

A field becomes writable only when the project can define a narrow safe byte boundary and reproduce the intended value. Controlled one-parameter clones are preferred. Independent semantic evidence such as ConsoleFlip output or the dLive MIDI protocol is used as a cross-check, not as permission to guess unknown bytes.

The interactive site's source of truth is [`app-parameter-map.js`](../app-parameter-map.js) plus focused add-on registries and verified processing extensions.
