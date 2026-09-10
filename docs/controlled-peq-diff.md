# Controlled PEQ scene diff — dLive 2.12

Using the controlled `Hardcore Start` show where Scene 10 was cloned and only Input 16 PEQ gain was changed, the `Parametric EQ, Input Channel 16` record was isolated.

Scene labels / values:

- Scene 11: +1 dB
- Scene 12: +3 dB
- Scene 13: -3 dB
- Scene 14: -15 dB
- Scene 15: +15 dB

The record contains a band count byte (`0x04`) followed by four 9-byte band records.

For band 2 the 9-byte records observed were:

- +1 dB:  `01 03 65 97 0A 80 00 00 00`
- +3 dB:  `03 03 65 97 0A 80 00 00 00`
- -3 dB:  `FC FD 65 97 0A 80 00 00 00`
- -15 dB: `F1 00 65 97 0A 80 00 00 00`
- +15 dB: `0F 00 65 97 0A 80 00 00 00`

Only the first two bytes of the band record changed.

## Proven gain encoding

The first two bytes are a signed big-endian 16-bit fixed-point value with approximately 8 fractional bits:

`gain_dB = int16_be(raw[0:2]) / 256`

Observed examples:

| Displayed | Raw | Signed integer | Decoded |
|---:|---:|---:|---:|
| +1 dB | `0x0103` | 259 | +1.0117 dB |
| +3 dB | `0x0303` | 771 | +3.0117 dB |
| -3 dB | `0xFCFD` | -771 | -3.0117 dB |
| -15 dB | `0xF100` | -3840 | -15.0000 dB |
| +15 dB | `0x0F00` | 3840 | +15.0000 dB |

The slight offset at +1/+3 is likely the console/Director's internal quantisation or display rounding rather than a different scale.

Scene 10's original value was `0x05FA` = 1530 / 256 = **+5.9766 dB**, strongly consistent with a displayed +6 dB setting.

This mapping is high-confidence and suitable for guarded experimental writing.

## Remaining band bytes

The remaining bytes were constant in this controlled test:

`65 97 0A 80 00 00 00`

They are expected to encode frequency, width/Q, filter shape/type and/or band state, but those fields should remain read-only until controlled one-parameter diffs are available.

The ConsoleFlip HAR independently shows Input 16 with a strongly boosted EQ curve in the server-rendered preview, consistent with the +15 dB controlled state, providing a useful external sanity check that this record is indeed the active PEQ data.
