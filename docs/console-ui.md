# Console-style visual editor

The **Console UI** tab is a visual editing layer for the input processing fields already mapped by the reverse-engineering tools. It does not introduce new binary writers: every edit is routed through the existing guarded PEQ/compressor setter functions.

## Input PEQ

- Four-band logarithmic frequency graph with coloured band handles.
- Drag a handle horizontally to change frequency; drag vertically to change gain where the selected filter type has gain.
- Band 1 exposes the verified HPF / Bell / Low Shelf enum.
- Band 4 exposes the verified LPF / Bell / High Shelf enum.
- Frequency, gain, Bell width and global PEQ In/Out use the existing verified writers.
- The combined curve is an RBJ-style visual preview for operator feedback. It is **not** claimed to be a bit-exact emulation of dLive DSP.

## Input compressor

The compressor view mirrors the general layout of the dLive processing page: sidechain controls at left, transfer curve in the centre, main controls at right, and parallel path below.

The UI enables controls only when the corresponding writer is verified for the current model/record shape. Current Manual RMS mappings include compressor In/Out, threshold, restricted ratio choices, restricted attack/release anchors, makeup gain, knee, parallel path, sidechain filter/type/frequency/BPF/source controls, and BPF frequency. Bus and Opto expose only the fields currently verified for those models. Compressor model switching remains read-only.

The transfer and sidechain plots are visual previews only; offline show files do not contain live metering, so the gain-reduction meter is intentionally inactive.

## Safety model

The older **Input PEQ** and **Channel state** tabs remain available for byte-level inspection. The visual editor never writes an unverified offset directly, so the same structure validation and model guards continue to apply.
