# dLive Show Editor (experimental MVP)

A browser-only proof-of-concept editor for Allen & Heath dLive show archives (`.tar.gz`). It was built and tested against a real dLive show archive containing Scene 10.

## What it can edit safely

- Input channel names and colours
- Mono/stereo Group names and colours
- Mono/stereo Aux names and colours
- Main names and colours
- Mono/stereo Matrix names and colours
- RackExtra FX send/return names and colours
- RackUltra FX send/return names and colours
- DCA names and colours
- Multiple StageBox scenes
- Import compatible name/colour fields from an Allen & Heath-style `[Channels]` CSV
- Apply one scene's recognised names/colours to all StageBox scenes
- Export a new `.tar.gz` copy after an internal archive validation pass

All editing happens locally in the browser. The show is never sent to a server.

## What it deliberately does NOT edit yet

- RackUltra/RackExtra DSP parameters
- PEQ, dynamics, routing, patching or fader values inside proprietary scene binary data
- Surface strip layout / SoftKeys
- Mixer bus configuration
- Scene names / cue lists

Those fields are stored in undocumented binary structures. The app exposes an FX string inspector, but keeps unknown DSP bytes read-only until their encoding is validated.

## How to run

Open `index.html` directly in a current browser. Safari/Chrome/Edge versions with `CompressionStream` and `DecompressionStream` support work without a server.

If your browser blocks local-file features, run a tiny local server from this folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Safety model

The dLive scene binary observed during development contains labelled channel name/colour manager tables. Each manager uses fixed 9-byte name slots (8 printable ASCII characters plus padding) followed by one-byte colour IDs. The editor writes only those exact recognised offsets.

Colour mapping observed in the show data:

- 0 Off
- 1 Red
- 2 Green
- 3 Yellow
- 4 Blue
- 5 Magenta
- 6 Cyan
- 7 White

Every other byte in a StageBox scene remains untouched. Unmodified archive files remain byte-for-byte unchanged; edited nested scene archives are rebuilt.

## Important

This is an independent experimental tool, not an Allen & Heath product. Always export to a new file, keep the original show, and verify edited shows in dLive Director Preview Mode before loading them on a live system.

## Version 2 research preview

This branch prepares the editor for DSP reverse engineering. **It does not yet implement scalar DSP editing.** See [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md) for actual observations and the controlled-save experiment needed next.

Added: Binary research tab, scene/show comparisons, known-versus-unknown byte classification, offset-bearing string search, DSP comparisons by record label, JSON evidence export, and Undo/Redo for edits within the current scene session (history resets when switching scenes).

Archive handling now verifies TAR checksums and bounds, rejects ambiguous paths and unsupported extended headers, preserves original entry headers and padding when possible, validates allowed write regions, and checks nested scene archives during export. Raw entry payloads are preserved for unchanged files; the enclosing compressed archive may differ. These checks do not certify a show for console use.

Run tests with `node --test tests/core.test.cjs`. Set `DLIVE_SAMPLE` to the supplied Hardcore Start archive path to include the optional real-show regression test. No sample is uploaded or bundled.
