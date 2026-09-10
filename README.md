# dLive Show Editor v2.1

Experimental, browser-only editor and reverse-engineering inspector for Allen & Heath dLive show archives (`.tar.gz`).

V2/V2.1 were developed against a real DM32/C1500 show and the factory-style strip-assignment scenes carried inside that show. The app never uploads a show to a server.

## V2: verified writable

### Names and colours
Edits fixed-width dLive name/colour manager tables for Inputs, Groups, Auxes, Mains, Matrices, RackExtra FX, RackUltra FX and DCAs.

- names: fixed 9-byte slots, max 8 printable ASCII characters
- colours: one-byte IDs 0–7
- CSV name/colour import retained from v1

### Surface strip layout
V2 now pairs `StageBoxSceneNNN` and `SurfaceSceneNNN` archives and edits the six surface layers.

The supplied dLive factory `C1500 Strip Assign` scene provides a controlled reference. The record has a 2-byte big-endian payload-length prefix; its payload contains the label, a version/width header and `6 × bankWidth` two-byte strip assignments. Each strip assignment is:

```text
[type, zero_based_index]
```

The editor only offers strip type IDs observed and independently identified in the factory scenes. Unknown raw assignments are shown but not overwritten.

Verified strip types currently exposed:

| Type | Object |
|---:|---|
| 0 | Blank |
| 1 | Input |
| 2 | Mono Group |
| 3 | Stereo Group |
| 4 | Mono Aux |
| 5 | Stereo Aux |
| 6 | RackExtra FX Send |
| 8 | Main |
| 10 | Mono Matrix |
| 11 | Stereo Matrix |
| 12 | RackExtra FX Return |
| 13 | DCA |
| 19 | RackUltra FX Return |

### Input PEQ editor (V2.1)
Controlled Scene 10 clones now validate the three numerical fields in each 9-byte input-PEQ band record:

- **Gain** — signed 16-bit big-endian, effectively 8.8 fixed-point dB (`raw / 256`).
- **Frequency** — high-resolution logarithmic coordinate (`raw = floor(4608 * log2(Hz / 4))`). Six controlled frequencies from 100 Hz to 10 kHz matched exactly.
- **Bell Width** — the high byte maps directly to Allen & Heath's published width index (`1.5` through `1/9` octave); the low byte is extra internal precision and is preserved when untouched.

V2.1 exposes these three values for all 128 input PEQs. The remaining three state/type bytes per band are still read-only. Width edits use a canonical index value and do not rewrite untouched fractional width state.

## V2: decoded, read-only

### Generic length-prefixed records
A major V2 finding is that many dLive scene objects share a common frame: a 2-byte big-endian payload length followed by a payload whose first field is a NUL-terminated ASCII label. This is validated across name managers, surface bank switchers, AHFX managers, PEQ and compressor records. The Structure tab uses this framing rather than loose string searching.

### RackUltra / AHFX records
Each RackUltra slot in the supplied show is a 262-byte length-prefixed payload (264 bytes including its 2-byte prefix), anchored by:

```text
AHFX Manager 01
...
AHFX Manager 08
```

V2 parses:

- record offset
- record size
- two-byte engine ID
- stored preset label
- same-engine byte differences against the show's Scene 1 reset baseline
- complete raw record

Engine IDs observed so far include:

| ID | Observed model family |
|---|---|
| `1c03` | Spaces Reverb / 480 Large family |
| `1c04` | Spaces Reverb / 480 Medium family |
| `1d00` | Plate Reverb Designer |
| `2d00` | Rhythm Delay |
| `2b00` | Saturator |
| `2a00` | Amp/Cab |
| `2400` | Shifter |
| `2300` | Dual Harmony |
| `1e00` | Tuner |
| `2800` | Gridder |

DSP parameter writes remain disabled until individual parameter encodings are reproducible from controlled test scenes.

### MixConfig.dat
The supplied show uses a 13-byte mixer-config record. Several count bytes are strongly identified by comparing the global config to the serialized mixer structures, but four fields remain unknown. V2 therefore displays the data without writing it.

### Structure inspector
The Structure tab enumerates human-readable record labels and their byte offsets in both MixRack and Surface scene data. This is useful for creating controlled before/after test files.

## MIDI protocol cross-reference

Thanks to Tobias Grupe's [`togrupe/dlive-midi-tools`](https://github.com/togrupe/dlive-midi-tools), V2 also includes a read-only protocol cross-reference. That project documents dLive live-control semantics including:

- proprietary SysEx for names, colours and socket preamp functions
- NRPN for fader level, HPF, DCA assignment, main/group/aux routing
- CC for mute
- MIDI over TCP on port 51325
- technical channel offsets for Inputs, Groups, Auxes, Matrices, RackExtra FX, RackUltra FX and DCAs

This is not copied into the show-file encoder. It is used as an independent semantic reference while reverse-engineering offline scene structures.

## Run

Open `index.html` in a modern browser.

If local-file restrictions get in the way:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Safety

This is not an Allen & Heath product. Keep the original show and verify every exported show in dLive Director/Preview before using it on a live system.

V2 deliberately distinguishes:

- **Verified write** — fixed structures confirmed by controlled examples and round-trip validation.
- **Decoded/read-only** — structure is identified, but one or more field encodings are not yet safe to generate.
- **Unknown** — bytes are preserved exactly.

The exporter rebuilds only modified nested scene archives, preserves unrecognised outer entries, reopens the complete generated `.tar.gz`, checks outer entry count and verifies modified nested scene `.dat` files before download.

## Documentation

The web app includes a built-in **Docs** view that is available without loading a show. Start with the **Parameter map**, which is the canonical index of every field currently located or decoded, including record pattern, payload size, byte offset, datatype, transform, evidence, confidence and write status.

- [Canonical parameter map](docs/parameter-map.md)
- [Documentation index](docs/README.md)
- [Consolidated field notes](KNOWN_FORMAT.md)
- [Machine-readable UI registry](app-parameter-map.js)

## GitHub Pages

Pushes to `main` trigger [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which publishes the static application with GitHub Pages. The project URL is:

`https://jaylenjinx.github.io/dlive-show-editor/`
