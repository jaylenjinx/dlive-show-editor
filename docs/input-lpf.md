# Input low-pass filter (LPF)

> Status: **verified write for frequency and bypass**. These notes are unofficial reverse-engineering observations for dLive 2.12.

Controlled CH16 scene clones resolve the write-safe parts of the separate `Lowpass Filter Input Channel NN` record.

```text
Lowpass Filter Input Channel NN\0
04 00 00 FF FF SS SS SS SS SS BB
│        └─┬─┘                └─ bypass: 00 active/on, 01 bypassed/off
│          └──────────────────── frequency coordinate
└─────────────────────────────── observed LPF discriminator/type
```

The state after the NUL-terminated label is 11 bytes in the current reference.

## Field map

| State offset | Meaning | Type / transform | Confidence | Write |
|---:|---|---|---|---|
| `+0` | LPF discriminator/type | `uint8`, observed `04` | Decoded/parser guard | No |
| `+1..+2` | unknown/preserved | raw bytes | Located | No |
| `+3..+4` | LPF frequency | `uint16_be`, logarithmic coordinate | **Verified write** | **Yes** |
| `+5..+9` | filter shape/state | raw bytes; real-show variation observed | Located | No |
| `+10` | LPF bypass | `00` active/on, `01` bypassed/off | **Verified write** | **Yes** |

## Controlled evidence

CH16 scenes were labelled:

```text
LPF Off
LPF On 20khz
LPF On 10khz
LPF On 5khz
LPF On 1khz
LPF On 500hz
LPF On 200hz
LPF On 50hz
LPF On 20hz
```

The resulting states were:

| Scene | State bytes |
|---|---|
| LPF Off | `04 00 00 DD 2E 0A 80 03 00 00 01` |
| LPF On 20 kHz | `04 00 00 DD 2E 0A 80 03 00 00 00` |
| LPF On 10 kHz | `04 00 00 CB 2D 0A 80 03 00 00 00` |
| LPF On 5 kHz | `04 00 00 B9 2D 0A 80 03 00 00 00` |
| LPF On 1 kHz | `04 00 00 8F 62 0A 80 03 00 00 00` |
| LPF On 500 Hz | `04 00 00 7D 62 0A 80 03 00 00 00` |
| LPF On 200 Hz | `04 00 00 65 96 0A 80 03 00 00 00` |
| LPF On 50 Hz | `04 00 00 41 96 0A 80 03 00 00 00` |
| LPF On 20 Hz | `04 00 00 29 CB 0A 80 03 00 00 00` |

`LPF Off` versus `LPF On 20khz` changes only the final bypass byte outside the scene label. Every adjacent frequency scene changes only the two frequency bytes outside the scene label.

## Frequency

Interior controlled values follow the same high-resolution coordinate already established for PEQ and HPF:

```text
raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)
```

The observed 20 kHz maximum is `0xDD2E`, one code above the simple floor result. The editor therefore reproduces that endpoint explicitly rather than extrapolating it.

The current writer range is:

```text
20 Hz ... 20,000 Hz
```

## Bypass / enable

```text
state +10 = 00  -> active / On
state +10 = 01  -> bypassed / Off
```

## Preserved filter-shape/state bytes

The controlled LPF scenes leave bytes `+1..+2` and `+5..+9` unchanged. They are not assumed to be constants: the real `Jaylen Aug 15` event show contains legitimate variation in bytes `+5..+6` (for example `0A 80` and `0D 00`).

That region may contain slope, width/Q, filter model or related state, but it remains intentionally read-only until controlled experiments isolate it.

## Writer boundary

The LPF writer modifies only:

```text
state +3..+4   frequency
state +10      bypass
```

It preserves every other byte exactly.
