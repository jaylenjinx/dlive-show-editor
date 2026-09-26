# Channel Mapper (partially decoded, read-only)

`Channel Mapper` is a ~10 KB record that holds each input's source patching and its Insert A / Insert B endpoints. Findings from controlled Director changes on input 13 (`RevEngRouting`, scenes 175–199); **nothing here is writable yet**.

## Source socket

Preamp → Source Select → MixRack Sockets → Socket `13` → `20` changed exactly one byte, `12 → 19` (socket index, zero-based), at label + 160. In the first section the per-input entries are 13 bytes apart, `[00 00 00 idx][14 00 00][14 00 00][14 00 00]`, starting at label + 4, and inputs 1–16 read as an identity mapping. Later entries follow a different pattern, so this is not yet generalised to all 128 inputs. Toggling *Enable ABCD* flips label + 157 (`00 → 01`, the first byte of input 13's entry).

## Insert A / Insert B

Assigning an insert writes a 3-byte `[type, 00, index]` entry in a 128-entry table: Insert A at label + 2600 for input 13, Insert B at label + 2984 (stride 3 bytes per input, 128 inputs per table). Observed types: `14` unassigned, `1C` Rack FX, `27` Dyn8, `2D` UltraFX. Indices did not follow a simple rule (Rack FX unit 2 → `2`, unit 5 → `8`; UltraFX unit 3 → `4`, unit 2 → `2`; Dyn8 unit 2 → `1`), likely because units count mono/stereo channels. Applying also rewrites entries elsewhere in the record (the send/return endpoints) and clears byte 1 of `Insert 1, Input Channel 13` (`01 → 00`). Director requires both the Send and the Return to be set before Apply takes effect.

Because an insert touches several distant entries, the editor does not write it. Full decoding needs the endpoint tables mapped first.

## Not in scenes

Preamp Gain Tracking, Preamp On Surface, Scene Recall Safe and the strip Mute/Mix/PAFL buttons produced no change in the StageBox or Surface scene files.
