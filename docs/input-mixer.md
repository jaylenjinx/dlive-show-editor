# Input Mixer channel state

> Status: **verified write for input fader; decoded/read-only for pan and Aux evidence**. Validated across two different real dLive 2.12 mixer configurations and independently cross-checked against ConsoleFlip-rendered channel state.

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

The offset resolves to:

```text
169-byte block  -> block +85
224-byte block  -> block +140
```

A controlled CH16 experiment in the 224-byte Hardcore Start configuration changed only these two fader bytes:

| Scene label | Raw | Decoded |
|---|---:|---:|
| `-inf` | `80 01` | -infinity |
| `-30` | `E2 00` | -30.00 dB |
| `-20.3` | `EB AD` | about -20.32 dB |
| `-12.2` | `F3 BD` | about -12.26 dB |
| `-5.9` | `FA 17` | about -5.91 dB |
| `0` | `FF DF` | about -0.13 dB; physical fader did not land exactly at zero |
| `5` | `05 00` | +5.00 dB |
| `10` | `0A 00` | +10.00 dB |

This controlled result independently confirms both the signed `/256 dB` transform and the generic end-relative locator. The event show's ConsoleFlip-rendered fader heights also agree with the decoded values.

The editor now treats input fader as **Verified Write** and changes only these two bytes. The finite writer is conservatively constrained to the directly tested range `-30…+10 dB`, plus the `0x8001` -infinity sentinel.

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

Pan remains read-only pending isolated L/C/R scene clones.

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

## Next controlled experiment

The highest-value next set is input pan on one channel while leaving every other parameter untouched:

```text
PAN 100L
PAN 50L
PAN C
PAN 50R
PAN 100R
```

If only the mapped pan byte changes, pan can be promoted to verified write with the same end-relative structural guard as fader.
