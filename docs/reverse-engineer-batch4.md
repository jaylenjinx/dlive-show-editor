# ReverseEngineer batch 4 — RackUltra 480 Large / Spaces

Source: controlled scenes added in `ReverseEngineer.tar(4).gz` after the previous batch. Compared with batch 3, this archive adds 43 StageBox scenes, all focused on UFX1 / RackUltra engine `1c03`.

For every adjacent pair within the groups below, the complete StageBox scene changes only the scene-name bytes plus the listed AHFX field. The `AHFX Manager 01` payload is 262 bytes. `state +N` below is relative to the byte immediately after the `AHFX Manager 01\0` label; `payload +N` is relative to the beginning of the AHFX payload.

## Cut filters

### Low Cut

| Scene | Raw | Offset |
|---|---:|---:|
| `UFX LC 20` | `29 CB` | `state +76..77`, payload `+92..93` |
| `UFX LC 500hz` | `7D 62` | same |
| `UFX LC MAX 1khx` | `8F 63` | same |

The values are in the same logarithmic frequency-coordinate family used elsewhere in dLive, but the 1 kHz stored word is one count above the simple floor transform. The writer therefore uses exact observed anchors.

### High Cut

| Scene | Raw | Offset |
|---|---:|---:|
| `UFX HC 1K` | `8F 63` | `state +78..79`, payload `+94..95` |
| `UFX HC 10K` | `CB 2D` | same |
| `UFX HC 20K` | `DD 2E` | same |

Again, exact anchors are used for writes.

## Space / model selector

`state +29` / payload `+45` is an exact one-byte enum:

| Raw | Controlled scene |
|---:|---|
| `10` | Large Hall |
| `20` | Medium Hall |
| `30` | Small Hall |
| `40` | Room |
| `60` | Classic Large |
| `50` | Classic Medium |
| `70` | Classic Small |
| `80` | Classic Room |

Every adjacent model scene changes only this byte.

## Size Link

`state +147` / payload `+163`:

```text
10 = On
00 = Off
```

## Linear 1/16-unit fields

Four controls independently prove the same unsigned coordinate:

```text
raw = 0x8000 + 16 * value
value = (raw - 0x8000) / 16
```

| Control | Offset | Controlled anchors | Raw anchors |
|---|---:|---|---|
| Width | `state +60..61` | 1, 15, 30 | `8010`, `80F0`, `81E0` |
| Length | `state +62..63` | 1, 20, 35 | `8010`, `8140`, `8230` |
| DS | `state +42..43` | 0, 50, 100 | `8000`, `8320`, `8640` |
| Spread | `state +122..123` | 0, 50, 100 | `8000`, `8320`, `8640` |

The editor exposes continuous integer values only across the directly observed ranges.

`DS` is retained as the scene abbreviation because the binary evidence does not establish the full UI label.

## EL / LL / SL anchor tables

These three controls are proven as distinct 16-bit fields, but the scene names only establish qualitative Low/Mid/High positions.

### EL — `state +68..69`

| Position | Raw |
|---|---:|
| Low | `6C00` |
| Mid | `7646` |
| High | `8000` |

### LL — `state +70..71`

| Position | Raw |
|---|---:|
| Low | `6C00` |
| Medium | `767E` |
| High | `8000` |

### SL — `state +94..95`

| Position | Raw |
|---|---:|
| Low | `6C00` |
| Mid | `7B69` |
| High | `8A00` |

The editor writes only these exact anchors until the underlying numeric scales and full UI labels are established.

## Echo toggles

Three clean one-byte toggles use the same `10 / 00` convention:

| Control | Offset | In / On | Out / Off |
|---|---:|---:|---:|
| Echo section | `state +125` / payload `+141` | `10` | `00` |
| Echo 1 | `state +127` / payload `+143` | `10` | `00` |
| Echo 2 | `state +133` / payload `+149` | `10` | `00` |

## Existing engine `1c03` mappings retained

The previous batch already established:

- Pre Delay: `state +30..31`, `raw = 0x8000 + 16 * milliseconds`, controlled 0–170 ms.
- Decay Time: `state +58..59`, exact controlled anchors `745E`, `94B2`, `B507`.

Together, batches 3 and 4 now provide a sizeable writable subset of the 480 Large / Spaces engine while leaving every unmapped byte and every other RackUltra engine untouched.
