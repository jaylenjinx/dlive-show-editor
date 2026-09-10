# Input high-pass filter (HPF)

> Status: **high-confidence read-only**. These notes are unofficial reverse-engineering observations for the current dLive 2.12 reference set.

Each current input HPF record is framed normally and contains five bytes of state after the NUL-terminated label:

```text
Highpass Filter Input Channel NN\0
03 53 96 00 01
```

For channels 01–99 the observed payload length is 38 bytes; channels 100–128 are 39 bytes because the label itself is one character longer. The state length remains exactly five bytes.

## Candidate field map

| State offset | Bytes in reference | Candidate meaning | Confidence | Write |
|---:|---|---|---|---|
| `+0` | `03` | HPF discriminator/type | Decoded/parser guard | No |
| `+1..+2` | `53 96` | HPF frequency | High-confidence decoded | No |
| `+3` | `00` | HPF enable/bypass | Partial: `00 = Off` supported | No |
| `+4` | `01` | trailing state/version byte | Unknown | No |

## Frequency

`0x5396 = 21398`. Applying the same high-resolution logarithmic coordinate proved by the PEQ experiments gives exactly 100 Hz:

```text
raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)
```

For the observed value:

```text
f = 4 × 2^(21398 / 4608) ≈ 100 Hz
```

This is independently consistent with Tobias Grupe's `dlive-midi-tools`, which documents HPF as an NRPN-controlled logarithmic 20–2000 Hz parameter. Its 7-bit MIDI conversion:

```text
int(27.58 × ln(f) - 82.622)
```

is effectively the low-resolution normalisation of the same logarithmic range. For example, the high-resolution coordinate maps 20 Hz to approximately MIDI 0, 100 Hz to MIDI 44, and 2000 Hz to MIDI 127.

## Enable candidate

The byte at state offset `+3` is `00` on every input channel in the current reference file. The captured ConsoleFlip preview independently reports those same channels as **HPF Off**.

That is strong evidence for:

```text
00 = Off
```

The On representation has not yet been observed in a controlled scene, so the editor does not assume `01`, `7F`, or any other value.

## Why writes are still disabled

The frequency interpretation has two independent pieces of evidence, but we have not yet observed isolated show-file changes caused by moving HPF frequency. Likewise, we have only observed the Off state for the candidate enable byte.

The required controlled dLive 2.12 scenes are:

```text
HPF OFF 100
HPF ON 100
HPF ON 20
HPF ON 50
HPF ON 200
HPF ON 500
HPF ON 1000
HPF ON 2000
```

Use one input channel, clone the same baseline scene each time, and change only HPF. If those diffs isolate to bytes `+1..+3` as expected, frequency and enable can be promoted to **Verified Write**.
