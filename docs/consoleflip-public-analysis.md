# ConsoleFlip public analysis

This note records only information observable from public pages, public forum posts, public code/search surfaces, and a user-supplied static copy of the public website. It does not include any attempt to bypass authentication or access private implementation details.

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

## Static-site ZIP findings

A static copy of the public ConsoleFlip site was inspected. It contains rendered HTML, CSS, the compiled browser JavaScript bundle, Flux/Livewire client code and public images. It does **not** contain the server-side application/parser source.

The frontend stack is Laravel/Livewire/Flux with Alpine-style client components. The converter page submits the selected native console show to the server using a normal form POST. The relevant user-facing fields are `input_format`, `show_file` for dLive/Avantis, and `show_folder[]` for SQ.

The browser-side converter code performs only lightweight upload validation:

- selects permitted extensions/MIME types from the chosen console definition
- validates that an SQ upload contains one complete `SHOW####` folder
- requires SQ `SHOW.DAT` and `NVDATA.DAT`
- reads only the first 16 bytes of SQ `SHOW.DAT` locally to display the show name
- tracks the selected console and uploaded filename

Crucially, the shipped browser bundle contains no dLive `.tar.gz` parser or serializer. There is no `DataView`-based dLive binary reader, and no browser TAR/GZIP implementation such as `DecompressionStream`, `CompressionStream`, pako, fflate, gunzip or inflate. Therefore the dLive archive is being interpreted on the server, not in the browser.

The site configuration visible in the static HTML is explicitly version-pinned:

- dLive: firmware **2.12**, `.tar.gz`, upload enabled
- Avantis: firmware **1.35**, `.tar.gz`, upload currently disabled on the captured site because of a known issue
- SQ: firmware **1.6.1**, complete `SHOW####` folder containing `SHOW.DAT` + `NVDATA.DAT`

That version pin is significant. It is consistent with a direct, version-specific binary parser/serializer rather than merely replaying public MIDI control messages.

The privacy page further states that uploaded show files are parsed into derived conversion data including channel names, fader levels, mutes, HPF, EQ, compressors and bus data, and that a preview is generated from the extracted data. This reinforces the server-side parser model.

### What is *not* exposed by the ZIP

The static copy does not reveal:

- byte offsets or field schemas for dLive HPF/EQ/compressor/fader/pan/send data
- PHP/backend parser classes
- a public conversion REST API
- dLive-to-SQ translation tables
- RackUltra/RackExtra DSP parameter maps
- source maps containing backend logic

The public browser JavaScript is primarily framework/runtime code plus upload UX. The only console-file parsing logic found client-side is the small SQ show-name read described above.

## Historical Allen & Heath forum evidence

In April 2023, Allen & Heath forum user `jemx` said they had custom software that could copy almost everything in a channel strip (minus inserts), plus aux sends, groups, DCAs, FX returns and FX sends. They also said effect parameters could be copied when both consoles supported the same effect, giving reverb decay and room size as examples.

That is not proof that `jemx` is the author of ConsoleFlip, but the capability, timing and commercial conversion model are closely aligned. Treat this only as a lead, not an attribution.

## Public implementation visibility

No public ConsoleFlip source repository was found from searches of GitHub and the public web. The public site exposes the user workflow and transfer coverage but not its parser implementation or parameter maps. The static-site copy confirms that the missing logic is server-side rather than merely hidden in a minified browser bundle.

Therefore, the useful information is not a byte-level parameter map copied from ConsoleFlip; it is an independent confirmation that the listed dLive parameter classes are practical to decode and render back into valid show files.

## Implications for our reverse engineering

Prioritise these records in this order:

1. Input fader / mute / pan, because the value domains are simple and can be cross-checked against the public MIDI protocol.
2. HPF on/off and frequency, because `dlive-midi-tools` publishes the live-control transform for HPF frequency.
3. Input PEQ, using controlled one-parameter scene diffs for frequency, gain, Q and filter type.
4. Compressor parameters, again using one-parameter diffs.
5. Aux sends and send-source selection.
6. RackUltra/RackExtra DSP only after the normal channel-strip formats are stable.

A further caution from the supplied show is that identically named labelled records are not always identical in serialized length across old/factory scenes. This may indicate version-dependent record layouts, optional fields or padding. V2 should therefore validate scene/show format assumptions before promoting a field to writable status rather than assuming one global fixed C-style struct.

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
