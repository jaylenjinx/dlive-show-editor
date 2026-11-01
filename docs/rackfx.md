# RackFX (RackExtra) units

**Status:** factory library presets writable; per-engine parameters not decoded.

RackFX units 1–16 are `FX Manager NN` records in the StageBox scene, 124-byte state:

| Offset | Field |
|---|---|
| `+0` | discriminator `07` |
| `+1` | `00` |
| `+2` | engine / model id (e.g. `02`/`03` SMR halls and chambers, `04` EMT, `23` Stereo Tap, `22` BBD, `09` ADT, `0E` Gated Verb, `08` Chorus, `15` De-Esser, `1F` Transient Controller, `1C` Dynamic EQ, `1E`/`1D` multiband comps) |
| `+3..19` | preset name, 17 bytes, space padded |
| `+20…` | engine parameters, layout per engine |

`FX Manager NN` is also a substring of the RackUltra `AHFX Manager NN` labels, so record lookups must skip matches preceded by `AH`.

## Factory library

All 129 factory presets (20 categories: Reverbs, Stereo Tap Delay, Bucket Brigade, Echo, ADT, Chorus, Flange, Phaser, Symphonic, Sub Harmonics, Gated Verb, Pitch Shift, Rotary Speaker, De-Esser, Dynamic EQ, Multi Band Comp 3 and 4, Transient Controller, Dimension Chorus, Empty Rack) were recalled in Director 2.12 into units 1–8, eight per stored scene (2026-11-02, scenes 304–320), and every unit's stored name was checked against the preset recalled into it.

A recall rewrites only that unit's `FX Manager` record (full-scene diff), so writing a captured state is equivalent to a library Recall. The FX tab lists every unit with a preset picker (`loadRackFxPreset(unit, name)`).

## Typed parameters (sample)

SMR reverb pre-delay (unit 1, `+30..31`) moved `80F7 → 8280` when 15 ms was retyped as 40 ms: `raw = 0x8000 + ms×16`, the same coordinate as the RackUltra Spaces pre-delay. Most RackFX controls are knobs with no numeric entry in Director, so their scales are not mapped.
