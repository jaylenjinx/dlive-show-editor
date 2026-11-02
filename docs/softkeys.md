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

Third batch (2026-11-03, S5000, scenes 113–140), default settings plus one variant where Director allowed it:

| Function | Entry bytes | Notes |
|---|---|---|
| Send Level Down | `0A 01 04 01 st si 01 MIN MIN MAX MAX 01 rt ri` | same layout as Send Level Up |
| Sel Mix PAFL Scene | `12 01 03 01 tt ii 02 00 00 00 SS SS` | `FFFF` = No Scene; other bytes not varied |
| SIP | `1E 01 06 01` | |
| MCA On/Off Selected DCAs / All DCAs | `20 01 03 01` / `21 01 04 01` | |
| ABCD Set All | `24 01 02 01 S` | `S`: 00 Disable ABCD, 01–04 Source A–D |
| ABCD Set Channel | `25 01 02 01 ii S` | input index zero-based |
| PAFL - Surface Number | `26 01 03 01 nn` | PAFL − 1 |
| ABCD Set Range | `28 01 02 01 start end S` | default only |
| ABCD Set For DCA | `29 01 02 01 dd S` | default only |
| Virtual Sound Check | `2B 01 02 01 M` | 00 Inactive, 02 Virtual SoundCheck (01 Record Send, not captured) |
| USB Play/Record | `2C 01 02 01 M` | 00 Stop, 01 Play / Pause, 02 Record |
| Talkback Additive Groups | `2D 01 02 01` | |
| Assign Range | `2E 01 04 01 st start end 01 00 dt di` | sends `start`…`end` of type `st` → destination; a USB-corpus show uses inputs 1–47 → Mute Group 1 (`0D 18`) |
| Channel Processing Range | `31 01 02 01 tt start end 01 02 ff` | `02` = Set Off (default mode); `ff` as for Channel Processing |

Variable-length functions are recognised but not parsed: Custom MIDI (`0E`, MIDI bytes), Bookmark (`27`, a page path such as `Processing/Overview`), Strip Assign Recall (`32`, library names) and Action Recall (`33`, mode `00` Toggle / `02` Recall followed by two NUL-terminated action names in older shows; Director 2.12 adds 36 more bytes). A record containing one of these is read-only.

Byte 4 of an entry is its format. Older shows store Tap Tempo with format `01` and no Left/Right byte (`0C 01 03 01 G U u`, 7 bytes). With that and the codes above, 1,413 of 1,555 softkey records from 66 real shows parse; the rest contain Action Recall or Bookmark entries.

Editor API: `parseSoftKeys(dat)`, `softKeyEntry.*` builders and `setSoftKeys(list)` in `app-softkeys.js`.
