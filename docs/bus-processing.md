# Group, Aux and Matrix processing

Source: `RevEngBus` (Director 2.12). Each control was changed on one bus and the stored scene diffed against a baseline.

| Record family | State size | Confirmed on |
|---|---:|---|
| `Compressor, <bus> Channel NN` | 127 | Mono Aux 1, Mono Group 1, Mono Matrix 1 |
| `Parametric EQ, <bus> Channel NN` | 38 | Mono Aux 1, Mono Group 1, Mono Matrix 1 |
| `Mix Delay, <bus> Channel NN` | 4 | Mono Aux 1, Mono Group 1, Mono Matrix 1, Stereo Aux 1, Main LR |

Every changed offset equals the input-channel layout:

- **Compressor**: On `+2`, threshold `+8..9` (int16/256), attack `+10..11`, release `+12..13` (`time_log`), ratio `+15` (41-step table), makeup `+16..17`, knee `+18`.
- **PEQ**: band *n* at `+1 + 9(n−1)` = gain `int16/256`, frequency `freq_log`, width; In/Out at `+37` (`00` In).
- **Mix Delay**: `+1..2` = `ms × 96`, `+3` bypass (`00` In). Director accepts **0–400 ms** on buses (input delay stops at 340).

Mono bus records carry a trailing space before the NUL terminator in their label (`Compressor, Mono Aux Channel 01 `). Stereo buses have separate `… Left` and `… Right` records, which Director edits together: changing Stereo Aux 1 delay changed both. The editor's **Buses** tab therefore writes both records.

Bus Graphic EQ, Insert A (see `patching.md`) and the compressor side-chain source are mapped below. Not mapped for buses: Digital Attenuator, Send Source Select. Ext In *Trim* on the Overview page did not change any scene byte. 
## Main (master)

With Main type **None** there are no Main processing records. After switching Director to **LR+M** they appear as `Main Channel 01 Left/Right` (the stereo LR pair), `Main Channel 03` (the mono M) and `Main Channel 04`, each with the same Compressor (127), Mix Delay (4), Graphic EQ (169), Digital Attenuator (5), Insert (3) and PEQ (38) states. Verified with changes on Main LR (comp ratio, threshold, PEQ band gain, delay — Left and Right changed together) and Main M (comp ratio, threshold, PEQ gain); `Main Channel 04` was not exercised. Main is reached in Director by assigning *Main (LR)* / *Main (M)* to a bank strip in Surface → Strip Assign.

## Graphic EQ ("NEQ" tab) — verified write

`Graphic EQ, {Mono|Stereo} {Group|Aux|Matrix|Main} Channel NN [Left|Right]`, 169-byte state. Decoded on Mono Aux 1 (2026-11-01, scenes 281–297): fader drags, the type menu, the In button and NEQ12 band fields.

| Offset | Field | Encoding |
|---|---|---|
| `+0` | discriminator | `03` |
| `+1..56` | 28 graphic band gains, 31 Hz … 16 kHz | uint16, `0x8000 + dB×256`, ±12 dB (+8.32 dB stored `8853`, +4.16 `8429`, −8.32 `77AD`) |
| `+57` | In/Out | `00` In, `01` Out |
| `+58` | Type | `00` Constant-Q, `01` Proportional-Q, `02` Digi-GEQ, `03` Hybrid, `04` NEQ12 |
| `+59 + 9×(b−1)` | NEQ12 band `b` (1–12) | `[gain int16 dB×256][freq u16 freq_log][width u8][3 unmapped][Out u8]` |

NEQ12 band gains use the signed PEQ coordinate (`0000` = 0 dB, −3 dB = `FCFD`), unlike the graphic bands. Width (`+4` within each band) is an index into the PEQ width table: 1.5 oct `00`, 1 `05`, 0.6 `0D`, 0.3 `13`, 1/9 `18` (typed values above 1.5 clamp to 1.5; scenes 353–358). Band 1's shape buttons write `+6`: bell `00`, the first shape button `01`, the 12 dB slope `04`; the other shape values and bytes `+5`/`+7` are not mapped. Selecting NEQ12 in Director zeroes the 28 graphic gains; the editor does not, so switch back and forth in Director if that matters.
