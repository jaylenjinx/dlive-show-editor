# Input Direct Output

Source: `RevEngRouting` (Director 2.12, input 13, scenes 194–208), one control changed per scene.

## Level — `Direct Output, Input Channel NN` (3-byte state)

`state +0` is `01`; `state +1..2` is an `int16` big-endian, `dB = raw / 256`, `8001` = −∞. Only these two bytes change per edit.

| Typed | Displayed | Raw |
|---:|---|---:|
| −10 | −10 dB | `F5 FD` |
| −20 | −20 dB | `EB FD` |
| +6 | +6 dB | `06 03` |
| +10 | +10 dB | `0A 00` |
| +20 | +10 dB (clamped) | `0A 00` |
| −40, −60, −100 | −Inf | `80 01` |

Typed values carry the same ~+0.012 dB noise as sends (`FD`/`03` low byte); range −39…+10 dB like other sends.

## Global source — `Global Direct Outputs` (6-byte state `02 07 00 01 00 00`)

`state +1` holds the tap point for every input's direct out: `0` Post Preamp, `1` Post LPF, `2` Post Gate, `3` Post Ins A Ret, `4` Post PEQ, `5` Post Comp, `6` Post Ins B Ret, `7` Post Delay (default). Each option changes only this byte.

Director's Routing page also lists *Follow DCA/Mutes*, *Follow Ch Fader* and *Follow Ch Mute* (shown as Off / Off / On). Their bytes among the remaining `00 01 00 00` were not isolated; they stay unmapped.
