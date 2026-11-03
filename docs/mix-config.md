# Mix Config: what a reconfiguration touches

**Status:** layout rules derived from a corpus of 66 real dLive shows (28 distinct `MixConfig.dat` values, more per scene, show format versions 12–14); not yet checked against a Director reconfiguration. Nothing here is writable yet.

`MixConfig.dat` itself is decoded (see [KNOWN_FORMAT.md](../KNOWN_FORMAT.md#6-mixconfigdat--decoded-read-only)). Changing it means re-laying out every record whose shape follows the bus counts.

## Each scene carries its own layout

A scene keeps the layout it was stored with. Shows reconfigured after some scenes were stored contain scenes whose `Input Mixer` / `Mix Mixer` headers differ from the show's `MixConfig.dat`. The per-scene header, not the show file, is the authority for that scene's layout.

Scene mixer headers use the order `[version, monoGrp, stGrp, monoFX, stFX, monoAux, stAux, monoMtx, stMtx, mainBlocks, mainStrips(, PAFL)]` — mono matrices first, unlike `MixConfig.dat`. `mainBlocks` is not the `MixConfig` Main type: the corpus has None → 0, LR → 1, LCR+ → 3, 5.1 → 6. LR+Msum, LR+M and LCR were not in the corpus.

## Records whose size follows the config

Every instance in the corpus (4,260 records) matches these rules exactly.

| Record | Size |
|---|---|
| `Input Mixer` | 12 + 128 × block |
| `FX Return Mixer` | 12 + 32 × block |
| `AHFX Return Mixer` | 12 + 16 × block |
| `Mix Mixer` | see below |

*block* is the existing per-channel layout in `input_mixer_layout()` ([input-mixer.md](input-mixer.md)): one assign byte per group, 4-byte mono / 5-byte stereo sends, a 47-byte Main section, then 8 UFX sends from version 3. FX returns (16 stereo = 32 legs) and UFX returns (16) use the same block as inputs.

### Mix Mixer

11-byte header (no PAFL byte), then one block per mix that has sends, every send entry 5 bytes:

| Blocks | Count | Contents |
|---|---|---|
| Groups | mono + stereo groups | a send to every FX send, aux and matrix · *v4:* G + 1 bytes (G = group count) · 48-byte section · *v3+:* 8 UFX sends |
| Auxes | mono + stereo auxes | a send to every matrix · 48-byte section |
| Main | `mainBlocks` | a send to every matrix · 48-byte section |
| Matrices | mono + stereo matrices | 48-byte section |

A stereo bus is one block. FX sends have no block. The v4 `G + 1` bytes are new in the current firmware (probably group-to-group assigns — to confirm in Director). The order of send entries inside a group block is assumed to match the Input Mixer (mono FX, mono Aux, stereo FX, stereo Aux, mono Mtx, stereo Mtx); the corpus only shows that stereo auxes come after mono auxes.

Python: `tools/dlive_re.py` `mix_mixer_layout(header)`.

## Records that exist once per bus

Per-bus records (`Compressor,` `Parametric EQ,` `Graphic EQ,` `Mix Delay,` `Insert,` `Digital Attenuator,` `Compressor side chain source,` `Send Source Select,` …) appear once per mono bus and once per stereo leg (`… Left` / `… Right`). Their size does not depend on the config. A reconfiguration adds or removes them. In the scene they run in this order:

mono groups → stereo group legs → mono auxes → stereo aux legs → Main legs → mono matrices → stereo matrix legs

## Records that do not change size

`Channel Mapper` and `Channel Ganging` have one fixed size per record version, whatever the config (bus insert tables already reserve 64 entries per bus type). Their contents still refer to buses by index.

## Scene recall block and Global Safes

Each StageBox scene starts with a ~122 KB block (from offset ~324) laid out like `StageBoxSceneSafes.dat` — version byte, a copy of the 13-byte MixConfig, 128 input blocks, then mix legs. Its size is fixed, so a reconfiguration moves mix legs between fixed slots rather than resizing. Its embedded MixConfig copy does not always match the scene's mixer headers.

## Show-level text files

- `FollowPanSettings.dat` — CSV list of `type,index,a,b` rows, one per stereo aux (type 5), stereo FX send (7), UFX send (19, always 8) and stereo matrix (11). It has to be rebuilt.
- `PAFLSettings.dat` and `InputProcessingOrdering.dat` vary in size between shows; not yet tied to the config.

## Still to check in Director

1. Mix Mixer send order inside a group block, and what the v4 `G + 1` bytes are.
2. `mainBlocks` for LR+Msum, LR+M and LCR.
3. Mix-leg order in the recall block and Global Safes for another config.
4. What Director does to existing per-bus settings (names, processing, sends) when counts change — kept by index, or reset.
5. Surface scenes and bank layouts that point at buses.
