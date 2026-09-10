# Reverse-engineering research method

The project uses controlled scene diffs rather than guessing from arbitrary show differences.

## Recommended procedure

1. Start from one current dLive 2.12 scene.
2. Clone it several times.
3. Change exactly one parameter in each clone.
4. Spread values across the useful control range.
5. Label every clone with the exact displayed value.
6. Export the whole show without unrelated changes.
7. Compare the corresponding framed record byte-for-byte.

A field is promoted to writable only after the location and value mapping are repeatable. Independent confirmation from the documented dLive live MIDI protocol is especially valuable.

## High-value next experiments

- PEQ filter type and PEQ In/Out
- HPF enable and frequency
- channel fader
- mute and pan
- compressor threshold/ratio/attack/release
- aux send level/on/pre-post
- individual RackUltra parameters

## Contribution rule

A single changed offset is evidence, not a complete encoding. Preserve unknown bytes until the field can be generated confidently across multiple values.
