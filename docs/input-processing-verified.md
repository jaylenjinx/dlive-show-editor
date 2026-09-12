# Verified input processing additions — ReverseEngineer scene set

Primary target: dLive firmware 2.12. These mappings come from the September 2026 controlled `ReverseEngineer` show. `CTL A` and `CTL B` were byte-identical outside their scene labels, so the later one-parameter series have a clean save baseline.

## Gate — `Gate, Input Channel NN`

Current controlled state length: 19 bytes, discriminator `state +0 = 03`.

| Parameter | Offset | Encoding | Controlled evidence |
|---|---:|---|---|
| Threshold | `+2..3` | `int16_be / 256 dB` | −72, −40, −20, 0, +12 dB |
| Depth | `+8..9` | `int16_be / 256 dB` | 0, 10, 20, 40, 60 dB |
| Hold | `+10..11` | log-time coordinate | 10, 50, 100, 500 ms, 1 s, 5 s |
| Release | `+13..14` | log-time coordinate | 10, 50, 100, 500 ms, 1 s |
| Attack | `+15..16` | log-time coordinate | 50 µs, 100 µs, 1, 10, 100, 300 ms |
| In/Out | `+18` | `00 Off`, `01 On` | two duplicate Off/On pairs |

Time writers deliberately expose only exact observed anchors. Gate SC is not included here; a later controlled set will map it separately.

## Input Delay — `Delay, Input Channel NN`

Four-byte state:

```text
01 DD DD BB
```

- `state +1..2`: `delay_raw = round(delay_ms × 96)`, controlled from 0 through 340 ms.
- `state +3`: bypass, `00 = In`, `01 = Out`.

## Digital Trim and Polarity — `Digital Attenuator Input Channel NN`

Five-byte state, discriminator `01`.

- `state +1..2`: Trim, `int16_be / 256 dB`, controlled −24…+24 dB.
- `state +3`: Polarity, `00 = Normal`, `01 = Reverse`.

Polarity was tested on linked CH17/18. dLive wrote the same change into both records. The editor intentionally writes only the selected input record until stereo-link membership itself is decoded.

## Stereo Image — `Stereo Image Input Channel NN`

Four-byte state, discriminator `01`.

- `state +2`: width as direct integer percent `0…100`.
- `state +3`: mode enum:
  - `00 L/R`
  - `01 R/L`
  - `02 L Polarity`
  - `03 R Polarity`
  - `04 Mono`
  - `05 L/L`
  - `06 R/R`
  - `07 M/S`

The controlled CH17/18 stereo pair stored width/mode identically in both channel records.

## StageBox analogue socket state — `StageBox Analogue Input, Number NN`

Five-byte physical-I/O state, discriminator `01`.

- `state +1..2`: analogue gain, `int16_be / 256 dB`, controlled 5…60 dB.
- `state +3`: Pad, `00 Off`, `01 On`.
- `state +4`: 48 V, `00 Off`, `01 On`.

These are **physical StageBox socket** records. The editor therefore provides a separate socket selector instead of assuming Input CH N is patched to StageBox socket N.

## Input Mixer routing — exact controlled 208-byte configuration only

The new routing writer is intentionally guarded to:

```text
blockSize = 208
Input Mixer header = 03 04 09 04 04 06 06 02 02 01 01 01
```

Within each input block:

| Parameter | Offset | Encoding |
|---|---:|---|
| Mono Group 1 assignment | `+0` | `00 Off`, `01 On` |
| Stereo Group 1 assignment | `+4` | `00 Off`, `01 On` |
| Mono Aux 1 On/Off | `+29` | `00 Off`, `01 On` |
| Mono Aux 1 Pre/Post | `+30` | `01 Pre`, `00 Post` |
| Mono Aux 1 Level | `+31..32` | `8001 = −∞`, else `int16_be /256 dB`; finite controlled −30…+10 dB |
| Mono Aux 2 Level | `+35..36` | same level encoding; controlled −∞, −20, 0 dB |
| Stereo Aux 1 Level | `+75..76` | same level encoding; controlled −∞, −20, 0 dB |

No routing offsets are extrapolated to other MixConfigs yet.

## Visual editor

The Console UI now exposes **Preamp, Gate, PEQ, Compressor, Delay and Routing** pages. Every enabled control routes through the guarded writers above or the previously verified PEQ/compressor writers. Unsupported MixConfigs or record shapes remain disabled/read-only.
