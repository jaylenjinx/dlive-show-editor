# dLive show-file reverse-engineering documentation

These notes describe structures observed while building **dLive Show Editor**. They are not an official Allen & Heath format specification.

The current primary reference is **dLive firmware 2.12**. The project distinguishes three confidence levels:

- **Verified write** — structure and encoding reproduced or independently cross-checked strongly enough for the editor to generate only the proven bytes.
- **Decoded / read-only** — structure or semantics are understood, but one or more write-boundary details are still unproven.
- **Unknown** — bytes are preserved exactly.

## Canonical reference

- **[Parameter map](parameter-map.md)** — the master table of known records, byte offsets, datatypes, transforms, evidence, confidence and write status.

## Documents

- [Archive layout](archive-layout.md)
- [Scene record framing](scene-record-framing.md)
- [Names and colours](names-colours.md)
- [Surface strip layout](surface-layout.md)
- [Input PEQ](input-peq.md)
- [Input HPF](input-hpf.md)
- [Input LPF](input-lpf.md)
- [Input Mixer channel state](input-mixer.md)
- [Input compressor models](compressor-models.md)
- [RackUltra / AHFX](rackultra.md)
- [Research method](research-method.md)
- [Controlled PEQ gain experiment](controlled-peq-diff.md)
- [Controlled PEQ frequency/width experiment](controlled-peq-frequency-width.md)
- [Jaylen Aug 15 / ConsoleFlip cross-check](event-show-consoleflip-crosscheck.md)
- [ConsoleFlip public/static analysis](consoleflip-public-analysis.md)

The longer consolidated field notes remain in [`KNOWN_FORMAT.md`](../KNOWN_FORMAT.md). The interactive site version of the parameter map is driven by [`app-parameter-map.js`](../app-parameter-map.js) plus focused add-on registries and verified processing extensions.
