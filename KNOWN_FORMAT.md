# Known dLive scene structures used by this MVP

The StageBox scene `.dat` tested in development contains ASCII signatures followed by `00 01`, then fixed-width name slots and one-byte colour values.

| Signature | Slots |
|---|---:|
| Input Channel Name Colour Manager | 128 |
| Mono Group Channel Name Colour Manager | 64 |
| Stereo Group Channel Name Colour Manager | 32 |
| Mono Aux Channel Name Colour Manager | 64 |
| Stereo Aux Channel Name Colour Manager | 32 |
| Mono FX Send Channel Name Colour Manager | 16 |
| Stereo FX Send Channel Name Colour Manager | 16 |
| Stereo AHFX Send Channel Name Colour Manager | 8 |
| Main Channel Name Colour Manager | 6 |
| Mono Matrix Channel Name Colour Manager | 64 |
| Stereo Matrix Channel Name Colour Manager | 32 |
| FX Return Channel Name Colour Manager | 16 |
| AHFX Return Channel Name Colour Manager | 8 |
| DCA Channel Name Colour Manager | 24 |

Each slot is 9 bytes. Names longer than 8 printable ASCII characters are rejected by the app.

This table is based on observed binary layout and should be treated as reverse-engineered/experimental rather than a vendor specification.

Version 2 observations: bytes after the first NUL in a name slot may be nonzero. Names are read only up to that NUL. DSP record framing and outstanding validation are documented in REVERSE_ENGINEERING.md.
