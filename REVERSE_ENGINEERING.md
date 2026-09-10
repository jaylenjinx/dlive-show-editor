# Version 2 DSP research — 11 September 2026

Status: research preview; scalar DSP editing is not implemented or validated.

## Evidence from the supplied show

The supplied `Hardcore Start.tar.gz` contains 131 outer archive entries and ten StageBox scenes (1–8, 10, and current state 65535). Scene 10 is 413,883 bytes after decompression. Its current-state counterpart has the same length and differs at 24 byte positions near the beginning. None of the 826 candidate DSP records detected by this build differ between those two scenes. This pair cannot establish parameter encodings.

Small DSP records appear to have a two-byte big-endian length before an ASCII label, a zero byte followed by a version-like byte, and binary payload. The stored length spans the label and following bytes, excluding the length field itself. This is an observed framing hypothesis, not a complete file grammar. The scanner excludes oversized records and duplicate labels and never grants write permission from a DSP signature.

Examples in Scene 10 (decimal offsets; these are not portable constants):

| Label | Length-field offset | Stored length | Version-like byte | Payload offset |
|---|---:|---:|---:|---:|
| Highpass Filter Input Channel 01 | 236286 | 38 | 3 | 236322 |
| Gate, Input Channel 01 | 251989 | 42 | 3 | 252015 |
| Parametric EQ, Input Channel 01 | 278502 | 70 | 4 | 278537 |
| Compressor, Input Channel 01 | 287747 | 156 | 8 | 287779 |
| Parametric EQ, AHFX Channel 07 | 413132 | 69 | 4 | 413166 |
| Parametric EQ Send, AHFX Channel 07 | 413730 | 74 | 4 | 413769 |

The AHFX send and return EQs have distinct labels. FX strings include `snr bomb`. Finding that text alone does not locate or decode its reverb controls. Input name slots may contain nonzero bytes after the first NUL; treating all padding as zero would incorrectly reject this real show. RackUltra-era scenes have 14 name/colour managers; older scenes in this archive have 12.

## What the MIDI reference contributes

Reviewed source: [togrupe/dlive-midi-tools](https://github.com/togrupe/dlive-midi-tools), particularly [dliveConstants.py](https://github.com/togrupe/dlive-midi-tools/blob/main/src/dliveConstants.py), `src/parameters/channels/Name.py`, `Color.py`, and `Hpf.py`.

The implementation uses colour IDs 0–7 and an eight-character name limit, corroborating those aspects of the existing editor. It defines live MIDI parameter IDs (HPF frequency 0x30, HPF on 0x31, fader level 0x17), SysEx commands, and separate MIDI channel/address offsets. These are protocol identifiers, not scene-file byte offsets. No code from that project has been incorporated into this editor.

## Next controlled experiment

1. Duplicate the supplied show in Director Preview Mode and recall Scene 10.
2. Save a baseline copy. Pick one input channel and note the current PEQ band gain.
3. Change only that gain to a known value, store the same scene, then save a second show under a new name. Record channel, band, before/after values, firmware, and whether EQ is enabled.
4. Repeat with a third gain value and restore the original value in a fourth save. Repeated values separate the parameter bytes from incidental save metadata.
5. Compare by DSP record label and payload-relative offset in the Binary research tab; download the JSON evidence.
6. After an encoding is supported by multiple observations, implement bounded typed controls and round-trip tests. Reopen an edited copy in Director and verify the displayed value plus unrelated controls before calling that mapping validated.

Frequency, Q, filter slope, enable switches, compressor controls, and RackUltra algorithms need their own experiments. MIDI encodings and plausible float/integer interpretations are hypotheses until tied to saved values.

## Current validation

Eight Node tests pass, including optional private-sample checks across all ten StageBox scenes: parsing, metadata-preserving TAR rebuilding, allowed name changes, gzip round trips, rejection of malformed headers, duplicate paths, unknown writes, ambiguous managers, and label-based comparison across shifted offsets. This is software validation, not Director acceptance or hardware validation. The sample is deliberately absent from source and test fixtures.
