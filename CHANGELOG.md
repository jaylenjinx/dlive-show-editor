# Changelog

## v2.2

- Promoted input HPF frequency and On/Off to **Verified Write** using a second real event show and an independent ConsoleFlip preview.
- Corrected the HPF five-byte state map to `03 FF FF MM BB`: frequency is bytes 1–2, byte 3 is unknown/preserved, and byte 4 is bypass (`00` On, `01` Off).
- Verified HPF state and rounded frequency against all 108 input cards rendered by ConsoleFlip for the event show.
- Added a generic read-only `Input Mixer` channel-state decoder.
- Identified `Input Mixer` as a 12-byte header followed by 128 equal per-input blocks; observed block sizes are 169 and 224 bytes in two different real mixer configurations.
- Decoded input fader at `blockSize - 84`: signed 16-bit big-endian `/256 dB`, with `0x8001` representing `-infinity`.
- Decoded input pan at `blockSize - 82`: `0x00` hard L, `0x25` centre, `0x4A` hard R.
- Decoded input compressor On/Off at compressor state byte `+2` (`00` Off, `01` On), matching all 108 ConsoleFlip event-show cards.
- Located six mono Aux send level fields in the 169-byte event configuration; kept them read-only/configuration-specific until the variable bus-layout rule is solved.
- Added a Channel State editor tab, Input Mixer docs, event/ConsoleFlip cross-check notes and expanded v2.2 research JSON exports.

## v2.1.2

- Added a high-confidence read-only decoder for `Highpass Filter Input Channel NN` records.
- Identified the current HPF state payload as five bytes and established the frequency coordinate as a strong candidate.
- Confirmed reference HPF frequency bytes `53 96` decode exactly to 100 Hz with the same high-resolution logarithmic coordinate used by input PEQ.
- Cross-checked logarithmic frequency behaviour against `togrupe/dlive-midi-tools`.
- Added the initial Input HPF inspector and research documentation.

## v2.1.1

- Added a canonical dLive 2.12 parameter map with record pattern, payload size, offsets, datatype, transform, evidence, confidence and write status.
- Added an interactive, searchable/filterable Parameter Map page to the built-in Docs section.
- Added `app-parameter-map.js` as the machine-readable reverse-engineering registry.
- Added `docs/parameter-map.md` as the human-readable repository reference.
- Added explicit located/unmapped backlog entries for HPF, compressor, gate, delay, stereo image, digital attenuator, routing/send-source, input mixer and preamp records.
- Linked the parameter map prominently from the repository README and docs index.

## v2.1

- Added controlled-diff verified input PEQ parsing for all 128 input channels.
- Added writable PEQ gain (signed 8.8-style dB field).
- Added writable PEQ frequency using the exact high-resolution Allen & Heath logarithmic coordinate.
- Added Bell Width decoding using the official A&H width-index table and canonical width writes.
- Preserves unknown PEQ type/state bytes and untouched fractional width precision.
- Added PEQ data to reverse-engineering JSON export.
- Added controlled frequency/width research notes.

## v2

- Added paired MixRack/Surface scene handling.
- Added verified C-class strip-assignment editing.
- Added RackUltra/AHFX structured inspection.
- Added generic length-prefixed record scanner and MixConfig decoder.
