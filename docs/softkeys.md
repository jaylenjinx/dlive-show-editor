# Softkey assignments (Surface Soft Controls)

**Status:** verified write for the functions listed below; other functions are read-only (unknown codes are preserved and the record is left untouched).

Softkeys live in each SurfaceScene as the `Surface Soft Controls` record. Decoded from controlled Director 2.12 edits on a C1500 (Surface › Control › SoftKeys), one function at a time on Soft 17 with a scene stored after each change.

```text
state = [nBanks=02] [u16 entryCount=26] [u16 entryCount=26] block0 block1
```

Director writes the same 26 entries to both blocks. Soft 20–26 are unavailable on a C1500 and stay Unused. The record length prefix (uint16) covers label + state and changes as entries grow, so the record is rebuilt rather than patched in place. Entries are variable length: `[function][01][arg-class][sub][payload…]`.

| Function | Entry bytes | Notes |
|---|---|---|
| Unused | `00 01 00 01` | |
| Mix | `04 01 04 01 tt ii` | `tt` = strip type (`04` Mono Aux, `0D` DCA, …), `ii` zero-based |
| Mute | `02 01 01 01 tt ii` / inverted `01 01 02 01 tt ii` | |
| Sel | `03 01 02 01 tt ii` | |
| Mute Group n | `15 01 01 01 0D 17+n` / inverted `16 01 02 01 0D 17+n` | mute groups index after the 24 DCAs |
| PAFL Clear | `0F 01 03 02 00 00` | |
| Peak Hold Reset | `1C 01 03 01` | |
| DCA/MCA Spill Active | `17 01 05 01` | |
| Tap Tempo | `0C 01 03 02 G U u R` | `G` Global, `U` UFX (0 = FX), `u` unit−1, `R` 1 = Left / 0 = Right |
| Scene Go | `10 01 02 01 A` | `A` = Auto Increment |
| Scene Store / New / Update / Next / Previous | `11 01 02 02 0/1/2/3/4` | |
| Scene Specific Recall | `0D 01 02 01 SS SS` | `SSSS` = scene − 1 (u16) |
| PAFL | `05 01 03 01 tt ii 02 00 00` | |
| Level Up / Down | `07`/`08 01 02 01 tt ii 01 MIN MIN MAX MAX` | levels use the fader coordinate `0x8000 + dB×256`, −∞ = `0000` |
| Set Level | `2F 01 04 01 00 00 01 tt ii LL LL` | |
| Fader Start / Fader On-Off | `1A`/`19 01 01 01 tt ii` | |
| MCA On/Off Specific DCA | `22 01 03 01 tt ii` | |
| Talkback Assign | `0B 01 02 01 tt ii` | |
| Talkback Group | `1F 01 00 02 gg LL` | `gg` = group − 1, `LL` latching (01 on) |
| Send Level Up | `09 01 04 01 st si 01 MIN MIN MAX MAX 01 rt ri` | send channel `st si`, receiving mix `rt ri` |
| Set Send Level | `30 01 04 01 rt ri 01 st si LL LL` | |
| Set Bypass UFX | `34 01 02 01 uu 00` | `uu` = unit − 1 |
| AMM Control (In/Out) | `18 01 02 01 00 nn 00` | `nn` = AMM − 1 |
| Channel Processing | `2A 01 02 01 ff tt ii` | `ff`: 01 Preamp Model, 02 LPF, 03 HPF, 04 Gate, 05 Insert A, 06 Insert B, 07 Compressor, 08 PEQ (In/Out) |
| Assign On/Off | `1D 01 04 01 st si 01 dt di` / inverted `23 01 01 01 st si 01 dt di` | source then destination |

The second batch (scene recall number, PAFL, levels, talkback, send levels, UFX bypass, AMM, channel processing) was decoded on 2026-11-01 on an S5000 surface, which uses the same 26-entry record.

Scenes stored for other surface types use additional function codes; those records fail to parse and are not written.

Editor API: `parseSoftKeys(dat)`, `softKeyEntry.*` builders and `setSoftKeys(list)` in `app-softkeys.js`.
