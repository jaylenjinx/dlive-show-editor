# Changelog

## v2.1.2

- Added a high-confidence read-only decoder for `Highpass Filter Input Channel NN` records.
- Identified the current HPF state payload as five bytes: `03 FF FF EE 01` where the middle two bytes are a frequency candidate and `EE` is the enable/bypass candidate.
- Confirmed reference HPF frequency bytes `53 96` decode exactly to 100 Hz with the same high-resolution logarithmic coordinate used by input PEQ.
- Cross-checked the logarithmic frequency behaviour against `togrupe/dlive-midi-tools`, which exposes dLive HPF as a 20–2000 Hz logarithmic NRPN control.
- Cross-checked state byte `00` against the captured ConsoleFlip preview, which reports the same reference channels as HPF Off.
- Added an Input HPF editor tab in read-only mode, HPF documentation, parameter-map entries and HPF data in research JSON exports.
- Added a controlled HPF test matrix required before frequency/enable writes can be promoted.

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
