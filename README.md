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

The editor uses the canonical raw coordinate `0…74` with `37` as centre and writes percentage requests using `raw = 37 + trunc(pan_percent * 37 / 100)`. Only the pan byte is modified.

### Input compressor — v2.2

Inside `Compressor, Input Channel NN`:

```text
state +1        = compressor model / engine family
state +2        = 00 Off / 01 On
state +3..4     = Manual RMS Parallel Wet
state +5..6     = Manual RMS Parallel Dry
state +7        = Manual RMS Parallel On/Off
state +8..9     = common threshold on Manual RMS + Opto
state +10..11   = Manual RMS attack
state +12..13   = Manual RMS release
state +15       = Manual RMS ratio table/index
state +16..17   = Manual RMS makeup gain
state +18       = Manual RMS knee
state +51       = Bus model-specific threshold
state +107..108 = Manual RMS sidechain low-filter frequency
state +111      = Manual RMS sidechain low-filter type
state +116..117 = Manual RMS sidechain high-filter frequency
state +120      = Manual RMS sidechain high-filter type
state +123      = Manual RMS sidechain Filter In/Out
state +124      = Manual RMS sidechain BPF / scene-labelled notch
state +125..126 = Manual RMS sidechain BPF frequency
```

The model byte is decoded from controlled CH16 model scenes:

```text
00 Manual Peak
01 Manual RMS
02 Opto
03 16T
04 16VU
05 Ducker family
06 Peak Limiter 76
07 Mighty
08 Optronik
09 Bus
0A Compstortion
```

`Ducker` and `Ducker Slow` both use model byte `05`; the Slow variant is represented by different parameter/default state rather than a separate model ID.

The event-show ConsoleFlip preview matched compressor enable across all 108 visible input cards. Controlled CH16 clones then isolated On/Off directly with the clean `Comp 2 On` / `Comp 2 Off` pair.

Manual RMS Parallel Wet and Dry use signed `int16_be / 256 dB` at `state +3..4` and `+5..6`, with `0x8001` as the explicit `-∞` sentinel. Both controlled series cover `-∞, -40, -20, -10, -5, 0 dB`; every adjacent scene changes only the target two bytes. Parallel On/Off is `state +7`, where two duplicate pairs prove `00=Off`, `01=On`. The editor enables finite Wet/Dry writes over the directly tested **-40…0 dB** range plus `-∞`, guarded to Manual RMS.

A controlled **Manual RMS** (`0x01`) threshold series and an independent **Opto** (`0x02`) threshold series both isolate `state +8..9` as signed fixed-point `/256 dB`. The common threshold writer is enabled for those two models over the directly verified range **-46…+18 dB**.

The **Bus** model (`0x09`) uses a different user-facing threshold field at `state +51`. Corrected controlled anchors are `-15→00`, `-9→18`, `0→3C`, `+9→60`, `+15→78`, giving `threshold_dB = raw/4 - 15`. Bus threshold is **Verified Write** over `-15…+15 dB`.

Manual RMS ratio is isolated at `state +15`. The editor exposes only the directly tested table entries: `00=1:1`, `10=2:1`, `18=4:1`, `24=12:1`, `26=20:1`, `27=40:1`, `28=Infinity:1`.

Manual RMS attack and release use adjacent unsigned 16-bit big-endian fields at `+10..11` and `+12..13`. Both share the same logarithmic time coordinate; for example `50 ms=6D 5C`, `100 ms=74 5E`, `200 ms=7B 5F` on both controls. The editor writes only exact controlled anchors: attack from `30 µs` through `300 ms`, release from `50 ms` through `2 s`.

Manual RMS makeup gain is isolated at `state +16..17` and uses signed `/256 dB`. Controlled anchors are `0 dB=00 00`, `+6 dB=06 03`, `+12 dB=0C 03`, `+18 dB=12 00`; writes are enabled over the tested `0…+18 dB` range.

Manual RMS knee is a one-byte enum at `state +18`: `00=Normal`, `01=Soft`. Two duplicate Normal/Soft pairs reproduce exactly and change only this byte.

The `ReverseEngineer` controlled show isolates the Manual RMS compressor sidechain filter. Low-filter frequency is at `+107..108` with tested anchors **20 Hz, 100 Hz, 500 Hz, 2 kHz, 5 kHz**; low type at `+111` is `04=Lo-Cut`, `06=Low Shelf`. High-filter frequency is at `+116..117` with anchors **120 Hz, 200 Hz, 500 Hz, 1 kHz, 5 kHz, 10 kHz, 20 kHz**; high type at `+120` is `03=Hi-Cut`, `07=High Shelf`. Filter In/Out is `+123` (`00=In`, `01=Out`) and BPF/notch On/Off is `+124` (`00=Off`, `01=On`). BPF frequency is now isolated at `+125..126` with exact anchors **50 Hz, 100 Hz, 200 Hz, 500 Hz, 1 kHz, 2 kHz, 5 kHz, 10 kHz, 12 kHz**. Frequency writers are deliberately restricted to exact controlled anchors.

Sidechain Source is stored separately from the compressor DSP state in `Compressor side chain source, Input Channel NN` as `01 TT II`, where `TT` is source type and `II` is zero-based source index. Tested type IDs match the strip-assignment IDs (`01 Input`, `02/03 Groups`, `04/05 Auxes`, `08 Main`, `0A/0B Matrices`). On CH16, `Self` and `Input 16` both serialise as `01 01 0F`, proving the archive stores the resolved concrete source rather than a distinct Self mode. The writer currently exposes only exact tested type/index pairs.

## Decoded / read-only

### PEQ remaining state

PEQ band bytes `+7..8` remain unknown and are preserved exactly. Bands 2 and 3 filter type remain untouched because no alternate type scenes have been independently proven for those bands.

### LPF filter shape/state

LPF bytes `state +1..+2` and `+5..+9` are preserved exactly. Real-event material shows legitimate variation in this region, so slope/Q/type semantics are not guessed.

### Compressor model selection and remaining dynamics parameters

Compressor model names are decoded from `state +1`, but **model switching remains read-only** because selecting a model on the console also rewrites model-specific parameter/default bytes. Writing only the model byte would create a hybrid state. Manual RMS parallel/sidechain/source/ratio/attack/release/knee/makeup writes are restricted to controlled values/ranges; other model-specific parameters remain read-only until independently isolated.

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
- [Compressor models](docs/compressor-models.md)
- [Event show / ConsoleFlip cross-check](docs/event-show-consoleflip-crosscheck.md)
- [Documentation index](docs/README.md)
- [Consolidated field notes](KNOWN_FORMAT.md)

The interactive parameter map is driven by `app-parameter-map.js` plus focused add-on registries and verified processing extensions.

## Safety model

The project distinguishes:

- **Verified write** — narrow byte boundary and transform are understood strongly enough to generate.
- **Decoded/read-only** — values can be interpreted, but writes are not yet isolated/proven.
- **Unknown** — bytes are preserved exactly.

Always keep the original show and verify edited files in dLive Director/Preview before using them on a live system.

## GitHub Pages

Pushes to `main` trigger `.github/workflows/pages.yml` and publish the static application to GitHub Pages.
