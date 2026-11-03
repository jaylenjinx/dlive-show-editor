# Mix Config: converting a show to a different Mixer Config

**Status:** verified conversion (Python reference, `tools/mixconfig_convert.py`). Layout rules come from a corpus of 66 real dLive shows; the conversion was then checked against Director 2.12 reconfigurations on 2026-11-04. The JavaScript editor does not use it yet.

`MixConfig.dat` itself is decoded (see [KNOWN_FORMAT.md](../KNOWN_FORMAT.md#6-mixconfigdat--decoded-read-only)). Changing it means re-laying out every record whose shape follows the bus counts.

## What Director does

Each experiment stored a scene, reconfigured *MixRack › Config › Mixer Config*, recalled the old scene and stored the result, so Director's own conversion could be compared with the original.

- **Settings follow the bus, not the position.** Every send, assign, name and processing record is kept under its bus identity (Stereo Group 3 stays Stereo Group 3 when mono groups are added in front of it). Buses that no longer exist are dropped; new buses get defaults.
- **Stored scenes are not rewritten.** Director keeps each stored scene in the layout it was stored with and converts it when it is recalled. Only the live scene changes at reconfiguration time.
- **Surface scenes don't change.**
- **Main strip names:** a live reconfiguration renames Main strips to the new type's defaults (`C`, `M`, `Msum`, `L`/`R`/`LFE`/`sL`/`sR`). A recalled scene keeps its own names, and so does the converter.

`tools/mixconfig_convert.py` reproduces Director's conversion byte for byte. It was checked on 101 → LCR + 2 mono groups, 101 → one more bus of every kind, and the reverse direction (removing mono groups, LCR → 5.1). The only bytes that differ are the scene name and leftover characters after a name's terminator, which Director never reads. For whole shows, every show-level file Director rewrote (`MixConfig.dat`, `FollowPanSettings.dat`, all six `StageBox*SceneSafes*.dat`) also matched. Across the 1,158 current-format scenes on the USB corpus, converting to their own config is a no-op and a round trip through a bigger config returns the original bytes. Scenes from older firmware (Input Mixer v2, 400 in the corpus) use a different record order and are refused.

```bash
python tools/mixconfig_convert.py IN.tar.gz OUT.tar.gz --groups 2/8 --fx 8/0 --aux 6/4 --matrix 2/2 --main LCR [--individual] [--pafl 1] [--keep-scenes]
```

`--keep-scenes` leaves stored scenes in their old layout, as Director does. By default they are converted too, which Director also reads.

## Scene headers

A scene keeps the layout it was stored with, so the per-scene header, not the show file, is the authority for that scene's layout.

| Record | Header |
|---|---|
| `Input Mixer`, `FX Return Mixer`, `AHFX Return Mixer` | `[version, monoGrp, stGrp, monoFX, stFX, monoAux, stAux, monoMtx, stMtx, mainType, combined, PAFL]` |
| `Mix Mixer` | `[version, monoGrp, stGrp, monoFX, stFX, monoAux, stAux, monoMtx, stMtx, mainBlocks, combined]` |

`mainType` uses the `MixConfig.dat` codes (0 None, 1 LR, 2 LR+Msum, 3 LR+M, 4 LCR, 5 5.1, 6 LCR+). `combined` is the Main Channel Strips switch (1 Combined, 0 Individual).

### Main types

| Main | Mix channels | Main legs (Combined) | Main legs (Individual) | `mainBlocks` C / I |
|---|---:|---|---|---|
| None | 0 | — | — | 0 / 0 |
| LR | 2 | 01 L/R | 01, 02 | 1 / 2 |
| LR+Msum, LR+M, LCR, LCR+ | 4 | 01 L/R, 03, 04 | 01–04 | 2 / 3 |
| 5.1 | 6 | 01 L/R, 03, 04, 05 L/R | 01–06 | 4 / 6 |

Verified in Director for every Combined type and for LR, LCR and 5.1 Individual. LR+Msum, LR+M and LCR+ Individual are assumed to match LCR. The fourth leg of the 4-channel types has no Mix Mixer block.

## Mixer records

| Record | Size |
|---|---|
| `Input Mixer` | 12 + 128 × block |
| `FX Return Mixer` | 12 + 32 × block |
| `AHFX Return Mixer` | 12 + 16 × block |
| `Mix Mixer` | see below |

*block* is the per-channel layout in `input_mixer_layout()` ([input-mixer.md](input-mixer.md)): one assign byte per group, 4-byte mono / 5-byte stereo sends (mono FX, mono Aux, stereo FX, stereo Aux, mono Mtx, stereo Mtx), a 47-byte Main section, then 8 UFX sends. New sends default to `01 00 80 01` (+ `25` for stereo); new group assigns to `00`.

### Mix Mixer

11-byte header, then (every send entry 5 bytes, `[on, pre, level_i16, pan]`):

| Blocks | Count | Contents |
|---|---|---|
| Groups | mono + stereo groups | sends to every FX send, aux and matrix (Input Mixer order) · one Group-to-Group assign byte per group · Grp To Grp Send Point (`03` = Post Delay) · 48-byte section |
| Auxes | mono + stereo auxes | a send to every matrix · 48-byte section |
| Main | `mainBlocks` | a send to every matrix · 48-byte section |
| Matrices | mono + stereo matrices | 48-byte section |
| UFX sends | 8 per group | after all blocks |

The Group-to-Group bytes sit in the *source* group's block: Routing › Group on Stereo Group 1, assigning Stereo Group 3, set byte 0 of group 3's assign bytes. The 48-byte section defaults to `00 00 00 80 01 25 00 xx 4a 80 01 00 00 25` then zeros, with `xx` = `01` for mono buses and every Main block except the surround pair of a combined 5.1 Main, `00` for stereo buses.

Python: `tools/dlive_re.py` `mix_mixer_layout(header)`.

## Per-bus records

All per-bus records sit at the start of the scene's record list:

1. `Parametric EQ`, then `Graphic EQ`, then `Compressor`, each for every leg;
2. `Mix Delay`, `Digital Attenuator`, `Compressor side chain source`, `Insert` for each leg in turn;
3. `Send Source Select` for groups, FX sends, auxes and Main legs.

Legs run mono groups → stereo group legs → mono auxes → stereo aux legs → Main legs → mono matrices → stereo matrix legs (for `Send Source Select`: groups → mono FX → mono aux → stereo FX → stereo aux → Main). Labels: `Compressor, Stereo Group Channel 01 Left`, `Compressor, Mono Aux Channel 01 ` (trailing space), `Send Source Select, Mono FX 01 `.

New records take one default state per family (`tools/mixconfig_defaults.hex`), except `Compressor side chain source`, which defaults to the bus itself: `01 <type> <index − 1>` with type `02` Mono Group, `03` Stereo Group, `04` Mono Aux, `05` Stereo Aux, `08` Main, `0A` Mono Matrix, `0B` Stereo Matrix (inputs are `01`).

## The 64 mix-channel slots

Tables indexed by mix channel use one slot per mono bus or stereo leg, in this order:

mono groups → stereo group legs → mono FX → mono auxes → stereo FX legs → stereo aux legs → Main channels → PAFL legs → mono matrices → stereo matrix legs

- **Talkback groups** (`Channel Mapper`): each is a flag byte, a 19-byte name (`Talkback Group N`), then 64 two-byte slots, `[type, index]` on a mono slot or a stereo L slot.
- **Global Safes** and each scene's **recall block** (from scene offset 327, same layout as `StageBoxSceneSafes.dat`): 518-byte mix legs from `+66704`. The leg order matches [scene-safes.md](scene-safes.md). Only all-default legs have been converted so far.

## Scene file framing

- The scene's embedded MixConfig copy at offset 330 is rewritten with the new config; scenes stored before any reconfiguration hold zeros there.
- The 4 bytes before the first record are a big-endian u32: file size − first-record offset − 1. Empty scenes (122,426 bytes) have no records and are left alone.

## Show-level files

- `MixConfig.dat` — the new config.
- `FollowPanSettings.dat` — `1`, then a `type,index,follow,0` row per stereo aux (5), stereo FX send (7), UFX send (19, always 8) and stereo matrix (11). Existing rows are kept by type and index.
- `StageBoxSceneSafes.dat`, `StageBoxRoleSceneSafes0–4.dat` — MixConfig copy at `+3` plus mix legs by slot.

No other show file changed when Director reconfigured.

## Not yet covered

- Mix-leg safes and recall filters that are actually set (the slot order is from [scene-safes.md](scene-safes.md), but no set leg has been converted yet).
- Outputs, inserts, sidechains or DCA/mute assignments that point at a bus that is removed.
- The JavaScript editor (Console UI / Show Files) does not offer a Mixer Config change yet.
