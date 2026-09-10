# ConsoleFlip public analysis

This note records only information observable from public pages, public forum posts, and public code/search surfaces. It does not include any attempt to bypass authentication or access private implementation details.

## Publicly advertised dLive coverage

ConsoleFlip currently advertises dLive read/write support for:

- show name
- channel names and colours
- stereo inputs
- input HPF
- input EQ
- input compressors
- input fader levels
- input mutes
- input pans
- aux sends

Its own transfer map currently lists aux masters, group sends, FX sends and scene data as planned rather than shipped.

This is valuable to this project because each supported class lines up with labelled records already visible in dLive StageBox scene data, including `Highpass Filter Input Channel NN`, `Parametric EQ, Input Channel NN`, `Compressor, Input Channel NN`, `Digital Attenuator Input Channel NN`, `Stereo Image Input Channel NN`, the send-source records and larger mixer records.

## Historical Allen & Heath forum evidence

In April 2023, Allen & Heath forum user `jemx` said they had custom software that could copy almost everything in a channel strip (minus inserts), plus aux sends, groups, DCAs, FX returns and FX sends. They also said effect parameters could be copied when both consoles supported the same effect, giving reverb decay and room size as examples.

That is not proof that `jemx` is the author of ConsoleFlip, but the capability, timing and commercial conversion model are closely aligned. Treat this only as a lead, not an attribution.

## Public implementation visibility

No public ConsoleFlip source repository was found from searches of GitHub and the public web. The public site exposes the user workflow and transfer coverage but not its parser implementation or parameter maps. The web-search/crawler surfaces available during this analysis did not expose usable JavaScript source maps or backend parser code.

Therefore, the useful information is not a byte-level parameter map copied from ConsoleFlip; it is an independent confirmation that the listed dLive parameter classes are practical to decode and render back into valid show files.

## Implications for our reverse engineering

Prioritise these records in this order:

1. Input fader / mute / pan, because the value domains are simple and can be cross-checked against the public MIDI protocol.
2. HPF on/off and frequency, because `dlive-midi-tools` publishes the live-control transform for HPF frequency.
3. Input PEQ, using controlled one-parameter scene diffs for frequency, gain, Q and filter type.
4. Compressor parameters, again using one-parameter diffs.
5. Aux sends and send-source selection.
6. RackUltra/RackExtra DSP only after the normal channel-strip formats are stable.

## Useful independent MIDI reference

`togrupe/dlive-midi-tools` documents dLive live-control addressing. In particular:

- names/colours/preamp functions use Allen & Heath SysEx
- fader level uses NRPN parameter `0x17`
- HPF frequency uses NRPN parameter `0x30`
- HPF on/off uses NRPN parameter `0x31`
- main-mix assignment uses NRPN parameter `0x18`
- DCA/mute-group/group-routing functions use documented NRPN addressing

The project also documents the 8-character dLive naming limit and bus/channel technical offsets. These live-control values are useful independent constraints when identifying the corresponding show-file serialization.

## Next experiment set

The fastest path to writable channel processing is a controlled show containing paired scenes where exactly one parameter changes at a time. Recommended pairs:

- input 1 fader: 0 dB vs -10 dB
- input 1 mute: off vs on
- input 1 pan: centre vs hard left vs hard right
- HPF: off vs on at 80 Hz, then 80 Hz vs 160 Hz
- PEQ band 1: flat vs +6 dB; 100 Hz vs 200 Hz; Q 0.7 vs 1.4; bell vs shelf
- compressor: bypass/on, threshold, ratio, attack and release one at a time
- aux 1 send: off vs on; -inf vs 0 dB; pre vs post

With those files, the V2 framed-record parser can correlate changed byte ranges against known UI values and promote fields from `decoded/read-only` to `proven writable`.
