# Input PEQ

**Status:** gain and frequency verified writable; Bell Width decoded with conservative canonical writer; state/filter-type bytes read-only.

Each input PEQ contains four 9-byte band records:

```text
GG GG  FF FF  WW WW  SS SS SS
│      │      │      └─ state/filter-type bytes
│      │      └──────── Bell Width
│      └─────────────── frequency
└────────────────────── gain
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

## Still unresolved

The final three bytes remain unmapped. Controlled Bell / shelf / HPF / LPF and PEQ In / Out scenes are the next useful experiment.
