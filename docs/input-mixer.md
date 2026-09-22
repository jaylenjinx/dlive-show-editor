# Input Mixer channel state

> Status: **verified write for input fader, pan, sends (level/On/Pre), group assigns, compressor On/Off and Manual RMS compressor threshold; decoded/read-only for compressor model selection, Aux evidence and remaining compressor parameters**. Validated across multiple real dLive 2.12 mixer configurations and independently cross-checked against ConsoleFlip-rendered channel state.

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

## Sends and group assigns — verified write (ReverseEngineer9)

`ReverseEngineer9.tar.gz`, scenes 401–481, was generated by automating dLive Director 2.12 on input 13. The mixer config was 4 mono + 9 stereo groups, 4 + 4 FX, 6 + 6 Aux, 2 + 2 Matrix and 8 UFX, giving a 208-byte block.

- Each of the 32 sends was raised from −∞ to 0 dB in its own scene.
- Each of the 13 group assigns was toggled in its own scene.
- Aux 1 and St Aux 1 were swept through −39, −30, −20, −10, −5, 0, +5 and +10 dB.
- On/Off and Pre/Post were toggled twice each on FX 1, Aux 1, St Aux 1, UFX 1 and Mtx 1.

Every adjacent pair changes only the target field.

The per-input block layout is fully determined by the 12-byte mixer header:

```text
header = [version, monoGrp, stGrp, monoFX, stFX, monoAux, stAux, monoMtx, stMtx, ?, ?, ?]

block:
  monoGrp + stGrp assign bytes          00 Off / 01 Assigned (mono groups, then stereo groups)
  send entries, in this order:
    mono FX, mono Aux, stereo FX, stereo Aux, mono Matrix, stereo Matrix
      mono entry   = [on, pre, level_hi, level_lo]          4 bytes
      stereo entry = [on, pre, level_hi, level_lo, pan]     5 bytes
  47-byte channel section                  fader at +3, pan at +5
  8 × stereo UFX send entries              header version ≥ 3 only

blockSize = groups + 4 × (mono sends) + 5 × (stereo sends) + 47 + (40 if version ≥ 3)
```

- `on`: `01` On, `00` Off.
- `pre`: `01` Pre, `00` Post.
- `level`: `int16_be / 256 dB`, `8001` = −∞. Director's range is −39…+10 dB; any lower typed value becomes −∞.
- `pan` (stereo entries only): the same `00…25…4A` coordinate as input pan. See the RevEng10 section below.

The 47-byte section starts with the **Main send**:

- `+0`: On (`01`/`00`).
- `+1..2`: always `01 01`; unmapped.
- `+3..4`: level. This is the verified input fader at `blockSize − 84`.
- `+5`: pan. This is the verified input pan at `blockSize − 82`.

In other words, an input's fader and pan are its Main send. The block size does not depend on the Main type.

Measured offsets for the ReverseEngineer9 config:

| Field | Offsets |
|---|---|
| Grp 1–4 / St Grp 1–9 assign | `+0..3` / `+4..12` |
| FX 1–4 | `+13`, `+17`, `+21`, `+25` |
| Aux 1–6 | `+29`, `+33`, `+37`, `+41`, `+45`, `+49` |
| St FX 1–4 | `+53`, `+58`, `+63`, `+68` |
| St Aux 1–6 | `+73`, `+78`, `+83`, `+88`, `+93`, `+98` |
| Mtx 1–2 / St Mtx 1–2 | `+103`, `+107` / `+111`, `+116` |
| UFX 1–8 | `+168`, `+173` … `+203` |

Offsets are entry starts; the level is at entry `+2`.

Typed level anchors, identical on Aux 1 and St Aux 1:

| dB | −39 | −30 | −20 | −10 | −5 | 0 | +5 | +10 |
|---|---|---|---|---|---|---|---|---|
| Raw | `D8FD` | `E1FD` | `EBFD` | `F5FD` | `FAFD` | `0003` | `0503` | `0A00` |

These carry the usual ±3-code typed-entry offset. The editor writes `round(dB × 256)`, the same convention as the verified fader writer.

**Generality.** The layout rule reproduces the block size of every Input Mixer record in every available show, across five header variants:

- `03 04 09 04 04 06 06 02 02 …` (208 bytes)
- `03 04 09 08 04 06 06 02 02 …` (224 bytes)
- `03 04 04 08 00 08 08 04 04 …` (235 bytes)
- the legacy `02 …` header (195 bytes = 235 − 40, no UFX sends)

All 195,456 channel blocks parse as valid entries: On/Pre bytes are 0/1, levels are in range or −∞, pan ≤ `4A`, and the fader is in range. The 224-byte config also fixes the header order, because mono and stereo FX counts only reproduce the size when read as `[monoFX, stFX]`.

The editor enables send and assign writes only when the header reproduces both the block size and the verified fader offset.

## Stereo send pan — verified write (RevEng10)

`RevEng10.tar.gz`, scenes 351–372. On input 13, one send of each stereo type (St Aux 1, St FX 1, St Mtx 1, UFX 1) was dragged hard L, hard R, to centre and to about ±50 %. Every adjacent pair changes only that entry's pan byte.

| Position | Raw |
|---|---:|
| hard L | `00` |
| ≈ 50 % L | `12` |
| centre (by eye) | `26` |
| ≈ 50 % R | `39` |
| hard R | `4A` |

Every untouched stereo send stores the default centre `25`. Director shows no numeric pan for sends, so centring by eye landed one step right (`26`). This is the verified input-pan coordinate, so the editor reuses the input-pan writer.

## Second mixer config — RevEngCfgA

Director's *MixRack › Mixer Config* was set to all-distinct counts:

- mono Group/FX/Aux/Matrix = 2/6/4/8;
- stereo = 7/3/5/1;
- PAFL 2, Main LR.

Mono counts can only be even.

The header became `03 02 07 06 03 04 05 08 01 01 01 02`. The rule predicts a 213-byte block (`9 + 4×18 + 5×9 + 47 + 40`), and that is exactly the size. Scenes 373–389 then set the last send of every type and toggled Grp 2, St Grp 7 and Main:

| Field | Predicted | Measured |
|---|---:|---:|
| Grp 2 / St Grp 7 assign | `+1` / `+8` | `+1` / `+8` |
| FX 6 level | `+31` | `+31` |
| Aux 4 level | `+47` | `+47` |
| St FX 3 level | `+61` | `+61` |
| St Aux 5 level | `+86` | `+86` |
| Mtx 8 level | `+119` | `+119` |
| St Mtx 1 level | `+123` | `+123` |
| Main On / level / pan | `+126` / `+129` / `+131` | same |
| UFX 8 level | `+210` | `+210` |

Header bytes `[9..11]` are the Main type, Main strip mode and PAFL count, identical to `MixConfig.dat` bytes 8, 7 and 11 (see [KNOWN_FORMAT.md](../KNOWN_FORMAT.md#6-mixconfigdat--decoded-read-only)). Across all 13 header variants now available, every Input Mixer record matches the size rule and parses as valid entries.

## Earlier event-show mono Aux evidence

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

This matches the general rule above. `flagA`/`flagB` are the On and Pre bytes. With 10 group bytes and no mono FX, Aux 1's level lands at `+12`.
