# Input Mixer channel state

> Status: **verified write for input fader, pan, compressor On/Off and Manual RMS compressor threshold; decoded/read-only for compressor model selection, Aux evidence and remaining compressor parameters**. Validated across multiple real dLive 2.12 mixer configurations and independently cross-checked against ConsoleFlip-rendered channel state.

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

## Input compressor enable — verified write

Inside `Compressor, Input Channel NN`, the On/Off state is:

```text
state +2 = 00  -> Off
state +2 = 01  -> On
```

The real event-show ConsoleFlip preview first matched this byte on all 108 visible input cards. A later controlled CH16 show then provided two On/Off pairs:

```text
Comp On
Comp Off
Comp 2 On
Comp 2 Off
```

The second pair is the decisive clean isolation: between `Comp 2 On` and `Comp 2 Off`, the only non-scene-label byte that changes in the complete StageBox scene is compressor state byte `+2`, toggling `01` to `00`.

The current writer is deliberately guarded to the verified dLive 2.12 input-compressor shape:

```text
state length after label = 127 bytes
state +0                = 0x08 processor discriminator
state +2                = 0x00 or 0x01 before writing
```

Only state byte `+2` is changed for On/Off.

## Compressor model enum — decoded / read-only

Controlled CH16 model scenes map `state +1`:

| Raw | Model |
|---:|---|
| `00` | Manual Peak |
| `01` | Manual RMS |
| `02` | Opto |
| `03` | 16T |
| `04` | 16VU |
| `05` | Ducker family |
| `06` | Peak Limiter 76 |
| `07` | Mighty |
| `08` | Optronik |
| `09` | Bus |
| `0A` | Compstortion |

`Ducker` and `Ducker Slow` both use `state +1 = 0x05`. Their records instead differ at state `+10..13` and `+25..26`, so Slow is represented as a parameter/default variant of the same engine family.

Model selection remains read-only because switching models on the console rewrites additional model-specific state. Writing only `state +1` would create a hybrid state that the console did not generate.

See [`compressor-models.md`](compressor-models.md).

## Input compressor threshold — verified write for Manual RMS

The controlled CH16 threshold scenes used **Manual RMS** (`state +1 = 0x01`) and isolate a two-byte field at:

```text
state +8..+9 = int16_be
threshold_dB = raw / 256
```

Controlled anchors:

| Scene label | Raw | Decoded |
|---|---:|---:|
| `Cmp Thresh -46` | `D2 00` | -46.00 dB |
| `Cmp Thresh -30` | `E1 FD` | about -30.01 dB |
| `Cmp Thresh -20` | `EB FD` | about -20.01 dB |
| `Cmp Thresh -10` | `F5 FD` | about -10.01 dB |
| `Cmp Thresh 0` | `00 03` | about +0.01 dB |
| `Cmp Thresh 10` | `0A 03` | about +10.01 dB |
| `Cmp Thresh 18` | `12 00` | +18.00 dB |

Every adjacent threshold pair changes only bytes `state +8..+9` outside scene-label bytes. The small `FD` / `03` fractional offsets are normal stored-control quantisation around the labelled integer values.

The canonical writer is:

```text
raw = round(threshold_dB * 256)
```

with the directly observed range constrained to `-46…+18 dB`.

The editor enables threshold writing only when all of these are true:

```text
state length = 127 bytes
state +0     = 0x08
state +1     = 0x01   Manual RMS / verified threshold model
state +2     = 0x00 or 0x01
```

The all-model scene set contains plausible threshold defaults at the same `+8..+9` location for other engines (including `0`, `-6`, `-7`, and `-14 dB` examples), supporting a shared threshold location. Other models nevertheless remain threshold read-only until independently tested.

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
