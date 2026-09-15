# ReverseEngineer2 — RackUltra 480 Medium / Spaces

Source: `ReverseEngineer2.tar.gz`. This is a new show-file series with a clean bridge pair, `CTL 1` / `CTL 2`. Those two StageBox scenes differ by only one scene-name byte, providing a clean baseline. UFX1 is `AHFX` engine `1c04` (Spaces / 480 Medium family) with the same observed 262-byte payload shape.

All adjacent comparisons within each sweep below change only the scene-name byte(s) plus the stated AHFX field.

## LL / EL / SL fader positions

The operator confirmed that LL, EL and SL are unnumbered faders. The percentages below therefore mean **physical fader position only**, not dB or another DSP unit.

| Control | State offset | Min | 25% | 50% | 75% | Max |
|---|---:|---:|---:|---:|---:|---:|
| LL | `+70..71` | `6C00` | `7123` | `7582` | `79E1` | `8000` |
| EL | `+68..69` | `6C00` | `7193` | `760E` | `7AA5` | `8000` |
| SL | `+94..95` | `6C00` | `730D` | `7A97` | `817A` | `8A00` |

The curves are not sufficiently linear to justify interpolation. The editor therefore exposes only these exact five position anchors.

## Echo 1 and Echo 2

### Time

Echo 1 time is `state +96..97`; Echo 2 time is `state +108..109`.

Both independently use:

```text
raw = 0x8000 + 16 * time_ms
```

Controlled anchors:

- Echo 1: `0=8000`, `50=8320`, `100=8640`, `150=8960`, `200=8C80`
- Echo 2: `0=8000`, `100=8640`, `200=8C80`

The editor enables continuous integer writes only over the directly established `0…200 ms` range.

### Feedback

Echo 1 feedback is `state +98..99`:

| dB | Raw |
|---:|---:|
| -40 | `5800` |
| -20 | `6BFD` |
| -10 | `75FD` |
| 0 | `8003` |
| +10 | `8A00` |

Echo 2 feedback is `state +110..111`:

| dB | Raw |
|---:|---:|
| -40 | `5800` |
| -10 | `75FD` |
| +10 | `8A00` |

These clearly resemble an offset-binary `/256 dB` coordinate around `0x8000`, but the low-byte quantisation around common values means the writer remains on exact controlled anchors rather than synthesising intermediate words.

The operator reports four additional echoes in this engine. Echoes 3–6 remain unmapped pending their controlled sweeps.

## Damping controls

### Damping LF frequency

`state +46..47`:

| Hz | Raw |
|---:|---:|
| 20 | `29CB` |
| 50 | `4196` |
| 100 | `5396` |
| 200 | `6596` |
| 500 | `7D62` |
| 1000 | `8F63` |

### Damping HF type

`state +93`:

```text
10 = 6 dB
20 = 12 dB
30 = Shelf
```

### Damping HF frequency

`state +64..65`:

| Hz | Raw |
|---:|---:|
| 40 | `3BCB` |
| 100 | `5396` |
| 200 | `6596` |
| 500 | `7D62` |
| 1000 | `8F62` |
| 2000 | `A162` |
| 5000 | `B92D` |
| 10000 | `CB2D` |
| 20000 | `DD2D` |

### Damping HF shelf gain

`state +66..67`:

- `0 dB = 8000`
- `-6 dB = 79FD`
- `-12 dB = 73FD`
- `-15 dB = 7100`

Exact controlled words only are writable.

## Output HF controls

Output HF type is `state +83`:

```text
10 = 6 dB
20 = 12 dB
30 = Shelf
```

Output HF shelf gain is `state +86..87`:

- `0 dB = 8000`
- `-6 dB = 7A00`
- `-12 dB = 7400`
- `-15 dB = 7100`

## Writer policy

Every writer in this batch is guarded to engine `1c04` and a 262-byte AHFX payload. Continuous writes are enabled only for Echo 1/2 Time, where both echo blocks independently prove the same exact transform. Fader positions, feedback, frequency and shelf controls use exact scene-proven anchors. Echoes 3–6 and every other unmapped `1c04` DSP byte remain preserved and read-only.
