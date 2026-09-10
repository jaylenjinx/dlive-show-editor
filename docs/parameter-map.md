# dLive 2.12 parameter map

This is the canonical working index for fields currently identified in the dLive show-file format. It is **unofficial reverse-engineering documentation**, not an Allen & Heath specification.

The map deliberately separates four states:

- **Verified write** — isolated/reproduced from controlled examples and enabled in the editor.
- **Partial / conservative write** — semantics are understood, but the writer intentionally emits only a conservative canonical form.
- **Decoded / read-only** — meaning is high-confidence, but the project does not yet generate the field.
- **Located / unknown** — the record is identifiable, but parameter offsets or transforms are still unresolved.

The current primary target is **dLive firmware 2.12**. Historical/factory scenes are useful evidence but are not assumed to share every current-state field layout.

## Show/container fields

| Record | Field | Offset | Type | Transform | Confidence | Write | Evidence |
|---|---|---:|---|---|---|---|---|
| `Show/Version.dat` | Show format version | whole file | ASCII integer | `parseInt(text)` | Decoded | No | Reference shows; current target reports format `14` |
| `Show/MixConfig/MixConfig.dat` | Record/version | `0` | `uint8` | observed `01` | Decoded | No | Reference MixConfig |
| `Show/MixConfig/MixConfig.dat` | Mono Group count | `1` | `uint8` | direct count | Decoded | No | Agrees with Scene 10 mixer config |
| `Show/MixConfig/MixConfig.dat` | Stereo Group count | `2` | `uint8` | direct count | Decoded | No | Agrees with Scene 10 mixer config |
| `Show/MixConfig/MixConfig.dat` | Mono RackExtra FX send count | `3` | `uint8` | direct count | Decoded | No | Global config + mixer structures |
| `Show/MixConfig/MixConfig.dat` | Stereo RackExtra FX send count | `4` | `uint8` | direct count | Decoded | No | Global config + mixer structures |
| `Show/MixConfig/MixConfig.dat` | Mono Aux count | `5` | `uint8` | direct count | Decoded | No | Global config + Scene 10 buses |
| `Show/MixConfig/MixConfig.dat` | Stereo Aux count | `6` | `uint8` | direct count | Decoded | No | Global config + Scene 10 buses |
| `Show/MixConfig/MixConfig.dat` | Unknown | `7` | `uint8` | unknown | Unknown | No | Observed only |
| `Show/MixConfig/MixConfig.dat` | Unknown | `8` | `uint8` | unknown | Unknown | No | Observed only |
| `Show/MixConfig/MixConfig.dat` | Mono Matrix count | `9` | `uint8` | direct count | Decoded | No | Global config + Scene 10 matrices |
| `Show/MixConfig/MixConfig.dat` | Stereo Matrix count | `10` | `uint8` | direct count | Decoded | No | Global config + Scene 10 matrices |
| `Show/MixConfig/MixConfig.dat` | Unknown | `11` | `uint8` | unknown | Unknown | No | Observed only |
| `Show/MixConfig/MixConfig.dat` | Unknown | `12` | `uint8` | unknown | Unknown | No | Observed only |

## Common framed-record rule

A broad class of StageBox and Surface objects follows:

```text
uint16_be payload_length
payload[payload_length]
```

For labelled objects, the payload generally starts with a NUL-terminated printable ASCII label. This framing is validated across name/colour managers, surface banks, PEQ, compressor and RackUltra records.

## Name / colour managers

Pattern:

```text
uint16_be payload_length
ASCII signature
00 01
N × 9-byte names
N × 1-byte colours
```

| Field | Offset | Type | Transform | Confidence | Write | Evidence |
|---|---|---|---|---|---|---|
| Object name | after signature + 2; one 9-byte slot/object | fixed ASCII[9] | max 8 printable ASCII bytes + NUL/padding | **Verified write** | **Yes** | Scene 10 + successful archive round trip |
| Colour | immediately after all name slots | `uint8` | `0 Off, 1 Red, 2 Green, 3 Yellow, 4 Blue, 5 Magenta, 6 Cyan, 7 White` | **Verified write** | **Yes** | Show binary + independent MIDI colour constants |

Recognised managers currently include Inputs, mono/stereo Groups, mono/stereo Auxes, Mains, mono/stereo Matrices, RackExtra FX sends/returns, RackUltra FX sends/returns and DCAs.

## Surface bank assignments

Records:

- `Channel Left Bank Switcher`
- `Channel Middle Bank Switcher`
- `Channel Right Bank Switcher`

Each strip assignment is two bytes:

```text
[ strip_type, zero_based_object_index ]
```

| Field | Offset | Type | Confidence | Write | Evidence |
|---|---|---|---|---|---|
| Strip type | assignment byte `0` | `uint8 enum` | **Verified write** | **Yes** | Factory C1500/C2500/C3500/S3000/S5000/S7000 Strip Assign scenes |
| Object index | assignment byte `1` | `uint8` | **Verified write** | **Yes** | Factory strip scenes + Scene 10 C1500 layout |

Verified strip type IDs:

| Hex | Object |
|---:|---|
| `00` | Blank |
| `01` | Input |
| `02` | Mono Group |
| `03` | Stereo Group |
| `04` | Mono Aux |
| `05` | Stereo Aux |
| `06` | RackExtra FX Send |
| `08` | Main |
| `0A` | Mono Matrix |
| `0B` | Stereo Matrix |
| `0C` | RackExtra FX Return |
| `0D` | DCA |
| `13` | RackUltra FX Return |

Unknown strip type values are preserved and not offered as writable choices.

## Input PEQ

Record pattern:

```text
Parametric EQ, Input Channel NN\0
04
[band 1: 9 bytes]
[band 2: 9 bytes]
[band 3: 9 bytes]
[band 4: 9 bytes]
[tail]
```

Each band:

```text
GG GG  FF FF  WW WW  SS SS SS
│      │      │      └─ filter/state/type (unmapped)
│      │      └──────── Bell Width
│      └─────────────── frequency
└────────────────────── gain
```

| Field | Band-relative offset | Type | Transform | Confidence | Write | Evidence |
|---|---:|---|---|---|---|---|
| Gain | `+0..1` | signed `int16_be` | `gain_dB = raw / 256` | **Verified write** | **Yes** | Controlled `+1,+3,-3,-15,+15 dB` scenes |
| Frequency | `+2..3` | `uint16_be` | `raw = floor(4608 × log2(f/4))` | **Verified write** | **Yes** | Controlled `100,200,500,1k,5k,10k Hz` scenes; exact fit |
| Bell Width | `+4..5` | `uint16_be` | high byte = A&H width index; low byte = fractional internal precision | **Partial / conservative write** | **Yes** | Controlled width sequence from `1.5` to `1/9` |
| Filter/state/type | `+6..8` | 3 raw bytes | unknown | Unknown | No | Stable across gain/frequency/width experiments |

### PEQ gain

```text
gain_dB = int16_be(raw) / 256
raw     = round(gain_dB × 256)
```

Examples:

```text
06 00 -> +6.0 dB
F1 00 -> -15.0 dB
```

### PEQ frequency

```text
raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)
```

Examples:

```text
100 Hz  -> 0x5396
200 Hz  -> 0x6596
1 kHz   -> 0x8F62
```

### PEQ Bell Width

The controlled data follows the Allen & Heath Bell Width index in the high byte. The low byte carries finer internal position/precision. The current writer preserves untouched raw values exactly; deliberate width edits write the canonical `index << 8` representation.

The final three band bytes remain the highest-value PEQ experiment: controlled Bell/Shelf/HPF/LPF and PEQ In/Out scenes should identify filter type and bypass/state.

## RackUltra / AHFX

Records are labelled `AHFX Manager 01` through `AHFX Manager 08`.

In the current 2.12 reference show:

```text
payload length = 0x0106 = 262 bytes
total framed record = 264 bytes
```

| Field | Offset | Type | Confidence | Write | Evidence |
|---|---:|---|---|---|---|
| Payload length | frame `-2..-1` | `uint16_be` | Verified framing | No | Eight consecutive managers |
| Engine/model ID | signature `+0x13..0x14` | two raw bytes | Decoded | No | Scene 1 reset vs Scene 10 same-engine comparisons |
| Preset label | signature `+0x15` | NUL-terminated ASCII in fixed region | Decoded | No | Scene 1 / Scene 10 labels |
| DSP parameter state | remainder | mixed | Unknown | No | Localised byte differences exist but transforms are not proven |

Observed model IDs:

| ID | Model family observed |
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

No RackUltra DSP parameter is writable yet. One-parameter controlled clones of a single engine are required before promotion.

## Located processing/routing records still awaiting field maps

| Record pattern | Suspected/known semantic area | Payload status | Write | Next experiment |
|---|---|---|---|---|
| `Highpass Filter Input Channel NN` | HPF frequency/on | framed; offsets unknown | No | HPF on/off + several frequencies |
| `Compressor, Input Channel NN` | Compressor | 156-byte payload observed in current reference | No | threshold, ratio, attack, release, knee, makeup, on/off |
| `Gate, Input Channel NN` | Gate | framed | No | threshold/depth/attack/hold/release/on-off |
| `Delay, Input Channel NN` | Input delay | framed | No | 0 ms plus several known delays |
| `Stereo Image, Input Channel NN` | pan/width/stereo image | framed | No | pan L/C/R; stereo width variants |
| `Digital Attenuator Input Channel NN` | digital attenuation state | **variable length observed** | No | controlled current-scene level/trim experiment |
| `Send Source Select ...` | send source / pre-post | framed | No | one aux source pre/post sequence |
| `Input Mixer` | mix assignments/levels | framed, config dependent | No | fader/pan/send controlled scenes |
| `Preamp Model ...` | preamp state/model | framed | No | gain/pad/48V controlled scenes |

### Important serialization warning

`Digital Attenuator Input Channel NN` has been observed with different serialized lengths between current and factory/reset material. This is evidence that identical labels do **not** necessarily imply one universal fixed C-style structure. The project therefore treats current dLive 2.12 scene clones as the primary parameter evidence.

## Evidence and promotion policy

A writable field should ideally satisfy all of the following:

1. The same parameter is changed in several controlled clones.
2. Only the expected local bytes change apart from scene metadata.
3. The numeric transform is repeatable across the parameter range.
4. Record boundaries remain valid after writing.
5. Exported shows survive TAR/GZIP round-trip validation.
6. Where available, an independent semantic reference (for example dLive MIDI) agrees with the interpretation.

The JavaScript source of truth used by the site's interactive table is [`app-parameter-map.js`](../app-parameter-map.js).