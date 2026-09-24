# RevEngRatio — compressor ratio table (Manual RMS / Manual Peak)

Source: 48 automated Director 2.12 scenes (50–98) on input channel 13 (Manual RMS). Each value was typed into the Ratio field on the Comp page, the displayed label read back by OCR, then the scene stored and `Compressor, Input Channel 13` state `+15` read from the stored `.dat`.

## Result

`state +15` is an index into a **41-entry stepped table**, not a continuous coordinate. Typed values snap to the nearest entry (e.g. 9 → 8:1, 15 → 16:1, 30 → 20:1, anything ≥ 60 → ∞).

| Raw | Ratio | Raw | Ratio | Raw | Ratio |
|---:|---:|---:|---:|---:|---:|
| 00 | 1:1 | 0F | 1.9:1 | 1E | 5.5:1 |
| 01 | 1.03:1 | 10 | 2:1 | 1F | 5.7:1 |
| 02 | 1.05:1 | 11 | 2.3:1 | 20 | 6:1 |
| 03 | 1.07:1 | 12 | 2.5:1 | 21 | 7:1 |
| 04 | 1.1:1 | 13 | 2.7:1 | 22 | 8:1 |
| 05 | 1.15:1 | 14 | 3:1 | 23 | 10:1 |
| 06 | 1.2:1 | 15 | 3.3:1 | 24 | 12:1 |
| 07 | 1.25:1 | 16 | 3.5:1 | 25 | 16:1 |
| 08 | 1.3:1 | 17 | 3.7:1 | 26 | 20:1 |
| 09 | 1.35:1 | 18 | 4:1 | 27 | 40:1 |
| 0A | 1.4:1 | 19 | 4.3:1 | 28 | ∞:1 |
| 0B | 1.5:1 | 1A | 4.5:1 | | |
| 0C | 1.6:1 | 1B | 4.7:1 | | |
| 0D | 1.7:1 | 1C | 5:1 | | |
| 0E | 1.8:1 | 1D | 5.3:1 | | |

The seven values the editor previously exposed (1, 2, 4, 12, 20, 40, ∞) all agree with this table. Manual Peak's two cross-checked ratios (2:1 = `10`, 20:1 = `26`) agree too, so it shares the table. Opto uses a different, shorter table (unmapped beyond its 7 known steps).

Display labels for `01`, `03` are rounded by Director (`1.03`, `1.07`); the underlying ratio may be a slightly different value.
