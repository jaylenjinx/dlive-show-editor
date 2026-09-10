# Jaylen Aug 15 / ConsoleFlip cross-check

This dataset is a second real-world dLive 2.12 show captured from an actual event, paired with a HAR recording of the same show being parsed by ConsoleFlip.

It is valuable because ConsoleFlip's backend acts as an independent semantic decoder: our work can compare native show bytes against the values their preview renders without relying on the same implementation.

## HPF

The native input HPF record contains five bytes after its label:

```text
03 FF FF MM BB
```

Across all 108 input cards visible in the ConsoleFlip preview:

- `BB = 00` matched HPF On.
- `BB = 01` matched HPF Off.
- `FF FF` decoded with `f = 4 × 2^(raw/4608)` and matched ConsoleFlip's rounded displayed frequency.

Result: **108/108 state matches and 108/108 rounded-frequency matches**.

This promoted HPF frequency and bypass to verified write.

## Input Mixer

The current event scene's `Input Mixer` record decomposes exactly as:

```text
12-byte header
128 × 169-byte channel blocks
```

The earlier Hardcore Start current scene independently decomposes as:

```text
12-byte header
128 × 224-byte channel blocks
```

The differing block sizes are caused by mixer configuration, but two fields remain stable relative to each block end:

```text
fader = blockSize - 84
pan   = blockSize - 82
```

## Fader

Native representation:

```text
raw = int16_be
0x8001 => -infinity
otherwise dB = raw / 256
```

The event show's native fader values correlate with the ConsoleFlip bar heights essentially perfectly. The previous Hardcore Start HAR provides a second check: its visible channels are at `0x8001` and ConsoleFlip renders them at 0%.

## Pan

Native representation:

```text
0x00 = 100% L
0x25 = centre
0x4A = 100% R
```

ConsoleFlip's conic-gradient dial angles match this mapping for hard-left, centre, hard-right and intermediate pan values.

## Compressor On/Off

Inside `Compressor, Input Channel NN`, state byte `+2` separates ConsoleFlip's active and bypassed channels exactly:

```text
00 = Comp Off
01 = Comp On
```

The event preview includes active examples such as CH14, CH16 and CH18. Across all 108 visible cards, this byte matched ConsoleFlip's Comp On/Off label.

## Mono Aux send evidence

For the event show's 169-byte channel blocks, six mono Aux level fields appear at:

```text
+12, +16, +20, +24, +28, +32
```

They are signed 16-bit big-endian fixed-point dB values using `0x8001` for -infinity. ConsoleFlip's six Aux level bars match those values.

The corresponding layout in the 224-byte Hardcore blocks is not yet fully derived. These send offsets therefore remain configuration-specific research evidence and are not writable.

## Confidence policy

The event/ConsoleFlip pair is strong independent evidence, but it does not replace controlled one-parameter scene cloning when a field may have coupled state. HPF is writable because the field semantics are now independently confirmed and the writer can touch only the proven frequency/bypass bytes while preserving unknown state. Fader, pan, compressor and Aux sends remain read-only until isolated edits prove their write boundaries.
