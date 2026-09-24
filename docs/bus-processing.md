# Group, Aux and Matrix processing

Source: `RevEngBus` (Director 2.12). Each control was changed on one bus and the stored scene diffed against a baseline.

| Record family | State size | Confirmed on |
|---|---:|---|
| `Compressor, <bus> Channel NN` | 127 | Mono Aux 1, Mono Group 1, Mono Matrix 1 |
| `Parametric EQ, <bus> Channel NN` | 38 | Mono Aux 1, Mono Group 1, Mono Matrix 1 |
| `Mix Delay, <bus> Channel NN` | 4 | Mono Aux 1, Mono Group 1, Mono Matrix 1, Stereo Aux 1 |

Every changed offset equals the input-channel layout:

- **Compressor**: On `+2`, threshold `+8..9` (int16/256), attack `+10..11`, release `+12..13` (`time_log`), ratio `+15` (41-step table), makeup `+16..17`, knee `+18`.
- **PEQ**: band *n* at `+1 + 9(n−1)` = gain `int16/256`, frequency `freq_log`, width; In/Out at `+37` (`00` In).
- **Mix Delay**: `+1..2` = `ms × 96`, `+3` bypass (`00` In). Director accepts **0–400 ms** on buses (input delay stops at 340).

Mono bus records carry a trailing space before the NUL terminator in their label (`Compressor, Mono Aux Channel 01 `). Stereo buses have separate `… Left` and `… Right` records, which Director edits together: changing Stereo Aux 1 delay changed both. The editor's **Buses** tab therefore writes both records.

Not mapped for buses: Graphic EQ (169-byte state), Digital Attenuator, Insert, Compressor side-chain source, Send Source Select. Ext In *Trim* on the Overview page did not change any scene byte. Main/master processing records do not exist in this show's mixer config (Main type None), so masters are not covered.
