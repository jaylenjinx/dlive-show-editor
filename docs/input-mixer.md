# Input Mixer channel state

> Status: **verified write for input fader and pan; decoded/read-only for compressor and Aux evidence**. Validated across multiple real dLive 2.12 mixer configurations and independently cross-checked against ConsoleFlip-rendered channel state.

The labelled `Input Mixer` record contains a small header followed by 128 equal-size per-input blocks:

```text
Input Mixer\0
12-byte mixer header
128 × blockSize-byte input blocks
```

The block size is not universal. It changes with mixer configuration and scene state.

Observed current-format examples include:

| Reference | Per-input block |
|---|---:|
| Jaylen Aug 15 | 169 bytes |
| Hardcore Start baseline | 224 bytes |
| Hardcore Start pan clones | 208 bytes |

For each current-format example:

```text
blockSize = (stateLength - 12) / 128
```

This exact decomposition is important because fields should be described relative to each channel block rather than as absolute offsets in the complete scene.

## Input fader — verified write

The input fader is stable relative to the end of each block:

```text
faderOffset = blockStart + blockSize - 84
raw         = int16_be

raw == -32767 (0x8001)  =>  -infinity
otherwise                 =>  fader_dB = raw / 256
```

A controlled CH16 experiment changed only these two fader bytes:

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

The editor treats input fader as **Verified Write** and changes only these two bytes. The finite writer is conservatively constrained to the directly tested range `-30…+10 dB`, plus the `0x8001` -infinity sentinel.

## Input pan — verified write

Pan is also stable relative to the block end:

```text
panOffset = blockStart + blockSize - 82
raw       = uint8

0x00 = 100% L
0x25 = exact centre
0x4A = 100% R

pan_percent = (raw - 37) / 37 × 100
```

The controlled CH16 pan scenes changed **only this one byte**:

| Scene label | Raw | Decoded by linear coordinate |
|---|---:|---:|
| `Pan 100L` | `00` | 100% L |
| `Pan 50L` | `13` (19) | about 49% L |
| `Pan 0` | `24` (36) | about 3% L / one raw step left of centre |
| `Pan 50R` | `37` (55) | about 49% R |
| `Pan 100R` | `4A` (74) | 100% R |

The original Scene 10 centre is `0x25` (37), which establishes the exact centre code independently. The labelled `Pan 0` controlled clone landed at `0x24`, consistent with the control being one raw step left of centre when stored.

The editor uses the canonical write mapping:

```text
raw = 37 + trunc(pan_percent × 37 / 100)
```

with input constrained to `-100…+100`, where negative is Left and positive is Right. This exactly reproduces the controlled ±50 and ±100 anchor values and writes `0x25` for exact centre.

Only the single pan byte is modified.

## Input compressor enable — read only

Inside `Compressor, Input Channel NN`:

```text
state +2 = 00  -> Off
state +2 = 01  -> On
```

This matched all 108 visible ConsoleFlip channel cards in the event-show preview. Other compressor parameters remain under investigation.

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

**These send offsets are configuration-specific evidence only.** A general bus-layout rule must be solved before Aux send editing is enabled.
