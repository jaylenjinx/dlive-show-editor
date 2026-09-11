# Changelog

## v2.2

- Promoted input HPF frequency and On/Off to **Verified Write** using a second real event show and an independent ConsoleFlip preview.
- Resolved the HPF five-byte state map as `03 FF FF SS BB`: frequency is bytes 1–2, byte 3 is slope/filter type, and byte 4 is bypass (`00` On, `01` Off).
- Verified HPF state and rounded frequency against all 108 input cards rendered by ConsoleFlip for the event show.
- Promoted HPF slope/filter type to **Verified Write** using controlled CH16 clones: `05=6 dB BW`, `00=12 dB BW`, `01=18 dB BW`, `02=24 dB BW`, `03=18 dB Bessel`; `04` remains unmapped and is preserved.
- Promoted input LPF frequency and On/Off to **Verified Write** using controlled CH16 clones labelled Off, 20 kHz, 10 kHz, 5 kHz, 1 kHz, 500 Hz, 200 Hz, 50 Hz and 20 Hz.
- Identified LPF frequency at state `+3..+4` and bypass at `+10`; `LPF Off` versus `LPF On 20khz` changes only the bypass byte outside the scene label, while adjacent frequency scenes change only the frequency bytes.
- Confirmed LPF uses the same high-resolution logarithmic frequency coordinate as PEQ/HPF across the controlled interior values; the observed 20 kHz endpoint is `0xDD2E` and is emitted explicitly by the writer.
- Kept LPF bytes `+1..+2` and `+5..+9` read-only/preserved because real-event material shows legitimate filter-shape/state variation there.
- Promoted PEQ edge-band filter type at band byte `+6` to **Verified Write**. Controlled CH16 Band 1 scenes isolate `04=HPF`, `00=PEQ/Bell`, `01=Low Shelf`; Band 4 scenes isolate `03=LPF`, `00=PEQ/Bell`, `02=High Shelf`.
- Confirmed every adjacent PEQ type scene changes exactly one non-label byte in the complete StageBox scene: the target band's `+6` type byte. The editor restricts Band 1 to HPF/Bell/Low Shelf and Band 4 to LPF/Bell/High Shelf; bytes `+7..8` remain read-only/preserved.
- Promoted global PEQ In/Out to **Verified Write** using controlled CH16 scenes `EQ In`, `EQ Out`, `EQ In 2`, `EQ Out 2`.
- Identified the single trailing byte after the four PEQ bands as bypass: `00=In/active`, `01=Out/bypassed`. In the clean duplicate pair, this is the only post-header byte that changes in the complete 412,047-byte StageBox scene.
- Identified `Input Mixer` as a 12-byte header followed by 128 equal per-input blocks; current-format block size is mixer-configuration dependent.
- Promoted input fader to **Verified Write** using controlled CH16 clones at `-∞`, `-30`, `-20.3`, `-12.2`, `-5.9`, approximately `0`, `+5` and `+10 dB`.
- Established the generic fader locator as `blockStart + blockSize - 84`; the same end-relative field survives different channel-block sizes.
- Verified fader encoding as signed 16-bit big-endian `/256 dB`, with `0x8001` representing `-∞`.
- Added guarded fader editing for the directly tested finite range `-30…+10 dB` plus `-∞`; only the two fader bytes are modified.
- Promoted input pan to **Verified Write** using controlled CH16 clones: `100L=00`, `50L=13`, near-centre clone=`24`, `50R=37`, `100R=4A`; original Scene 10 exact centre is `25`.
- Established the generic pan locator as `blockStart + blockSize - 82`; controlled pan scenes changed only this one byte.
- Added canonical pan percentage writes over `-100…+100` using the 0…74 raw coordinate while preserving exact centre as `0x25`.
- Promoted input compressor On/Off to **Verified Write** at compressor state byte `+2` (`00` Off, `01` On).
- Used the event-show ConsoleFlip preview as an independent 108-channel cross-check, then confirmed the write boundary with controlled CH16 clones. The clean `Comp 2 On` / `Comp 2 Off` pair changes only state `+2` outside the scene label.
- Added a strict compressor writer guard for the verified current-format shape (`stateLength=127`, processor discriminator `0x08`, existing enable `00/01`); compressor model and all dynamics parameters remain read-only.
- Located six mono Aux send level fields in the 169-byte event configuration; kept them read-only/configuration-specific until the variable bus-layout rule is solved.
- Added Channel State tooling, LPF tooling/docs, expanded PEQ type/bypass tooling/docs, Input Mixer docs, event/ConsoleFlip cross-check notes and expanded v2.2 research documentation.

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
