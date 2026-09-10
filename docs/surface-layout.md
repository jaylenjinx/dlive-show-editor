# C-class Surface strip layout

**Status:** verified write for the observed strip types.

Factory `C1500 Strip Assign`, `C2500 Strip Assign`, and `C3500 Strip Assign` scenes provide controlled references for the Surface bank switcher records.

Each strip assignment is two bytes:

```text
[type, zero_based_index]
```

A bank record contains six layers and a width value. In the supplied C1500 reference, the left bank has width 12, producing 72 strip assignments.

## Verified type IDs

| Hex | Object |
|---:|---|
| `00` | Blank |
| `01` | Input |
| `02` | Mono Group |
| `03` | Stereo Group |
| `04` | Mono Aux |
| `05` | Stereo Aux |
| `06` | RackExtra FX Send |
| `08` | Main |
| `0A` | Mono Matrix |
| `0B` | Stereo Matrix |
| `0C` | RackExtra FX Return |
| `0D` | DCA |
| `13` | RackUltra FX Return |

Unknown type IDs are preserved and are not offered as writable choices.
