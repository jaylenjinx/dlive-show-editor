# ReverseEngineer controlled batch 3

Primary target: dLive 2.12. This batch extends the controlled-scene map with Gate sidechain, Manual Peak cross-checks, Opto model controls and the first writable RackUltra / AHFX parameters.

## Gate sidechain

### `SCF Gate, Input Channel NN`

Current controlled state is 23 bytes with discriminator `04`.

| Parameter | Offset | Encoding / controlled values |
|---|---:|---|
| Low-filter frequency | `+3..4` | 20=`29 CB`, 100=`53 96`, 500=`7D 62`, 1k=`8F 62`, 2k=`A1 62`, 5k=`B9 2D` |
| Low-filter type | `+7` | current `04`; located, not yet independently swept |
| High-filter frequency | `+12..13` | 120=`58 53`, 200=`65 96`, 500=`7D 62`, 1k=`8F 62`, 2k=`A1 62`, 5k=`B9 2D`, 10k=`CB 2D`, 20k=`DD 2D` |
| High-filter type | `+16` | current `03`; located, not yet independently swept |
| Filter In/Out | `+19` | duplicate controlled pairs `00 / 01 / 00 / 01`; `00=In`, `01=Out` |
| BPF/notch toggle | `+20` | located only |
| BPF/notch frequency | `+21..22` | located only; current `65 97` |

The exact Gate frequency words are retained separately from compressor-SC tables because endpoint rounding differs by one raw step in places (`5 kHz B9 2D`, `20 kHz DD 2D`).

### `Gate side chain source, Input Channel NN`

Three-byte state:

```text
01 TT II
```

Controlled CH16 selections match the compressor sidechain source scheme exactly:

- `01 01 0F` = Self / Input 16 on CH16
- `01 01 00` = Input 1
- `01 02 00` = Mono Group 1
- `01 03 00` = Stereo Group 1
- `01 04 00` = Mono Aux 1
- `01 05 00` = Stereo Aux 1
- `01 08 00` = Main
- `01 0A 00` = Mono Matrix 1
- `01 0B 00` = Stereo Matrix 1

The writer exposes only those exact tested type/index pairs.

## Manual Peak compressor cross-check

Model `00` confirms that several physical fields are shared with Manual RMS:

| Parameter | Offset | Controlled evidence / writer guard |
|---|---:|---|
| Threshold | `+8..9` | signed `/256 dB`; controlled −40 and 0 dB; writer −40…0 dB |
| Attack | `+10..11` | 30 µs=`22 61`, 100 ms=`74 5E`; exact anchors only |
| Release | `+12..13` | 50 ms=`6D 5C`, 1 s=`8B A3`; exact anchors only |
| Ratio | `+15` | 2:1=`10`, 20:1=`26`; exact choices only |
| Gain | `+16..17` | signed `/256 dB`; controlled 0 and +12 dB; writer 0…+12 dB |

The current Manual Peak default ratio raw `14` is deliberately left as an unmapped/read-only current value until it is independently identified.

## Opto compressor

Model `02` retains the already-verified common threshold field at `+8..9` and now has these independently isolated controls:

| Parameter | Offset | Encoding |
|---|---:|---|
| Ratio | `+15` | `00=1.2:1`, `0D=1.5:1`, `11=2:1`, `16=3:1`, `1C=4:1`, `25=6:1`, `28=10:1` |
| Gain | `+16..17` | signed `int16_be /256 dB`, writer −18…+18 dB |
| Attack | `+19` | `00 Fast`, `01 Medium`, `02 Slow` |
| Recovery | `+20` | `00 Fast`, `01 Medium`, `02 Slow` |
| Burn | `+21` | `00 Off`, `01 On` |
| Transient | `+22` | `00 Off`, `01 On` |

Two adjacent control scenes in this sequence produced no MixRack-processing change; they are not promoted as writable parameters.

## RackUltra — 480 Large / Spaces (`engine 1c03`)

The first writable AHFX DSP fields are isolated on UFX1. The record remains the normal 262-byte `AHFX Manager 01` payload.

### Pre Delay

```text
state +30..31
payload +46..47
raw = 0x8000 + 16 * preDelay_ms
```

Controlled anchors:

- 0 ms = `80 00`
- 85 ms = `85 50`
- 170 ms = `8A A0`

The editor exposes an integer-millisecond 0…170 ms writer guarded to engine `1c03` and the 262-byte AHFX shape.

### Decay Time

```text
state +58..59
payload +74..75
```

Controlled anchors:

- `74 5E` ≈ 0.10 s
- `94 B2` ≈ 2.45 s
- `B5 07` ≈ 60 s

The coordinate follows the familiar logarithmic time family, but the writer is intentionally restricted to these three exact words until more points are captured.

## Not present in this batch

A complete Bus model parameter sweep was not captured here; the previously verified Bus threshold remains the only Bus model-specific writer. Gate SC filter-type and BPF/notch fields are located but remain read-only pending independent sweeps.
