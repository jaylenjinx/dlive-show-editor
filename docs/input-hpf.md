# Input high-pass filter (HPF)

> Status: **verified write for frequency and bypass**. These notes are unofficial reverse-engineering observations for dLive 2.12.

A second real event show (`Jaylen Aug 15`) plus an independent ConsoleFlip conversion preview resolves the current five-byte input-HPF state layout.

```text
Highpass Filter Input Channel NN\0
03 FF FF MM BB
│  └─┬─┘ │  └─ bypass: 00 active/on, 01 bypassed/off
│    │   └──── unknown mode/state byte — preserve exactly
│    └──────── frequency coordinate
└───────────── observed HPF discriminator/type
```

For channels 01–99 the payload is one byte shorter than channels 100–128 because the decimal channel label grows by one character. The state after the NUL-terminated label remains exactly five bytes.

## Field map

| State offset | Meaning | Type / transform | Confidence | Write |
|---:|---|---|---|---|
| `+0` | HPF discriminator/type | `uint8`, observed `03` | Decoded/parser guard | No |
| `+1..+2` | HPF frequency | `uint16_be`, logarithmic coordinate | **Verified write** | **Yes** |
| `+3` | unknown mode/state | `uint8`; usually `00`, real `01` observed | Unknown | No |
| `+4` | HPF bypass | `00` active/on, `01` bypassed/off | **Verified write** | **Yes** |

## Frequency

HPF uses the same high-resolution coordinate already proven for input PEQ:

```text
raw = floor(4608 × log2(f / 4))
f   = 4 × 2^(raw / 4608)
```

Examples from the real event show include:

```text
46 96  -> about 61 Hz
53 96  -> 100 Hz
65 96  -> 200 Hz
67 96  -> about 216 Hz
```

The supported editor range is 20–2000 Hz, matching the dLive live-control range documented independently by `togrupe/dlive-midi-tools`.

## Bypass / enable

The final byte is now independently resolved:

```text
00 = active / On
01 = bypassed / Off
```

The ConsoleFlip preview rendered 108 visible input-channel cards from the event show. All 108 agreed with both the native bypass byte and this project's decoded rounded HPF frequency.

## Unknown byte 3

Earlier work incorrectly treated state byte `+3` as the enable candidate because the first reference show contained only zeros there. The event archive disproves that assumption: at least one current-format scene contains `01` at byte `+3` while the actual HPF bypass state is still encoded by byte `+4`.

Its semantic purpose is not yet known. It may represent a mode, slope, or another processor state, but that is only speculation. The editor therefore preserves it exactly.

## Writer boundary

The HPF writer changes only:

```text
state +1..+2   frequency
state +4       bypass
```

It never modifies:

```text
state +0       discriminator/type
state +3       unknown mode/state
```

This narrow write boundary is intentional and is the reason HPF frequency and On/Off can be enabled without claiming the entire HPF record is understood.
