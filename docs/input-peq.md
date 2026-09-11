# Input PEQ

**Status:** gain and frequency verified writable; Bell Width decoded with conservative canonical writer; Band 1 and Band 4 filter type verified writable; final two state bytes remain read-only.

Each input PEQ contains four 9-byte band records:

```text
GG GG  FF FF  WW WW  TT  SS SS
│      │      │      │   └─ remaining state bytes
│      │      │      └──── filter type
│      │      └─────────── Bell Width
│      └────────────────── frequency
└───────────────────────── gain
```

## Gain

Gain is signed big-endian 8.8 fixed point:

```text
gain_dB = int16_be(raw) / 256
raw     = round(gain_dB * 256)
```

Examples:

- `06 00` → +6.0 dB
- `F1 00` → −15.0 dB

Controlled scenes at +1, +3, −3, −15 and +15 dB isolated only these two bytes (plus the scene label).

## Frequency

Controlled scenes at 100 Hz, 200 Hz, 500 Hz, 1 kHz, 5 kHz and 10 kHz matched this transform exactly:

```text
raw = floor(4608 * log2(f / 4))
f   = 4 * 2^(raw / 4608)
```

Examples:

| Frequency | Raw |
|---:|---:|
| 100 Hz | `0x5396` |
| 200 Hz | `0x6596` |
| 500 Hz | `0x7D62` |
| 1 kHz | `0x8F62` |
| 5 kHz | `0xB92D` |
| 10 kHz | `0xCB2D` |

## Bell Width

The high byte maps to Allen & Heath's Bell Width index. The low byte carries additional internal precision. Untouched values are preserved exactly. When a user deliberately selects a new width, the current editor writes the canonical index in the high byte and `00` in the fractional byte.

## Filter type byte

A later controlled CH16 scene set isolates band offset `+6` as the filter-type enum.

### Band 1

| Scene | Raw type byte |
|---|---:|
| `EQ Band 1 HPF` | `04` |
| `EQ Band 1 PEQ` | `00` |
| `EQ Band 1 Lo-Shelf` | `01` |

`HPF → PEQ` and `PEQ → Low Shelf` each change exactly this one PEQ byte outside the scene label.

### Band 4

| Scene | Raw type byte |
|---|---:|
| `EQ Band 4 LPF` | `03` |
| `EQ Band 4 PEQ` | `00` |
| `EQ Band 4 Hi-Shelf` | `02` |

`LPF → PEQ` and `PEQ → High Shelf` each change exactly this one PEQ byte outside the scene label.

The observed enum is therefore:

```text
00 = PEQ / Bell
01 = Low Shelf
02 = High Shelf
03 = LPF
04 = HPF
```

The editor deliberately limits choices by band to the combinations directly proven by the console UI and controlled scenes:

```text
Band 1: HPF / PEQ-Bell / Low Shelf
Band 4: LPF / PEQ-Bell / High Shelf
```

No type writer is enabled for Bands 2 and 3.

## Remaining state bytes

Band offsets `+7..8` remain unresolved. They stayed unchanged across gain, frequency, Bell Width and edge-band filter-type experiments and are preserved exactly by the editor.
