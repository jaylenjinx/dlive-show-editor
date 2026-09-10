# Channel names and colours

**Status:** verified write.

Recognised name/colour managers use the following structure:

```text
uint16_be payload_length
ASCII signature
00 01
N × 9-byte name slots
N × 1-byte colour IDs
```

A name slot stores up to eight printable ASCII characters plus NUL/padding.

| ID | Colour |
|---:|---|
| 0 | Off |
| 1 | Red |
| 2 | Green |
| 3 | Yellow |
| 4 | Blue |
| 5 | Magenta |
| 6 | Cyan |
| 7 | White |

The editor requires the expected payload-length identity for a manager before enabling writes.
