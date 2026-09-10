# Controlled dLive 2.12 PEQ frequency and Bell Width diffs

These results were derived from a user-supplied dLive 2.12 show containing Scene 10 clones where one Band 2 PEQ parameter was changed per labelled scene.

## Frequency set

| Scene | Label | Raw Band 2 bytes | Frequency raw | Formula check |
|---:|---|---|---:|---|
| 17 | 100hz | `04 80 53 96 0A 80 00 00 00` | 21398 | exact |
| 18 | 200hz | `04 80 65 96 0A 80 00 00 00` | 26006 | exact |
| 19 | 500hz | `04 80 7D 62 0A 80 00 00 00` | 32098 | exact |
| 20 | 1000hz | `04 80 8F 62 0A 80 00 00 00` | 36706 | exact |
| 21 | 5khz | `04 80 B9 2D 0A 80 00 00 00` | 47405 | exact |
| 22 | 10khz | `04 80 CB 2D 0A 80 00 00 00` | 52013 | exact |

The exact mapping is:

```text
raw = floor(4608 * log2(f / 4))
f   = 4 * 2^(raw / 4608)
```

The frequency field is bytes 2..3 within each 9-byte band record.

## Bell Width set

| Scene | Label | Raw width | High-byte index | Fraction |
|---:|---|---:|---:|---:|
| 24 | 1/9 q | `0x1800` | 24 | 0 |
| 25 | 1/6 q | `0x168E` | 22 | 142 |
| 26 | 0.3 q | `0x13F4` | 19 | 244 |
| 27 | 0.45 q | `0x1032` | 16 | 50 |
| 28 | 2/3 q | `0x0C70` | 12 | 112 |
| 29 | 0.8 q | `0x09D6` | 9 | 214 |
| 30 | 0.95 q | `0x06A8` | 6 | 168 |
| 31 | 1.1 q | `0x0458` | 4 | 88 |
| 32 | 1.3 q | `0x0200` | 2 | 0 |
| 33 | 1.5 q | `0x0000` | 0 | 0 |

Although the scenes were labelled with `q`, Allen & Heath documents this parameter as **Bell Width**. The high byte equals the official MIDI width-table index for every controlled scene. The low byte carries additional internal precision.

## Full 9-byte band structure

```text
GG GG FF FF WW WW SS SS SS
|     |     |     |
|     |     |     +-- state/type bytes (not mapped)
|     |     +-------- Bell Width
|     +-------------- frequency
+-------------------- gain
```

No bytes outside the Scene label and the expected two-byte field changed between adjacent scenes in either controlled series. That is strong evidence these are isolated parameter fields rather than correlated cache/checksum structures.
