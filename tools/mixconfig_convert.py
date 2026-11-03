#!/usr/bin/env python3
"""Convert a dLive StageBox scene to a different Mixer Config (reference implementation).

Rules reverse-engineered from Director 2.12 reconfigurations (2026-11-04, docs/mix-config.md):
a scene recalled into a new config keeps every setting by bus identity; buses that no longer
exist are dropped and new buses get Director's defaults.

    python tools/mixconfig_convert.py IN.dat OUT.dat --groups 2/8 --fx 8/0 --aux 6/4 --matrix 2/2 --main LCR
    python tools/mixconfig_convert.py IN.tar.gz OUT.tar.gz ...   (whole show)
"""
from __future__ import annotations

import argparse
import dataclasses
import struct
from pathlib import Path

MAIN_TYPES = {"None": 0, "LR": 1, "LR+Msum": 2, "LR+M": 3, "LCR": 4, "5.1": 5, "LCR+": 6}
# (main type, combined) -> Main mix channel count. The 3/4-channel types all use four legs.
MAIN_CHANNELS = {0: 0, 1: 2, 2: 4, 3: 4, 4: 4, 5: 6, 6: 4}
SIDE = {"L": "Left", "R": "Right", "": ""}


@dataclasses.dataclass(frozen=True)
class Config:
    mg: int; sg: int; mfx: int; sfx: int; ma: int; sa: int; mm: int; sm: int
    main: int = 5; combined: bool = True; pafl: int = 1

    @classmethod
    def from_input_mixer(cls, h: bytes) -> "Config":
        return cls(*h[1:9], main=h[9], combined=bool(h[10]), pafl=h[11])

    def main_legs(self) -> list[tuple[int, str]]:
        """Main channel numbers and sides, as used in per-bus record labels."""
        n = MAIN_CHANNELS[self.main]
        if not self.combined:
            return [(i + 1, "") for i in range(n)]
        legs = [(1, "L"), (1, "R")] if n else []
        legs += [(i + 1, "") for i in range(2, min(n, 4))]
        if n == 6:
            legs += [(5, "L"), (5, "R")]
        return legs

    def main_blocks(self) -> int:
        """Mix Mixer Main blocks: one per Main strip (the 4th leg of the 3/4-channel types has none)."""
        n = MAIN_CHANNELS[self.main]
        if n == 0:
            return 0
        if n == 2:
            return 1 if self.combined else 2
        if n == 4:
            return 2 if self.combined else 3
        return 4 if self.combined else 6

    def input_header(self, ver: int) -> bytes:
        return bytes([ver, self.mg, self.sg, self.mfx, self.sfx, self.ma, self.sa, self.mm, self.sm,
                      self.main, int(self.combined), self.pafl])

    def mix_header(self, ver: int) -> bytes:
        return bytes([ver, self.mg, self.sg, self.mfx, self.sfx, self.ma, self.sa, self.mm, self.sm,
                      self.main_blocks(), int(self.combined)])

    def mixconfig(self) -> bytes:
        """13-byte MixConfig.dat order (stereo matrices before mono)."""
        return bytes([1, self.mg, self.sg, self.mfx, self.sfx, self.ma, self.sa, int(self.combined), self.main,
                      self.sm, self.mm, self.pafl, 0x17])


# ---- framed records ---------------------------------------------------------------------------

def walk(d: bytes, start: int) -> list[tuple[str, bytes]]:
    out = []; i = start
    while i + 3 < len(d):
        L = int.from_bytes(d[i:i + 2], "big"); nul = d.find(b"\0", i + 2, i + 2 + L)
        if L < 2 or nul < 0 or i + 2 + L > len(d):
            break
        lab = d[i + 2:nul]
        if not lab or any(c < 32 or c > 126 for c in lab):
            break
        out.append((lab.decode(), d[nul + 1:i + 2 + L])); i += 2 + L
    if i != len(d) - 1:
        raise ValueError(f"record walk stopped at {i} of {len(d)}")
    return out


def frame(label: str, state: bytes) -> bytes:
    body = label.encode() + b"\0" + state
    return struct.pack(">H", len(body)) + body


def first_record(d: bytes) -> int:
    """The records section starts right after a u32 holding its length (file size - start - 1)."""
    for i in range(300, len(d) - 4):
        if int.from_bytes(d[i - 4:i], "big") == len(d) - i - 1 and d[i + 2:i + 3].isalpha():
            return i
    raise ValueError("records section not found")


# ---- identity maps -----------------------------------------------------------------------------

def chan_layout(h: bytes) -> tuple[list[tuple], int]:
    """Input/FX Return/AHFX Return per-channel block: [(key, width)], block size."""
    ver, mg, sg, mfx, sfx, ma, sa, mm, sm = h[:9]
    keys = [(("MGrp", i), 1) for i in range(mg)] + [(("SGrp", i), 1) for i in range(sg)]
    for kind, n, w in (("MFX", mfx, 4), ("MAux", ma, 4), ("SFX", sfx, 5), ("SAux", sa, 5), ("MMtx", mm, 4), ("SMtx", sm, 5)):
        keys += [((kind, i), w) for i in range(n)]
    keys.append((("Main",), 47))
    if ver >= 3:
        keys += [(("UFX", i), 5) for i in range(8)]
    return keys, sum(w for _, w in keys)


CHAN_DEFAULT = {1: b"\0", 4: bytes.fromhex("01008001"), 5: bytes.fromhex("0100800125")}


def convert_chan_mixer(state: bytes, n: int, new: Config) -> bytes:
    old_h = state[:12]; old_keys, old_size = chan_layout(old_h)
    new_h = new.input_header(old_h[0]); new_keys, _ = chan_layout(new_h)
    out = bytearray(new_h)
    for c in range(n):
        blk = state[12 + c * old_size:12 + (c + 1) * old_size]; vals = {}; o = 0
        for k, w in old_keys:
            vals[k] = blk[o:o + w]; o += w
        for k, w in new_keys:
            out += vals[k] if k in vals else CHAN_DEFAULT[w]
    return bytes(out)


SEND5 = bytes.fromhex("0100800125")


def section_default(stereo: bool) -> bytes:
    return bytes.fromhex("00000080012500" + ("00" if stereo else "01") + "4a80010000250000") + bytes(32)


def mix_keys(h: bytes) -> list[tuple[tuple, int, bytes]]:
    """Mix Mixer layout as [(identity key, width, default)]."""
    ver, mg, sg, mfx, sfx, ma, sa, mm, sm, main, combined = h[:11]
    groups = [("MGrp", i) for i in range(mg)] + [("SGrp", i) for i in range(sg)]
    auxes = [("MAux", i) for i in range(ma)] + [("SAux", i) for i in range(sa)]
    mtx = [("MMtx", i) for i in range(mm)] + [("SMtx", i) for i in range(sm)]
    dests = ([("MFX", i) for i in range(mfx)] + [("MAux", i) for i in range(ma)] + [("SFX", i) for i in range(sfx)]
             + [("SAux", i) for i in range(sa)] + mtx)
    st = lambda b: b[0].startswith("S")
    keys = []
    for g in groups:
        keys += [((g, d), 5, SEND5) for d in dests]
        if ver >= 4:
            keys += [((g, "assign", g2), 1, b"\0") for g2 in groups]
            keys.append(((g, "sendpoint"), 1, b"\x03"))
        keys.append(((g, "section"), 48, section_default(st(g))))
    mains = [("Main", i) for i in range(main)]
    for b in auxes + mains:
        keys += [((b, d), 5, SEND5) for d in mtx]
        # Main blocks use the mono form, except the surround pair of a combined 5.1 Main.
        stereo = st(b) if b[0] != "Main" else (combined and main == 4 and b[1] == 3)
        keys.append(((b, "section"), 48, section_default(stereo)))
    keys += [((m, "section"), 48, section_default(st(m))) for m in mtx]
    if ver >= 3:
        keys += [((g, "UFX", u), 5, SEND5) for g in groups for u in range(8)]
    return keys


def convert_mix_mixer(state: bytes, new: Config) -> bytes:
    old = mix_keys(state[:11]); vals = {}; o = 11
    for k, w, _ in old:
        vals[k] = state[o:o + w]; o += w
    if o != len(state):
        raise ValueError(f"Mix Mixer layout mismatch: {o} != {len(state)}")
    new_h = new.mix_header(state[0]); out = bytearray(new_h)
    for k, w, dflt in mix_keys(new_h):
        out += vals.get(k, dflt)
    return bytes(out)


def mix_slots(cfg: Config) -> list[tuple]:
    """The 64 mix-channel slots (talkback tables etc.): one per mono bus / stereo leg."""
    s = [("MGrp", i) for i in range(cfg.mg)] + [("SGrp", i, x) for i in range(cfg.sg) for x in "LR"]
    s += [("MFX", i) for i in range(cfg.mfx)] + [("MAux", i) for i in range(cfg.ma)]
    s += [("SFX", i, x) for i in range(cfg.sfx) for x in "LR"] + [("SAux", i, x) for i in range(cfg.sa) for x in "LR"]
    s += [("Main", i) for i in range(MAIN_CHANNELS[cfg.main])] + [("PAFL", i, x) for i in range(cfg.pafl) for x in "LR"]
    s += [("MMtx", i) for i in range(cfg.mm)] + [("SMtx", i, x) for i in range(cfg.sm) for x in "LR"]
    return s


TALKBACK = b"Talkback Group "


def convert_channel_mapper(state: bytes, old: Config, new: Config) -> bytes:
    out = bytearray(state); so, sn = mix_slots(old), mix_slots(new)
    i = state.find(TALKBACK)
    while i >= 0:
        base = i + 19  # 1-byte flag before the name, 19-byte name, then 64 two-byte slots
        tab = {so[k]: state[base + 2 * k:base + 2 * k + 2] for k in range(min(len(so), 64))}
        new_tab = bytearray(128)
        for k, slot in enumerate(sn[:64]):
            new_tab[2 * k:2 * k + 2] = tab.get(slot, b"\0\0")
        out[base:base + 128] = new_tab
        i = state.find(TALKBACK, i + 1)
    return bytes(out)


# ---- per-bus records -----------------------------------------------------------------------------

PROC = ["Parametric EQ", "Graphic EQ", "Compressor"]
PER_LEG = ["Mix Delay", "Digital Attenuator", "Compressor side chain source", "Insert"]
SC_TYPE = {"Mono Group": 2, "Stereo Group": 3, "Mono Aux": 4, "Stereo Aux": 5, "Main": 8, "Mono Matrix": 10, "Stereo Matrix": 11}


def bus_legs(cfg: Config) -> list[tuple[str, int, str]]:
    legs = [("Mono Group", i + 1, "") for i in range(cfg.mg)] + [("Stereo Group", i + 1, s) for i in range(cfg.sg) for s in "LR"]
    legs += [("Mono Aux", i + 1, "") for i in range(cfg.ma)] + [("Stereo Aux", i + 1, s) for i in range(cfg.sa) for s in "LR"]
    legs += [("Main", n, s) for n, s in cfg.main_legs()]
    legs += [("Mono Matrix", i + 1, "") for i in range(cfg.mm)] + [("Stereo Matrix", i + 1, s) for i in range(cfg.sm) for s in "LR"]
    return legs


def sss_legs(cfg: Config) -> list[tuple[str, int, str]]:
    legs = [("Mono Group", i + 1, "") for i in range(cfg.mg)] + [("Stereo Group", i + 1, s) for i in range(cfg.sg) for s in "LR"]
    legs += [("Mono FX", i + 1, "") for i in range(cfg.mfx)] + [("Mono Aux", i + 1, "") for i in range(cfg.ma)]
    legs += [("Stereo FX", i + 1, s) for i in range(cfg.sfx) for s in "LR"] + [("Stereo Aux", i + 1, s) for i in range(cfg.sa) for s in "LR"]
    legs += [("Main", n, s) for n, s in cfg.main_legs()]
    return legs


def leg_label(fam: str, leg: tuple[str, int, str]) -> str:
    kind, n, side = leg
    mid = "" if fam == "Send Source Select" else " Channel"
    return f"{fam}, {kind}{mid} {n:02d} {SIDE[side]}"


def bus_records(cfg: Config) -> list[tuple[str, tuple]]:
    legs = bus_legs(cfg)
    out = [(leg_label(f, l), (f, l)) for f in PROC for l in legs]
    out += [(leg_label(f, l), (f, l)) for l in legs for f in PER_LEG]
    out += [(leg_label("Send Source Select", l), ("Send Source Select", l)) for l in sss_legs(cfg)]
    return out


def bus_default(fam: str, leg: tuple) -> bytes:
    if fam == "Compressor side chain source":  # defaults to the bus itself
        kind, n, _ = leg
        return bytes([1, SC_TYPE[kind], n - 1])
    return DEFAULT_RECORDS[fam]


# ---- scene ----------------------------------------------------------------------------------------

def convert_scene(d: bytes, new: Config) -> bytes:
    if len(d) <= 122426:  # empty scene: recall block only, no records
        return d
    start = first_record(d); recs = walk(d, start)
    labels = [l for l, _ in recs]; states = dict(recs)
    old = Config.from_input_mixer(states["Input Mixer"])
    n_bus = len(bus_records(old))
    if labels[:n_bus] != [l for l, _ in bus_records(old)]:
        raise ValueError("per-bus records are not in the expected order")
    body = bytearray()
    for lab, (fam, leg) in bus_records(new):
        body += frame(lab, states[lab] if lab in states else bus_default(fam, leg))
    for lab, st in recs[n_bus:]:
        if lab == "Input Mixer":
            st = convert_chan_mixer(st, 128, new)
        elif lab == "FX Return Mixer":
            st = convert_chan_mixer(st, 32, new)
        elif lab == "AHFX Return Mixer":
            st = convert_chan_mixer(st, 16, new)
        elif lab == "Mix Mixer":
            st = convert_mix_mixer(st, new)
        elif lab == "Channel Mapper":
            st = convert_channel_mapper(st, old, new)
        body += frame(lab, st)
    head = bytearray(convert_safes(d[:start], old, new, base=327))
    head[start - 4:start] = (len(body)).to_bytes(4, "big")
    return bytes(head) + bytes(body) + d[-1:]


# ---- show-level files -----------------------------------------------------------------------------

SAFES_MIX_BASE, SAFES_LEG = 66704, 518  # Global Safes mix legs follow the 64 mix-channel slots (docs/scene-safes.md)


def convert_safes(d: bytes, old: Config, new: Config, base: int = 0) -> bytes:
    """StageBox(Role)SceneSafes.dat (base 0) or a scene's recall block (base 327): mixconfig copy + mix legs."""
    out = bytearray(d)
    out[base + 3:base + 16] = new.mixconfig()
    so, sn = mix_slots(old), mix_slots(new); m = base + SAFES_MIX_BASE
    legs = {so[k]: d[m + SAFES_LEG * k:m + SAFES_LEG * (k + 1)] for k in range(min(len(so), 64))}
    for k in range(64):
        slot = sn[k] if k < len(sn) else None
        out[m + SAFES_LEG * k:m + SAFES_LEG * (k + 1)] = legs.get(slot, bytes(SAFES_LEG))
    return bytes(out)


def convert_followpan(text: bytes, new: Config) -> bytes:
    """FollowPanSettings.dat: a row per stereo aux (5), stereo FX (7), UFX (19, 8) and stereo matrix (11)."""
    lines = text.decode().split("\n")
    rows = {tuple(r.split(",")[:2]): r for r in lines[1:] if r.strip()}
    out = [lines[0]]
    for t, n in (("5", new.sa), ("7", new.sfx), ("19", 8), ("11", new.sm)):
        out += [rows.get((t, str(i)), f"{t},{i},0,0") for i in range(n)]
    return ("\n".join(out) + "\n").encode()


def convert_show(src: Path, dst: Path, new: Config, scenes: bool = True) -> None:
    """Rewrite a show archive for a new Mixer Config. With scenes=False stored scenes keep their old
    layout (Director converts a scene when it is recalled); the live scene is always converted."""
    import io
    import tarfile
    with tarfile.open(src, "r:gz") as t:
        members = [(m, t.extractfile(m).read() if m.isfile() else None) for m in t.getmembers()]
    files = {m.name: b for m, b in members}
    mc = files["Show/MixConfig/MixConfig.dat"]
    old = Config(mc[1], mc[2], mc[3], mc[4], mc[5], mc[6], mc[10], mc[9], main=mc[8], combined=bool(mc[7]), pafl=mc[11])

    def scene_archive(blob: bytes) -> bytes:
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as t:
            inner = [(m, t.extractfile(m).read() if m.isfile() else None) for m in t.getmembers()]
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as t:
            for m, b in inner:
                if b is not None:
                    b = convert_scene(b, new); m.size = len(b)
                t.addfile(m, io.BytesIO(b) if b is not None else None)
        return buf.getvalue()

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for m, b in members:
            n = m.name
            if b is not None:
                if n == "Show/MixConfig/MixConfig.dat":
                    b = new.mixconfig()
                elif n == "Show/FollowPanSettings/FollowPanSettings.dat":
                    b = convert_followpan(b, new)
                elif n.startswith("Show/SceneSafes/StageBox"):
                    b = convert_safes(b, old, new)
                elif n.startswith("Show/Scenes/StageBoxScene") and (scenes or n.endswith("65535.tar.gz")):
                    b = scene_archive(b)
                m.size = len(b)
            t.addfile(m, io.BytesIO(b) if b is not None else None)
    dst.write_bytes(buf.getvalue())


# Default record states for new buses (Director 2.12 captures, tools/mixconfig_defaults.hex).
DEFAULT_RECORDS: dict[str, bytes] = {}
_DEF = Path(__file__).with_name("mixconfig_defaults.hex")
if _DEF.exists():
    for line in _DEF.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            fam, hx = line.split("\t")
            DEFAULT_RECORDS[fam] = bytes.fromhex(hx)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("inp"); p.add_argument("out")
    pair = lambda s: tuple(int(x) for x in s.split("/"))
    p.add_argument("--groups", type=pair, required=True); p.add_argument("--fx", type=pair, required=True)
    p.add_argument("--aux", type=pair, required=True); p.add_argument("--matrix", type=pair, required=True)
    p.add_argument("--main", choices=list(MAIN_TYPES), required=True)
    p.add_argument("--individual", action="store_true"); p.add_argument("--pafl", type=int, default=1)
    p.add_argument("--keep-scenes", action="store_true", help="show archives: leave stored scenes in their old layout")
    a = p.parse_args(argv)
    cfg = Config(*a.groups, *a.fx, *a.aux, *a.matrix, main=MAIN_TYPES[a.main], combined=not a.individual, pafl=a.pafl)
    if a.inp.endswith(".tar.gz"):
        convert_show(Path(a.inp), Path(a.out), cfg, scenes=not a.keep_scenes)
    else:
        Path(a.out).write_bytes(convert_scene(Path(a.inp).read_bytes(), cfg))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
