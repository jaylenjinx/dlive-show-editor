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

The final three PEQ state/type bytes remain read-only.

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
- [Input HPF](docs/input-hpf.md)
- [Input Mixer / channel state](docs/input-mixer.md)
- [Event show / ConsoleFlip cross-check](docs/event-show-consoleflip-crosscheck.md)
- [Documentation index](docs/README.md)
- [Consolidated field notes](KNOWN_FORMAT.md)

The interactive parameter map is driven by `app-parameter-map.js` and focused add-on registries.

## Safety model

The project distinguishes:

- **Verified write** — narrow byte boundary and transform are understood strongly enough to generate.
- **Decoded/read-only** — values can be interpreted, but writes are not yet isolated/proven.
- **Unknown** — bytes are preserved exactly.

Always keep the original show and verify edited files in dLive Director/Preview before using them on a live system.

## GitHub Pages

Pushes to `main` trigger `.github/workflows/pages.yml` and publish the static application to GitHub Pages.
