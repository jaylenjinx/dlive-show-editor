# Changelog

## Unreleased

- **Group, Aux and Matrix processing** (`RevEngBus`): new **Buses** tab. Their Compressor, Parametric EQ and Mix Delay records share the input layouts (confirmed with controlled Director changes on Mono Aux/Group/Matrix 1, Stereo Aux 1 and Main LR/M), so compressor (Manual RMS), PEQ and delay (0–400 ms) are writable per bus; stereo buses (and Main LR) write both Left and Right records; Main appears when the mixer config's Main type is not None. `dlive_re.py` labels these records. See `docs/bus-processing.md`.
- **Compressor and gate models**: recalled every preset in Director's Deep Compressor Libraries (12 presets, 11 models — all match the existing model labels) and Gate Libraries (Gate `00`, Ducker `01`, Dual Expander `02`, Source Expander `03`). The gate model is now decoded, shown in the Console UI and labelled in `dlive_re.py`. See `docs/compressor-gate-models.md`. Also mapped the Ducker (`05`) threshold/attack/hold/release/depth and the 16T/16VU/Mighty output gain, writable per bus in the Buses tab.
- **Compressor ratio**: the editor and Console UI exposed only 7 of Director's ratios. `state +15` is a 41-step table (1:1 … ∞:1); every step was swept and is now writable for Manual RMS and Manual Peak. See `docs/reverse-engineer-ratio1.md`.

## v2.6

- **Promoted anchor-only fields to continuous writers wherever the anchors matched an already-proven canonical coordinate.** Several controls that are physically continuous (frequencies, gains, times) had been left as `<select>` dropdowns with only 4–9 discrete choices, exposing far less range than Director actually allows. Every promoted field was verified first: its existing controlled-scene anchors were checked against the coordinate's formula, and only promoted when the match was exact or within the same small typed-entry rounding noise (±1–3 raw units, ≤0.012 dB / a fraction of a Hz) already accepted elsewhere in the format.
  - RackUltra Spaces medium (`1c04`), Spaces large (`1c03`) and Plate Reverb (`1d00`): Decay Time (`time_log`), Output/Damping/Colour frequencies (`freq_log`) and Output/Damping/Colour gains (`offset_db`) are now continuous number inputs instead of anchor selects. Echo feedback gain on Spaces medium is likewise continuous.
  - Plate's originally recorded 0.1 s Decay anchor (`91B1`) did not fit the time_log formula at all (it decodes to ~1.8 s) while Spaces' independently-verified 0.1 s point fits exactly and both engines are documented as sharing one Decay coordinate — treated as a transcription error from the original sweep, superseded by the formula.
  - RackUltra Spaces extra (`1c03`) Low Cut/High Cut frequencies.
  - Input compressor: Attack, Release, and Sidechain Low/High/BPF filter frequencies are now continuous (`time_log` / `freq_log`).
  - Input gate: Attack, Hold, Release (`time_log`) and Sidechain Low/High filter frequencies (`freq_log`).
  - Manual Peak's own attack/release stay restricted to their two independently-tested exact values — only two data points were ever swept for that model, not enough to trust the general formula.
  - Fixed several console-UI (`app-console-ui-*.js`) controls that still referenced the old anchor tables after this change; they now use the same continuous number inputs as the main editor tabs.

## v2.5

- **Rhythm Delay** (`2d00`, `RevEngRD1`, 32 automated Director scenes on UFX Send 3, Simple mode): first mapping of this engine.
  - Tempo introduces a new coordinate: `raw = round(60000 / BPM)`, verified `33…1000` BPM.
  - Feedback is a clean continuous `raw = 0x8000 + round(dB × 256)`, verified `−39…+5 dB` — no typed-entry quantisation noise, unlike the Spaces engines.
  - Auto Pan, Drive and Amplitude reuse the standard `0x8000 + 16 × value` percentage coordinate. Amplitude also proportionally scales several read-only tap-gain bytes belonging to Advanced mode's (unmapped) per-tap pattern editor.
  - Global Tap Tempo and Groove (Dotted/Triplet — one shared three-state enum, not two independent toggles) are writable.
  - New `app-rackultra-rhythm-delay.js`; `dlive_re.py` and the browser checker label every field, including a new `bpm_60000` encoding.
- Hardened the Director automation: the display's backing-scale factor (Retina vs non-Retina) is now auto-detected each session instead of assumed, since the physical monitor Director ends up on can change between sessions.

## v2.4

- **Fixed a long-standing bug**: `app-rackultra-verified.js`, `app-rackultra-spaces-extra.js` and `app-rackultra-spaces-medium.js` were never included in `index.html` (going back to when the first RackUltra module was added), so none of the Spaces (`1c03`/`1c04`) RackUltra editor UI — including all of the v2.3 echo-tap and remaining-controls work — was actually reachable on the live site. Added the missing `<script>` tags.
- **Plate Reverb Designer** (`1d00`, `RevEngPlate1`, 90 automated Director scenes on UFX Send 2): first mapping of this engine.
  - Pre Delay, Diffusion, Size, Shape, Modulation Speed/Depth, Width and Position are continuous linear writes (`0x8000 + 16 × value`), matching the Spaces coordinate exactly.
  - Decay Time and Output LF/HF Cut use exact anchors; several anchor values are byte-identical to the Spaces tables, confirming a shared coordinate system across engines.
  - Echo taps 1–6 share the Spaces record layout (4-byte stride from `+88`, On/Off at `+133`); L1 and R2 are independently proven. Echo gain uses a clean continuous formula (`raw = 0x8000 + round(dB × 256)`), verified `−39…+10 dB` — cleaner than the Spaces echo gain, which carries typed-entry quantisation noise.
  - Type preset (`+85`) is decoded but read-only (selecting a preset rewrites many bytes at once).
  - New `app-rackultra-plate.js`; `dlive_re.py` and the browser checker label every Plate field.

## v2.3

- **Stereo send pan** (`RevEng10`): entry `+4` uses the input-pan coordinate (`00` L, `25` C, `4A` R), proven on St Aux, St FX, St Mtx and UFX sends. It is now writable in the Sends panel.
- **Mixer config** (`RevEngCfgA`, `RevEngM0–M6`): fully mapped `MixConfig.dat` apart from byte 12 (constant `0x17`).
  - Byte 7 is the Main strip mode and byte 8 the Main type (None/LR/LR+Msum/LR+M/LCR/5.1/LCR+).
  - Byte 9 is the stereo matrix count and byte 10 mono (previously swapped); byte 11 is the PAFL count.
  - The Input Mixer header mirrors these values. An all-distinct second config confirmed every send offset the layout rule predicts.
- The Input Mixer channel section is the **Main send** (On `+0`, level `+3` = fader, pan `+5` = pan); Main send On is now writable.
- `dlive_re.py mixconfig SHOW` decodes a show's mixer config.
- **Input sends and group assigns** (`ReverseEngineer9`, 79 automated Director scenes on input 13): solved the general Input Mixer bus layout.
  - Block order: group assign bytes, then mono FX, mono Aux, stereo FX, stereo Aux, mono Matrix, stereo Matrix sends (`[on, pre, level]` / `[on, pre, level, pan]`), a 47-byte channel section, then 8 UFX sends.
  - `blockSize = groups + 4 × mono + 5 × stereo + 47 (+40 UFX)` holds for every block in five mixer configurations, including legacy pre-UFX blocks.
- New `app-input-sends.js`: Channel state tab gains writable send level (−39…+10 dB, −∞), On, Pre/Post and group assigns. Writes are guarded on the header reproducing the block size and the verified fader offset.
- `dlive_re.py` now reads the 26 KB Input Mixer record and labels per-channel send, assign, fader and pan fields.
- **PEQ Bands 2 and 3** (`ReverseEngineer8`, 46 automated Director scenes on input 13): gain, frequency and Bell Width are independently swept on both bands across full range. Every frequency matches the existing log writer, and every width matches the width-index table.
  - Bands 2–3 are fixed Bell: Director 2.12 has no type control for them, and the type byte is `00` in every observed scene. The editor now labels it that way instead of showing an unknown byte. Remaining bytes `+7..8` never changed and stay preserved.
  - `dlive_re.py` accepts a folder of `Scene N.dat` files, such as Director's live `TLDV2.12/TLDData/Director/Scenes/StageBox` folder, so batches can be checked without exporting a show.
- Mapped the remaining numeric **Spaces / 480 Medium (`1c04`)** controls from `ReverseEngineer7` (96 automated Director scenes). The offsets match the `1c03` Spaces layout.
  - Linear `0x8000 + 16 × value` writes: Pre Delay (`+30`), Density (`+32`), Impact (`+34`), Diffusion Early/Mid/Late (`+36/+38/+40`), Direct Send (`+42`), Width (`+60`), Length (`+62`), Modulation Rate/Depth (`+72/+74`) and Stereo Spread (`+122`).
  - Exact-anchor writes: Decay Time (`+58`, `time_log`), Output LF/HF Cut (`+76/+78`), Colour HF Tone (`+50`), Colour Cut/Boost frequency (`+54`) and gain (`+56`).
- Mapped all six **Spaces / 480 Medium (`1c04`) echo taps** from `ReverseEngineer6`, a scene set generated by automating dLive Director 2.12. Taps are consecutive 4-byte blocks from `state +96` in record order L1, L2, L3, R1, R2, R3 (Echo 1/2 = L1/R1; Echo 3–6 = L2, R2, L3, R3), with On/Off bytes at `state +127 + 2k`.
  - Echo time `raw = 0x8000 + 16 × ms` is now proven on all six taps and writable `0…200 ms`; the stored resolution is 1/16 ms and Director's display truncates.
  - Echo gain (formerly "Feedback") exact anchors `−40=5800`, `−20=6BFD`, `−10=75FD`, `0=8003`, `+10=8A00` are proven on every tap, and Echo 2 gains the `−20` and `0` anchors.
  - Echo On/Off `10=On`, `00=Off` is now writable for all six taps.
- `dlive_re.py` and the browser checker label every echo field.
- `director_automation.py`: modifier clicks, ctrl-click numeric entry as the default set workflow, and a pointer move before each click.

## v2.2

- Promoted Manual RMS sidechain **BPF frequency** at compressor state `+125..126` to restricted **Verified Write**. Controlled anchors `50 Hz=4197`, `100=5396`, `200=6596`, `500=7D62`, `1 kHz=8F62`, `2 kHz=A162`, `5 kHz=B92D`, `10 kHz=CB2D`, `12 kHz=CFEA` each isolate only these two bytes outside scene-label bytes.
- Located compressor sidechain **Source** in the separate record `Compressor side chain source, Input Channel NN` with 3-byte state `01 TT II`, where `TT` is source type and `II` is zero-based source index.
- Proved CH16 source mappings `Input 1=01 01 00`, `Input 16=01 01 0F`, `Mono Group 1=01 02 00`, `Stereo Group 1=01 03 00`, `Mono Aux 1=01 04 00`, `Stereo Aux 1=01 05 00`, `Main=01 08 00`, `Mono Matrix 1=01 0A 00`, `Stereo Matrix 1=01 0B 00`.
- Confirmed `SC Self` on CH16 serialises identically to `SC Input 16` (`01 01 0F`), showing the archive stores the resolved concrete source rather than a distinct Self flag. Source writing is deliberately restricted to the exact tested type/index pairs.
- Promoted Manual RMS compressor **sidechain Filter In/Out** at `state +123` to **Verified Write**. Two independent controlled `Filter on/off` pairs toggle only this byte, proving `00=In`, `01=Out/bypassed`.
- Promoted Manual RMS sidechain **low-filter type** at `state +111` to **Verified Write**: `04=Lo-Cut`, `06=Low Shelf`. The controlled type pair changes only this byte.
- Promoted Manual RMS sidechain **high-filter type** at `state +120` to **Verified Write**: `03=Hi-Cut`, `07=High Shelf`. The controlled type pair changes only this byte.
- Isolated Manual RMS sidechain **low-filter frequency** at `state +107..108` with exact controlled anchors `20 Hz=29CB`, `100=5396`, `500=7D62`, `2 kHz=A162`, `5 kHz=B92E`; every adjacent scene changes only these two bytes.
- Isolated Manual RMS sidechain **high-filter frequency** at `state +116..117` with exact anchors `120 Hz=5853`, `200=6596`, `500=7D62`, `1 kHz=8F62`, `5 kHz=B92D`, `10 kHz=CB2D`, `20 kHz=DD2E`; every adjacent scene changes only these two bytes.
- Isolated the operator-labelled **notch / A&H BPF** switch at `state +124`: `00=Off`, `01=On`. The scene pair changes only this byte. The editor uses the conservative label `BPF / notch` because Allen & Heath documentation describes a BPF option while the controlled scene names call it notch.
- Added guarded sidechain editing for Manual RMS. Frequency writes expose only exact controlled anchors because some round-number console labels land one code either side of a simple logarithmic floor/round rule.
- Renamed the working controlled archive to `ReverseEngineer.tar.gz` for ongoing reverse-engineering tests.
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
- Promoted Manual RMS **Parallel Wet** at `state +3..+4` and **Parallel Dry** at `state +5..+6` to **Verified Write**. Controlled `−∞, −40, −20, −10, −5, 0 dB` series each change only their own two bytes; encoding is signed `int16_be / 256 dB` with `0x8001 = −∞`.
- Promoted Manual RMS **Parallel On/Off** at `state +7` to **Verified Write**. Two independent duplicate On/Off pairs toggle only this byte, proving `00=Off`, `01=On`.
- Added guarded Parallel Wet/Dry writers over the directly tested finite range `−40…0 dB` plus `−∞`, and a guarded On/Off writer for Manual RMS (`0x01`).
- Promoted common compressor threshold at `state +8..+9` to **Verified Write for Manual RMS (`0x01`) and Opto (`0x02`)**. Manual RMS scenes at `−46, −30, −20, −10, 0, +10, +18 dB` and independent Opto scenes at `−46, −20.3, 0, +10.5, +18 dB` each change only these two bytes outside scene-label bytes.
- Confirmed the common threshold encoding is signed `int16_be / 256 dB`; Opto anchors include `D2 00 = −46`, `EB C0 = −20.25`, `00 00 = 0`, `0A 80 = +10.5`, `12 00 = +18 dB`.
- Added a strict common-threshold writer guard for processor discriminator `0x08`, 127-byte compressor state, model byte `0x01` or `0x02`, and the directly observed range `−46…+18 dB`.
- Promoted the **Bus** (`0x09`) model threshold at model-specific `state +51` to **Verified Write** after the operator corrected the scene labelled `BUS 10` to the intended `BUS +9` value.
- Confirmed exact Bus threshold anchors `−15→00`, `−9→18`, `0→3C`, `+9→60`, `+15→78`, with transform `dB = raw/4 − 15`; each adjacent pair changes only state `+51` outside scene-label bytes while common threshold bytes `+8..9` remain fixed.
- Isolated Manual RMS compressor ratio at `state +15`. Controlled scenes `Rat 1`, `Rat 2`, `Rat 4`, `Rat 12`, `Rat 20`, `Rat 40`, `Rat Inf` change only this byte outside scene-label bytes.
- Added a restricted **Verified Write** ratio table for Manual RMS: `00=1:1`, `10=2:1`, `18=4:1`, `24=12:1`, `26=20:1`, `27=40:1`, `28=∞:1`. Untested intermediate ratio-table entries are preserved and not guessed.
- Isolated Manual RMS **attack** at `state +10..11` and **release** at `state +12..13` as unsigned 16-bit big-endian logarithmic time coordinates. Identical times store identical words on both controls, including `50 ms=6D5C`, `100 ms=745E`, `200 ms=7B5F`.
- Added restricted attack/release writers using only exact controlled anchors: attack `30 µs…300 ms`, release `50 ms…2 s`. The approximate logarithmic inverse is display-only and is not used to generate untested values.
- Promoted Manual RMS **makeup gain** at `state +16..17` to **Verified Write**. Controlled `0, +6, +12, +18 dB` scenes isolate only these two bytes; encoding is signed `int16_be / 256 dB`, with writes limited to the directly tested `0…+18 dB` range.
- Promoted Manual RMS **knee** at `state +18` to **Verified Write** with `00=Normal`, `01=Soft`. Two independent duplicate Normal/Soft pairs toggle only this byte; duplicate Normal scenes are byte-identical and duplicate Soft scenes are byte-identical.
- Decoded compressor model/engine byte `state +1` from controlled CH16 scenes: `00 Manual Peak`, `01 Manual RMS`, `02 Opto`, `03 16T`, `04 16VU`, `05 Ducker family`, `06 Peak Limiter 76`, `07 Mighty`, `08 Optronik`, `09 Bus`, `0A Compstortion`.
- Confirmed `Ducker` and `Ducker Slow` both use model byte `0x05`; the Slow variant changes parameter/default bytes at `+10..13` and `+25..26` rather than using a separate model ID.
- Kept compressor model selection read-only because console model changes also rewrite model-specific state; writing only `state +1` would create a hybrid compressor state.
- Fixed the live site loader so compressor threshold/model/ratio/attack/release/knee/makeup/parallel/sidechain/source extension modules are loaded by `index.html`.
- Located six mono Aux send level fields in the 169-byte event configuration; kept them read-only/configuration-specific until the variable bus-layout rule is solved.
- Added Channel State tooling, LPF tooling/docs, expanded PEQ type/bypass tooling/docs, compressor threshold/model/parallel/sidechain/source/ratio/time/knee/makeup tooling/docs, Input Mixer docs, event/ConsoleFlip cross-check notes and expanded v2.2 research documentation.

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

## v2

- Added paired MixRack/Surface scene handling.
- Added verified C-class strip-assignment editing.
- Added RackUltra/AHFX structured inspection.
- Added generic length-prefixed record scanner and MixConfig decoder.
