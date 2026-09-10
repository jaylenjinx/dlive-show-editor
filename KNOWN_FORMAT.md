# Known dLive show-file structures — v2 research notes

These notes describe observations from the supplied real-world show file. They are not an official Allen & Heath format specification.

## 1. Outer archive

A show is a gzip-compressed TAR containing `Show/...`.

Notable entries:

- `Show/Version.dat` — text; supplied show contains `14`
- `Show/MixConfig/MixConfig.dat` — 13-byte binary config
- `Show/Scenes/StageBoxSceneNNN.tar.gz`
- `Show/Scenes/SurfaceSceneNNN.tar.gz`
- several small global configuration files stored as plain UTF-8 text

StageBox and Surface scenes are nested gzip-compressed TARs whose principal payload is a `.dat` file.

## 2. StageBox name/colour managers — VERIFIED WRITE

Managers are located by stable ASCII signatures such as:

```text
Input Channel Name Colour Manager
Mono Group Channel Name Colour Manager
AHFX Return Channel Name Colour Manager
```

Observed framing and structure:

```text
uint16_be payload_length
ASCII signature
00 01
N × 9-byte name slots
N × 1-byte colour IDs
```

For these managers, `payload_length == len(signature) + 2 + (N × 10)`. V2 requires this equality before enabling writes.

A name slot contains up to 8 printable ASCII bytes plus NUL/padding.

Colour IDs:

```text
0 Off
1 Red
2 Green
3 Yellow
4 Blue
5 Magenta/Purple
6 Cyan/Light blue
7 White
```

The colour map independently matches the dLive live-control constants in `togrupe/dlive-midi-tools`.

## 3. Surface bank switchers — VERIFIED WRITE

Signatures:

```text
Channel Left Bank Switcher
Channel Middle Bank Switcher
Channel Right Bank Switcher
```

Record framing is:

```text
uint16_be payload_length
ASCII signature
00
01 WIDTH
(TYPE INDEX) repeated WIDTH times for Layer A
(TYPE INDEX) repeated WIDTH times for Layer B
...
(TYPE INDEX) repeated WIDTH times for Layer F
```

There is no trailer: the two bytes after the payload are the next record's length prefix. The safety identity is:

```text
payload_length == len(signature) + 1 + 2 + (WIDTH × 6 × 2)
```

For the supplied C1500 Scene 10, Left Bank is WIDTH=12 and Middle/Right are WIDTH=0.

The factory `C1500 Strip Assign` scene is the main controlled reference used to identify type values. C2500/C3500/S3000/S5000/S7000 factory scenes independently validate the same framing with different bank widths.

Verified type IDs:

```text
00 Blank
01 Input
02 Mono Group
03 Stereo Group
04 Mono Aux
05 Stereo Aux
06 RackExtra FX Send
08 Main
0A Mono Matrix
0B Stereo Matrix
0C RackExtra FX Return
0D DCA
13 RackUltra FX Return
```

An unobserved/unsupported type is preserved and is not offered as a writable choice.

## 4. RackUltra AHFX manager records — DECODED READ-ONLY

Eight records are anchored by:

```text
AHFX Manager 01
...
AHFX Manager 08
```

The records are also framed with a 2-byte big-endian payload length. In the supplied scenes the AHFX payload length is `0x0106` = 262 bytes, so the framed record is 264 bytes total. Consecutive AHFX signatures are therefore exactly `0x108` bytes apart.

Observed payload header relative to each signature:

```text
+0x00  "AHFX Manager NN" (15 ASCII bytes)
+0x0F  00
+0x10  06
+0x11  03
+0x12  00
+0x13  engine ID byte 1
+0x14  engine ID byte 2
+0x15  preset-label C string (field contains stale padding/data after NUL)
...
```

Known engine IDs from the supplied Reset scene and Scene 10:

```text
1c03 Spaces / 480 Large family
1c04 Spaces / 480 Medium family
1d00 Plate Reverb Designer
2d00 Rhythm Delay
2b00 Saturator
2a00 Amp/Cab
2400 Shifter
2300 Dual Harmony
1e00 Tuner
2800 Gridder
```

The rest of the 262-byte payload clearly contains fixed-position DSP/state values. Same-engine comparison between Reset Scene 1 and Scene 10 shows localized parameter changes without any record-size change. Parameter-by-parameter scaling is not yet sufficiently validated to write.

## 5. Generic scene record framing — HIGH CONFIDENCE

A broad set of StageBox and Surface components use the same framing:

```text
uint16_be payload_length
payload[payload_length]
```

For labelled objects, the payload begins with a NUL-terminated printable ASCII label, followed by fixed-position state bytes. This is independently validated on name/colour managers, Surface bank switchers, AHFX managers, input PEQs, compressors and many other records.

Examples from Scene 10:

- `Parametric EQ, Input Channel 01`: 70-byte payload + 2-byte length prefix; 38 state bytes after the label.
- `Compressor, Input Channel 01`: 156-byte payload + 2-byte prefix; 127 state bytes after the label.
- `AHFX Manager 01`: 262-byte payload + 2-byte prefix.

V2's Structure inspector now discovers labelled framed records using this rule and reports their frame offset, payload size and post-label state length.

## 6. MixConfig.dat — HIGH-CONFIDENCE READ, NOT WRITE

Supplied bytes:

```text
01 04 09 08 04 06 06 01 00 02 02 01 17
```

Strongly identified fields:

```text
byte 0  record/version
byte 1  mono group count
byte 2  stereo group count
byte 3  mono RackExtra FX send count
byte 4  stereo RackExtra FX send count
byte 5  mono aux count
byte 6  stereo aux count
byte 9  mono matrix count
byte 10 stereo matrix count
```

Bytes 7, 8, 11 and 12 are not labelled in v2.

The Scene 10 `Input Mixer` header contains a matching count sequence, while the Reset scene contains a different count sequence matching its own configuration. This supports the interpretation but is not enough to safely synthesize the whole config record.

## 7. Other labelled structures — READ-ONLY

The StageBox scene contains stable human-readable component signatures for many sections including:

- Input Mixer
- FX Send / Return Mixer
- AHFX Send / Return Mixer
- Parametric EQ
- Graphic EQ
- Compressor
- Gate
- Delay
- Stereo Image
- Send Source Select
- Preamp Model
- Digital Attenuator

The Surface scene contains labels including:

- Surface Soft Controls
- Soft Rotaries Control Manager
- MIDI Strip Name Colour Manager
- bank switchers

V2 lists these signatures and offsets to support controlled experiments.

## 8. External live-control reference

`togrupe/dlive-midi-tools` documents dLive live MIDI addressing. Particularly useful independent facts:

- dLive MIDI-over-TCP port 51325
- SysEx header begins `F0 00 00 1A 50 10 01 00`
- channel name set/get messages `03` / `01`
- colour set/get `06` / `04`
- pad `09`, +48V `0C`
- NRPN fader parameter `17`
- HPF frequency/on `30` / `31`
- technical object offsets:
  - stereo Group +0x40
  - stereo Aux +0x40
  - stereo Matrix +0x40
  - DCA +0x36
  - RackExtra mono FX Send +0x00
  - RackExtra stereo FX Send +0x10
  - RackExtra FX Return +0x20
  - RackUltra Send +0x56
  - RackUltra Return +0x5E

These addresses describe the live MIDI API rather than the offline file layout, but they provide useful semantic confirmation of object classes.
