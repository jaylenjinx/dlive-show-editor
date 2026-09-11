# Input high-pass filter (HPF)

> Status: **verified write for frequency, slope/type and bypass**. These notes are unofficial reverse-engineering observations for dLive 2.12.

A real event show (`Jaylen Aug 15`) plus an independent ConsoleFlip conversion preview resolved HPF frequency and bypass. A later controlled CH16 scene set then isolated the remaining user-facing slope/type byte.

```text
Highpass Filter Input Channel NN\0
03 FF FF SS BB
│  └─┬─┘ │  └─ bypass: 00 active/on, 01 bypassed/off
│    │   └──── slope / filter-type enum
│    └──────── frequency coordinate
└───────────── observed HPF discriminator/type
```

For channels 01–99 the payload is one byte shorter than channels 100–128 because the decimal channel label grows by one character. The state after the NUL-terminated label remains exactly five bytes.

## Field map

| State offset | Meaning | Type / transform | Confidence | Write |
|---:|---|---|---|---|
| `+0` | HPF discriminator/type | `uint8`, observed `03` | Decoded/parser guard | No |
| `+1..+2` | HPF frequency | `uint16_be`, logarithmic coordinate | **Verified write** | **Yes** |
| `+3` | HPF slope / filter type | `uint8` enum | **Verified write** | **Yes** |
| `+4` | HPF bypass | `00` active/on, `01` bypassed/off | **Verified write** | **Yes** |

## Frequency

HPF uses the same high-resolution coordinate already proven for input PEQ:

```text
raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)
```

Examples from the real event show include:

```text
46 96  -> about 61 Hz
53 96  -> 100 Hz
65 96  -> 200 Hz
67 96  -> about 216 Hz
```

The supported editor range is 20–2000 Hz, matching the dLive live-control range documented independently by `togrupe/dlive-midi-tools`.

## Slope / filter type

The controlled slope experiment used CH16 with the same HPF frequency and bypass state in each clone. Only state byte `+3` changed:

| Scene label | Byte `+3` |
|---|---:|
| `6db BW` | `05` |
| `12db BW` | `00` |
| `18db BW` | `01` |
| `24db BW` | `02` |
| `18db Bessel` | `03` |

No other HPF state byte changed in these scenes. `0x04` has not been identified and is deliberately left unmapped.

The editor therefore offers only the five observed slope/type values. If an input contains an unrecognised raw value, it is preserved exactly unless the user deliberately chooses one of the verified values.

## Bypass / enable

The final byte is independently resolved:

```text
00 = active / On
01 = bypassed / Off
```

The ConsoleFlip preview rendered 108 visible input-channel cards from the event show. All 108 agreed with both the native bypass byte and this project's decoded rounded HPF frequency.

## Writer boundary

The HPF writer changes only:

```text
state +1..+2   frequency
state +3       slope / filter type, known values only
state +4       bypass
```

It never modifies:

```text
state +0       discriminator/type
```

This narrow write boundary is intentional. Unknown slope/type codes remain preserved rather than guessed.
