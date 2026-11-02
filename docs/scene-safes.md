# Global Scene Safes

**Status:** verified write for input safes (every Global Safes column except Routing); mix blocks located, read-only.

Global scene safes (Scenes › Global Safes in Director) are not stored in the scenes. They live in the show-level file `Show/SceneSafes/StageBoxSceneSafes.dat`, one byte per safe (`00` off, `01` on). The `StageBoxRoleSceneSafes0–4` files hold the same layout per user role; `SurfaceSceneSafes.dat` (580 bytes) did not change for any input or mix safe.

Decoded on 2026-11-03 from Director 2.12 test shows RSAFE0–16, each stored after one Global Safes grid change (12 inputs or one mix row at a time).

## Layout (version `15`, 122,093 bytes)

| Offset | Contents |
|---|---|
| `+0..2` | `01 01 15` (`15` = file version; older shows have `14`, 117,933 bytes, or `11`) |
| `+3..15` | copy of the 13-byte MixConfig |
| `+16 + 521×(n−1)` | Input `n` block (128 inputs) |
| `+66704 + 518×k` | mix leg `k`, in mix-config order |

## Input block

| Column | Offsets in the block |
|---|---|
| Level | `+0` |
| Mute | `+1` |
| Pan | `+2` |
| Routing | per-send flags: odd offsets `+3…+17`, `+115…+177`, `+397…+411` and `+485…+508`, only for buses that exist |
| Main On | `+451` |
| IEM / Wedge | `+452` |
| DCA & Mute Grp | `+453…+484` (24 DCAs + 8 mute groups) |
| Name & Colour | `+509` |
| Processing | `+510`, `+512…+518`, `+520` |
| Direct Out | `+519` |

Safing Processing on inputs 25–36 also set 6 bytes past the input and mix blocks (`116955…116977`), probably linked units; the editor writes only the input block. Routing is read-only in the editor because its flags depend on the bus configuration.

## Mix blocks

Mix legs are 518-byte blocks after the inputs: Level `+0`, Mute `+1`, Name & Colour `+509`, the same as inputs. In the test config (0 mono / 8 stereo groups, 8 mono FX, 6 mono / 4 stereo auxes, 5.1 Main, 2 mono / 2 stereo matrices, PAFL 1), Stereo Group 1 L was block 0, Mono Aux 1 block 24 and Mono Matrix 1 block 46. That fits the order groups → FX sends → auxes → stereo aux legs → Main legs → PAFL → matrices, but the order hasn't been tested on other configs, so mix safes are not written.

Editor API (`app-scene-safes.js`): `inputSafes(ch)` → `{processing, mute, level, mainOn, pan, routing, directOut, iemWedge, dcaMute, name}` each `'on' | 'off' | 'partial'`; `setInputSafe(ch, key, on)`. Console UI › Inputs › Safes.
