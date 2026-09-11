# RackUltra / AHFX records

**Status:** decoded generally; **verified restricted write for 480 Large / Spaces Pre Delay and Decay Time**.

Eight records are anchored by:

```text
AHFX Manager 01
...
AHFX Manager 08
```

In the current 2.12 reference show, each AHFX payload is 262 bytes. Including the 2-byte length prefix, a record occupies 264 bytes.

## Observed engine IDs

| ID | Observed model family |
|---|---|
| `1c03` | Spaces / 480 Large family |
| `1c04` | Spaces / 480 Medium family |
| `1d00` | Plate Reverb Designer |
| `2d00` | Rhythm Delay |
| `2b00` | Saturator |
| `2a00` | Amp/Cab |
| `2400` | Shifter |
| `2300` | Dual Harmony |
| `1e00` | Tuner |
| `2800` | Gridder |

The editor exposes record offset, size, engine ID, stored preset label and same-engine byte differences for every RackUltra record. DSP writes remain disabled by default unless a field has an independently controlled mapping.

## 480 Large / Spaces (`1c03`) — verified writes

Controlled UFX1 scenes isolate two DSP parameters.

### Pre Delay

```text
state +30..31
payload +46..47
raw = 0x8000 + 16 * preDelay_ms
```

Controlled anchors:

| Pre Delay | Raw |
|---:|---:|
| `0 ms` | `80 00` |
| `85 ms` | `85 50` |
| `170 ms` | `8A A0` |

The writer is guarded to engine `1c03`, the observed 262-byte payload and the directly established `0…170 ms` range. The UI uses integer-millisecond values.

### Decay Time

```text
state +58..59
payload +74..75
```

Controlled anchors:

| Decay | Raw |
|---:|---:|
| `0.10 s` | `74 5E` |
| `≈2.45 s` | `94 B2` |
| `≈60 s` | `B5 07` |

The raw coordinate follows the same logarithmic-time family seen elsewhere in dLive processing, but only these three exact words are writable for now. Intermediate decay values are not guessed.

All other RackUltra DSP bytes and other engine families remain decoded/read-only until their own controlled parameter sweeps are available.
