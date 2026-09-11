# dLive Show Editor v2.2

Experimental, browser-only editor and reverse-engineering inspector for Allen & Heath dLive show archives (`.tar.gz`). The current primary target is **dLive firmware 2.12**.

The application processes shows locally in your browser. It does not upload show files to a server.

## Live site

https://jaylenjinx.github.io/dlive-show-editor/

## Verified writable fields

### Names and colours

- Inputs, Groups, Auxes, Mains, Matrices, RackExtra FX, RackUltra FX and DCAs
- names: fixed 9-byte slots, maximum 8 printable ASCII characters
- colours: one-byte IDs 0–7

### C-class surface strip assignments

The supplied factory Strip Assign scenes identify two-byte `[type, zero_based_index]` assignments across six surface layers. The editor writes only independently identified strip types and preserves unknown assignments.

### Input PEQ

For all 128 input channels:

- Gain: signed `int16_be`, `dB = raw / 256`
- Frequency: `raw = floor(4608 * log2(Hz / 4))`
- Bell Width: A&H width index in the high byte; untouched fractional low-byte precision is preserved
- Band 1 filter type at band byte `+6`: `04 HPF`, `00 PEQ/Bell`, `01 Low Shelf`
- Band 4 filter type at band byte `+6`: `03 LPF`, `00 PEQ/Bell`, `02 High Shelf`
- Global PEQ In/Out: the single trailing byte after Band 4 is `00 In`, `01 Out/bypassed`

Controlled CH16 type scenes changed only the single `+6` type byte outside the scene label. Separate duplicated PEQ In/Out scenes then isolated the trailing bypass byte: after the fixed scene-name/header region, the clean `EQ In 2` / `EQ Out 2` pair differs at exactly one byte in the complete 412,047-byte StageBox scene.

The editor deliberately exposes only the type combinations proven for each edge band, and writes PEQ In/Out only when the parsed tail is exactly one known `00/01` byte. The final two PEQ band-state bytes (`+7..8`) remain read-only and are preserved exactly.

### Input HPF — v2.2

Real-event evidence plus controlled scene clones resolve the current five-byte HPF state:

```text
03 FF FF SS BB
│  └─┬─┘ │  └─ bypass: 00 On, 01 Off
│    │   └──── slope / filter-type enum
│    └──────── frequency
└───────────── HPF discriminator/type
```

HPF frequency uses the same logarithmic coordinate as PEQ and is writable from **20–2000 Hz**. Controlled CH16 clones isolated the slope/type byte:

```text
05 = 6 dB BW
00 = 12 dB BW
01 = 18 dB BW
02 = 24 dB BW
03 = 18 dB Bessel
04 = unmapped / preserved
```

ConsoleFlip independently rendered 108 input cards from the real event show; all 108 matched the native bypass state and rounded decoded frequency.

### Input LPF — v2.2

`Lowpass Filter Input Channel NN` uses an 11-byte state in the current reference:

```text
04 00 00 FF FF SS SS SS SS SS BB
│        └─┬─┘                └─ bypass: 00 On, 01 Off
│          └──────────────────── frequency
└─────────────────────────────── LPF discriminator/type
```

Controlled CH16 clones at Off, 20 kHz, 10 kHz, 5 kHz, 1 kHz, 500 Hz, 200 Hz, 50 Hz and 20 Hz isolate the frequency field at `state +3..+4` and bypass at `state +10`. Frequency uses the same high-resolution logarithmic coordinate as PEQ/HPF; the observed 20 kHz endpoint is `0xDD2E` and is reproduced explicitly by the writer.

The editor writes only frequency and bypass. The remaining state bytes are preserved because real-event material shows legitimate filter-shape/state variation there.

### Input fader — v2.2

`Input Mixer` contains a 12-byte header followed by 128 equal-size input blocks. The block size changes with mixer configuration, but the fader remains fixed relative to the end of each block:

```text
faderOffset = blockStart + blockSize - 84
raw == 0x8001  -> -infinity
otherwise dB   = int16_be(raw) / 256
```

Controlled CH16 clones at `-∞`, `-30`, `-20.3`, `-12.2`, `-5.9`, approximately `0`, `+5` and `+10 dB` changed only those two bytes. The editor currently writes the directly tested finite range **-30…+10 dB** plus `-∞`.

### Input pan — v2.2

Pan is one byte at:

```text
panOffset = blockStart + blockSize - 82
```

Controlled CH16 clones changed only that byte:

```text
00 = 100% L
13 = 50% L
24 = near-centre controlled clone
25 = exact centre (independently present in Scene 10)
37 = 50% R
4A = 100% R
```

The editor uses the canonical raw coordinate `0…74` with `37` as centre and writes percentage requests using `raw = 37 + trunc(percent * 37 / 100)`. Only the pan byte is modified.

### Input compressor On/Off — v2.2

Inside `Compressor, Input Channel NN`:

```text
state +2 = 00  -> Off
state +2 = 01  -> On
```

The event-show ConsoleFlip preview matched this byte across all 108 visible input cards. Controlled CH16 clones then isolated the byte directly: the clean `Comp 2 On` / `Comp 2 Off` pair changes only `state +2` outside the scene label.

The editor writes only that enable byte, and only when the record matches the verified current-format input-compressor shape. Compressor model and all dynamics parameters remain read-only.

## Decoded / read-only

### PEQ remaining state

PEQ band bytes `+7..8` remain unknown and are preserved exactly. Bands 2 and 3 filter type remain untouched because no alternate type scenes have been independently proven for those bands.

### LPF filter shape/state

LPF bytes `state +1..+2` and `+5..+9` are preserved exactly. Real-event material shows legitimate variation in this region, so slope/Q/type semantics are not guessed.

### Compressor model and dynamics parameters

The compressor model/type byte and threshold, ratio, attack, release, knee and other dynamics parameters are not yet mapped for writing.

### Aux-send evidence

The 169-byte event configuration exposes six mono Aux levels as signed fixed-point dB fields at block offsets `+12,+16,+20,+24,+28,+32`. These offsets are **configuration-specific** and remain read-only until the general bus-layout rule is solved.

### RackUltra / AHFX

The editor parses RackUltra record framing, engine IDs, preset labels and same-engine byte differences, but does not write DSP parameters yet.

### MixConfig and structure inspector

`MixConfig.dat`, generic framed-record discovery and unknown processing/routing records are exposed for research without unsafe writes.

## Documentation

The site has a built-in **Docs** section available without loading a show.

- [Canonical parameter map](docs/parameter-map.md)
- [Input PEQ](docs/input-peq.md)
- [Input HPF](docs/input-hpf.md)
- [Input LPF](docs/input-lpf.md)
- [Input Mixer / channel state](docs/input-mixer.md)
- [Event show / ConsoleFlip cross-check](docs/event-show-consoleflip-crosscheck.md)
- [Documentation index](docs/README.md)
- [Consolidated field notes](KNOWN_FORMAT.md)

The interactive parameter map is driven by `app-parameter-map.js` plus focused add-on registries for PEQ type/bypass, HPF and channel state.

## Safety model

The project distinguishes:

- **Verified write** — narrow byte boundary and transform are understood strongly enough to generate.
- **Decoded/read-only** — values can be interpreted, but writes are not yet isolated/proven.
- **Unknown** — bytes are preserved exactly.

Always keep the original show and verify edited files in dLive Director/Preview before using them on a live system.

## GitHub Pages

Pushes to `main` trigger `.github/workflows/pages.yml` and publish the static application to GitHub Pages.
