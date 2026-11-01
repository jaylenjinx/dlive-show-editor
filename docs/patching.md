# Input and output patching (Channel Mapper)

**Status:** verified write for input source A and MixRack local output sockets; other output banks decoded, read-only.

Both input source selection and output socket patching live in the StageBox scene's `Channel Mapper` record (10,380-byte state, the same size in every show checked). Decoded on 2026-11-01 from controlled Director 2.12 changes with a DM48 MixRack and an S5000 surface: one change per stored scene (scenes 120–212 of that session).

## Inputs

128 entries of 13 bytes starting at state `+1`:

```text
+0      ABCD enable (00/01)
+1..3   source A  [type][index u16 BE]
+4..6   source B
+7..9   source C
+10..12 source D
```

Input `n` starts at `+1 + 13×(n−1)`. Checked on inputs 1, 2 and 12. Source A is the normal source; B–D are only used when ABCD is enabled and default to `14 00 00`.

| Type | Source | Index |
|---:|---|---|
| `00` | MixRack Sockets | socket − 1 (socket 48 → `2F`) |
| `01` | Surface sockets and ports | one shared range (see below) |
| `02` | MixRack I/O Port 1 | channel − 1 (40 → `27`) |
| `03` | MixRack I/O Port 2 | channel − 1 |
| `04` | MixRack I/O Port 3 | channel − 1 |
| `05` | MixRack DX 1/2 | channel − 1 (9 → `08`) |
| `06` | MixRack DX 3/4 | channel − 1 |
| `1C` | Rack FX | output − 1 |
| `14` | Unassigned | 0 |

On the S5000, surface sources share type `01` with these index starts: Surface Sockets `0`, Surface DX 5/6 `12`, Surface I/O Port 4 `44`, USB `300` (Surface I/O Port 5 is assumed to start at `172`). Other surface models may use different starts.

## Outputs

Each output socket is a 3-byte `[source type][source index u16 BE]` entry. MixRack Local output `n` is at state `+6632 + 3×(n−1)`; checked on sockets 1, 7, 10 and 17, and every socket 1–32 was matched against Director's per-socket "Information" readout.

All output banks (offset of output 1; one controlled MON 1 patch each, sizes from how the tables tile):

| Bank | Offset | Sockets |
|---|---:|---:|
| Surface Local | 3332 | 16 |
| Surface DX 5/6 | 3380 | 32 |
| Surface I/O Port 4 | 3476 | 128 |
| Surface I/O Port 5 | 3860 | 128 |
| Surface USB | 4244 | 2 (assumed) |
| MixRack Local | 6632 | 32 |
| MixRack I/O Port 1 | 6923 | 128 |
| MixRack I/O Port 2 | 7307 | 128 |
| MixRack I/O Port 3 | 7691 | 128 |
| MixRack DX 1/2 | 8075 | 32 |
| MixRack DX 3/4 | 8171 | 32 |
| MixRack ME | 8267 | 40 (assumed) |

Surface Local sockets 1–2 are unavailable on the S5000 used, so socket 3 (`+3338`) located the table. The writer reproduces Director's bytes for I/O Port 2, Surface I/O Port 4 and USB patches.

Source types (stereo sources use index `2×(n−1) + side`, 0 = Left, 1 = Right):

| Type | Source | Example |
|---:|---|---|
| `00` | MixRack input socket (tie line) | default on I/O port outputs |
| `07` | Input direct out | input 1 → `07 00 00`, input 2 → `07 00 01` |
| `0D` | Stereo Group | St Grp 1 L → `0D 00 00` |
| `0E` | Mono Aux | Aux 2 → `0E 00 01` |
| `0F` | Stereo Aux | St Aux 5 L → `0F 00 08` |
| `10` | Main | LR L `00`, R `01`, C `02`, LFE `03`, sL `04`, sR `05` |
| `11` | Mono Matrix | Matrix 1 → `11 00 00` |
| `12` | Stereo Matrix | St Mtx 2 L → `12 00 02` |
| `13` | PAFL (stereo) | PAFL 1 L/R → `13 00 00` / `13 00 01` |
| `14` | Unassigned | |
| `1C` | Rack FX output | |
| `1E` | Wedge monitor | Wedge 1 → `1E 00 00` |
| `21` | IEM monitor (stereo) | IEM 1 L → `21 00 00` |
| `2D` | UltraFX output | unit 1 OP1 `00`, OP2 `01`, unit 2 OP1 `02` |

Mono groups were not available in the test configuration; by the order of the other types they are probably `0C`, but that is not verified.

## Inserts

Insert returns are two more 128-entry tables of `[type][index u16]`, using the input-source types: Insert A at state `+2564 + 3×(ch−1)`, Insert B at `+2948 + 3×(ch−1)`. A Rack FX return uses type `1C` with index `2×(unit−1)` (Left).

The insert send is written into the *destination's* table, as type `08` (Insert A send) or `09` (Insert B send) with index = input − 1:

- MixRack socket send → that local output socket's entry (send 20 → `+6689 = 08 00 00` for input 1).
- Rack FX send → both inputs of the unit in the Rack FX input table at `+6731`, 6 bytes per unit (L, R). Those inputs normally hold their FX send (`1D 00 nn`).

`Insert 1|2, Input Channel NN` state `+1` is `00` while an insert is assigned and `01` when it is not. Unassigning sets the return and send entries back to `14` (unassigned).

Checked with three controlled Director operations on input 1 (Insert A socket send 20 / return 40, Insert B Rack FX 3, Insert B unassign); `setInputInsert(ch, 'A'|'B', target)` reproduces all three byte-for-byte. Assigning a socket return in Director also sets that socket's preamp to 20 dB with pad on; the editor does not touch preamps.

## Not in Channel Mapper

Preamp gain, pad and 48 V are per socket in `StageBox Analogue Input, Number NN` and trim/polarity per input in `Digital Attenuator Input Channel NN`; both were already mapped (see `input-processing.md`) and were re-confirmed in this session: gain `+1..2` as dB×256 (range 5…60 dB, Director stores the gain before the −20 dB pad), pad `+3`, 48 V `+4`; trim range ±24 dB.

Editor API (`app-patching.js`): `cmInputSource(ch)`, `setInputSource(ch,type,socket)`, `cmOutput(bank,socket)`, `setOutputPatch(bank,socket,type,n,side)`.
