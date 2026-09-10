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

A second real event show and an independent ConsoleFlip preview resolve the current five-byte HPF state:

```text
03 FF FF MM BB
│  └─┬─┘ │  └─ bypass: 00 On, 01 Off
│    │   └──── unknown mode/state — preserved
│    └──────── frequency
└───────────── HPF discriminator/type
```

HPF frequency uses the same logarithmic coordinate as PEQ and is writable from **20–2000 Hz**. The editor changes only frequency bytes `+1..2` and bypass byte `+4`.

ConsoleFlip independently rendered 108 input cards from the real event show; all 108 matched the native bypass state and rounded decoded frequency.

## Decoded / read-only

### Input Mixer channel state — v2.2

Two different real dLive 2.12 mixer configurations reveal:

```text
Input Mixer\0
12-byte mixer header
128 × blockSize-byte input blocks
```

Observed channel-block sizes are 169 and 224 bytes, but these fields remain stable relative to each block end:

```text
fader offset = blockSize - 84
pan offset   = blockSize - 82
```

Fader:

```text
raw == 0x8001  -> -infinity
otherwise dB   = int16_be(raw) / 256
```

Pan:

```text
0x00 = hard L
0x25 = centre
0x4A = hard R
```

Both mappings agree with ConsoleFlip's rendered event-show controls. They remain read-only until isolated one-parameter clones prove the write boundary.

### Input compressor On/Off

Inside `Compressor, Input Channel NN`:

```text
state +2 = 00  -> Off
state +2 = 01  -> On
```

This matches all 108 visible ConsoleFlip channel cards in the event-show preview. Other compressor parameters remain under investigation.

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
