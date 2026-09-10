# Input Mixer channel state

> Status: **decoded / read-only**. Validated across two different real dLive 2.12 mixer configurations and independently cross-checked against ConsoleFlip-rendered channel state.

The labelled `Input Mixer` record contains a small header followed by 128 equal-size per-input blocks:

```text
Input Mixer\0
12-byte mixer header
128 × blockSize-byte input blocks
```

The block size is not universal. It changes with mixer configuration.

| Reference show | Input Mixer payload | State after label | Per-input block |
|---|---:|---:|---:|
| Jaylen Aug 15 | 21656 bytes | 21644 bytes | 169 bytes |
| Hardcore Start | 28696 bytes | 28684 bytes | 224 bytes |

For both shows:

```text
blockSize = (stateLength - 12) / 128
```

This exact decomposition is important because it means fields should be described relative to each channel block rather than as absolute offsets in the complete scene.

## Input fader

The input fader is stable relative to the end of each block:

```text
faderOffset = blockStart + blockSize - 84
raw         = int16_be

raw == -32767 (0x8001)  =>  -infinity
otherwise                 =>  fader_dB = raw / 256
```

Observed examples from the event show:

| Raw | Decoded |
|---|---:|
| `00 00` | 0.00 dB |
| `04 B6` | +4.7109 dB |
| `EC 00` | -20.00 dB |
| `E0 10` | -31.9375 dB |
| `80 01` | -infinity |

ConsoleFlip's server-rendered fader heights agree with these decoded values. In the event preview, finite faders also follow the visual mapping approximately `(dB + 80) / 90 × 100%`, while `-infinity` renders at 0%.

The offset resolves to:

```text
169-byte block  -> block +85
224-byte block  -> block +140
```

The editor displays this value but does not write it yet.

## Input pan

Pan is also stable relative to the block end:

```text
panOffset = blockStart + blockSize - 82
raw       = uint8

0x00 = 100% L
0x25 = centre
0x4A = 100% R

pan_percent = (raw - 37) / 37 × 100
```

This mapping matches ConsoleFlip's rendered pan dial angles for centre, hard-left, hard-right and intermediate positions in the event show.

The offset resolves to:

```text
169-byte block  -> block +87
224-byte block  -> block +142
```

## Event-show mono Aux send evidence

The 169-byte `Jaylen Aug 15` block contains six mono Aux send level fields that match the ConsoleFlip preview:

| ConsoleFlip label order | Level offset in 169-byte block |
|---|---:|
| M1 | `+12..+13` |
| M3 | `+16..+17` |
| M4 | `+20..+21` |
| M5 | `+24..+25` |
| M2 | `+28..+29` |
| 6 | `+32..+33` |

Each level is a signed 16-bit big-endian value using the same convention as the fader:

```text
0x8001 -> -infinity
otherwise dB = int16_be / 256
```

Each apparent mono-Aux entry occupies four bytes and looks like:

```text
[flagA, flagB, level_hi, level_lo]
```

`flagB` varies and may represent source/pre-post/on state, but its meaning is not yet proved.

**These send offsets are configuration-specific evidence only.** The 224-byte Hardcore Start blocks contain additional bus-related state before the stable end-relative fader/pan region. A general bus-layout rule must be solved before Aux send editing is enabled.

## Write status

Fader and pan are independently decoded and cross-checked, but remain read-only because we have not yet produced isolated one-parameter scene clones. The next high-value controlled set is:

```text
FADER -inf
FADER -40
FADER -20
FADER -10
FADER 0
FADER +5
FADER +10

PAN L100
PAN L50
PAN C
PAN R50
PAN R100
```

If only the mapped fields change, those values can be promoted to verified write.
