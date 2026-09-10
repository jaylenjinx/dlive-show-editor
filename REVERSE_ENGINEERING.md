# Version 2 DSP research — 11 September 2026

Status: research preview; a narrowly calibrated Input 16 / PEQ band 2 gain control supports the measured values 0, −8.1 and +6.0 dB. Continuous DSP editing remains unvalidated.

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

## Controlled Input 16 gain observation

The second user-provided save changed Input 16 PEQ band 2 from 0 dB to −8.1 dB. Scene 10 retained its 413,883-byte length. Exactly two bytes changed, at offsets `0x4444a` and `0x4444b`: `00 00` → `f7 ea`. They lie at payload-relative offset 9 in the uniquely labelled `Parametric EQ, Input Channel 16` record (length-field offset `0x4441e`, stored length 70, version-like byte 4).

Interpreted as a signed big-endian 16-bit integer, `f7ea` is −2070. Dividing by 256 yields −8.0859375, which rounds to the reported one-decimal display. That is compatible with a fixed-point hypothesis, but it is not enough to establish the actual gain conversion or its rounding rules. The editor uses an explicit lookup for the two observed values and does not encode arbitrary dB values.

The DSP editing tab exposes only this specific channel/band. It checks the complete record framing and all other payload bytes against the calibration record; altered context, unknown gain bytes, duplicate signatures, and truncation disable the control. Only its two gain bytes join the write allowlist. Undo/Redo handles DSP edits, and the existing names-to-all-scenes operation does not copy DSP.

The generated −8.1 dB scene equals the supplied changed scene byte-for-byte. Reverting to zero equals the original baseline byte-for-byte. Eleven tests pass, including these private-sample checks and gzip/TAR round trips. An exported archive has not yet been reopened in Director, so application acceptance is still outstanding. The raw show remains outside the repository; `research/eq-gain-observation.json` records hashes and the minimal differential evidence.

Next useful measurement: set the same band to +6.0 dB, store Scene 10 and save the show. A positive sample and subsequent intermediate/negative samples will test sign, scaling and quantization before a continuous control is enabled.

## Positive gain sample

The next attachment, supplied in response to the request for +6.0 dB without an additional caption, changes only the same two Scene 10 bytes to `05 fa` (signed big-endian integer 1530). The UI now includes +6.0 dB as a third calibrated lookup value. The entire resulting scene must reproduce this sample, not just its EQ record.

A continuous formula is still unresolved: 1530 / 256 = 5.9765625, which rounds to 6.0; 1530 / 255 = 6.0 exactly. The negative sample also permits more than one interpretation when display rounding and control quantization are considered. Neither divisor has been established. No arbitrary gain encoding is enabled.

For the next experiment, save several scenes in one show with the same input/band at known values (for example +1.0, +3.0, −3.0 dB) and supply the scene/value mapping. This is more efficient than one archive per measurement and helps distinguish scaling from quantization.
