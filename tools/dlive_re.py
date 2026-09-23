#!/usr/bin/env python3
"""dLive show-file reverse-engineering helper.

Commands:
  discover SHOW.tar.gz   Compare adjacent controlled scenes and surface changed fields.
  validate SHOW.tar.gz   Match changed fields against the built-in verified map.
  diff SHOW.tar.gz A B   Detailed binary/record diff for two scene IDs.
  mixconfig SHOW.tar.gz  Decode the show's MixConfig.dat (bus counts, Main type).

SHOW may also be a directory of "Scene N.dat" files, e.g. Director's live
.../TLDV2.12/TLDData/Director/Scenes/StageBox folder.

No third-party dependencies are required.
"""
from __future__ import annotations

import argparse
import dataclasses
import io
import json
import math
import re
import statistics
import sys
import bisect
import tarfile
from collections import defaultdict
from pathlib import Path
from typing import Any

RECORD_LABEL_RE = re.compile(
    r"(Name Colour Manager|AHFX Manager|Parametric EQ|Graphic EQ|Compressor|Gate|Delay|"
    r"Send Source Select|Mixer|Preamp Model|Stereo Image|Soft Controls|Bank Switcher|"
    r"Rotaries Control Manager|Levels and Mutes|AutoMicMixer|Highpass Filter|Lowpass Filter|"
    r"Digital Attenuator|StageBox Analogue Input|SCF|side chain source)", re.I
)

@dataclasses.dataclass
class Scene:
    number: int
    name: str
    data: bytes
    archive_path: str

@dataclasses.dataclass
class Record:
    frame_start: int
    payload_start: int
    payload_length: int
    label: str
    state_start: int
    frame_end: int

    @property
    def state_length(self) -> int:
        return self.frame_end - self.state_start

@dataclasses.dataclass
class Run:
    start: int
    end: int

    @property
    def width(self) -> int:
        return self.end - self.start + 1

def scene_name(data: bytes) -> str:
    if len(data) < 3:
        return ""
    end = data.find(b"\0", 2)
    if end < 0:
        end = min(len(data), 130)
    return data[2:end].decode("ascii", "replace")

def load_scene_dir(path: Path) -> dict[int, Scene]:
    """Read Director's live StageBox scene folder ("Scene N.dat" files).

    dLive Director writes each stored scene straight to
    .../TLDV2.12/TLDData/Director/Scenes/StageBox/, byte-identical to the
    StageBoxSceneN.dat inside a saved show, so no show export is needed.
    """
    scenes: dict[int, Scene] = {}
    for f in path.iterdir():
        m = re.fullmatch(r"(?:Scene |StageBoxScene)(\d+)\.dat", f.name)
        if m and f.is_file():
            data = f.read_bytes()
            scenes[int(m.group(1))] = Scene(int(m.group(1)), scene_name(data), data, str(f))
    if not scenes:
        raise ValueError("No StageBox scene .dat files found")
    return scenes

def load_show(path: str | Path) -> dict[int, Scene]:
    path = Path(path)
    if path.is_dir():
        return load_scene_dir(path)
    scenes: dict[int, Scene] = {}
    with tarfile.open(path, "r:gz") as outer:
        for member in outer.getmembers():
            m = re.search(r"Show/Scenes/StageBoxScene(\d+)\.tar\.gz$", member.name)
            if not m or not member.isfile():
                continue
            raw = outer.extractfile(member).read()
            with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as nested:
                dat_member = next((x for x in nested.getmembers() if x.name.endswith(".dat") and "StageBoxScene" in x.name), None)
                if dat_member is None:
                    dat_member = next((x for x in nested.getmembers() if x.name.endswith(".dat")), None)
                if dat_member is None:
                    continue
                data = nested.extractfile(dat_member).read()
            number = int(m.group(1))
            scenes[number] = Scene(number, scene_name(data), data, member.name)
    if not scenes:
        raise ValueError("No StageBox scene archives found")
    return scenes

def scan_records(data: bytes) -> list[Record]:
    """Scan framed processing records using stable ASCII label prefixes."""
    prefixes = (
        b"AHFX Manager", b"Parametric EQ", b"Graphic EQ", b"Compressor,", b"SCF Compressor",
        b"Compressor side chain source", b"Gate,", b"SCF Gate", b"Gate side chain source",
        b"Delay,", b"Input Mixer", b"Highpass Filter", b"Lowpass Filter", b"Digital Attenuator",
        b"Stereo Image", b"StageBox Analogue Input", b"Preamp Model", b"Send Source Select",
        b"Levels and Mutes", b"AutoMicMixer",
    )
    out: list[Record] = []
    seen: set[int] = set()
    n=len(data)
    for prefix in prefixes:
        pos=0
        while True:
            p=data.find(prefix,pos)
            if p<0: break
            pos=p+1
            if p<2 or p in seen: continue
            length=int.from_bytes(data[p-2:p],"big")
            # Input Mixer holds 128 per-input blocks (~26 KB); everything else is small.
            if length<5 or length>(65535 if prefix==b"Input Mixer" else 8192): continue
            frame_start=p-2; frame_end=frame_start+2+length
            if frame_end>n: continue
            nul=data.find(b"\0",p,min(frame_end,p+160))
            if nul<0: continue
            label_bytes=data[p:nul]
            if len(label_bytes)<4 or any(b<32 or b>126 for b in label_bytes): continue
            label=label_bytes.decode("ascii","replace")
            if not RECORD_LABEL_RE.search(label): continue
            seen.add(p)
            out.append(Record(frame_start,p,length,label,nul+1,frame_end))
    out.sort(key=lambda r:r.frame_start)
    return out

def changed_runs(a: bytes, b: bytes) -> list[Run]:
    n = min(len(a), len(b))
    idx = [i for i in range(n) if a[i] != b[i]]
    idx.extend(range(n, max(len(a), len(b))))
    if not idx:
        return []
    runs: list[Run] = []
    s = p = idx[0]
    for x in idx[1:]:
        if x == p + 1:
            p = x
        else:
            runs.append(Run(s, p))
            s = p = x
    runs.append(Run(s, p))
    return runs

def hex_bytes(data: bytes) -> str:
    return " ".join(f"{x:02X}" for x in data)

def fmt_run(start: int, end: int) -> str:
    return f"+{start}" if start == end else f"+{start}..{end}"

def engine_id(record: Record, data: bytes) -> str | None:
    if not record.label.startswith("AHFX Manager") or record.state_length < 5:
        return None
    return data[record.state_start + 3: record.state_start + 5].hex()

def input_mixer_layout(header: bytes) -> tuple[list[tuple[str, int, int]], int, int]:
    """Per-input block layout of the Input Mixer record (ReverseEngineer9).

    header = [version, monoGrp, stGrp, monoFX, stFX, monoAux, stAux, monoMtx, stMtx,
              mainType, mainStrips, PAFL] (mirrors MixConfig.dat).
    Block: one assign byte per group, then send entries in the order mono FX, mono Aux,
    stereo FX, stereo Aux, mono Matrix, stereo Matrix ([on, pre, level_i16] mono /
    [on, pre, level_i16, pan] stereo), a 47-byte section that starts with the Main send
    (On at +0, level at +3 — the input fader — and pan at +5), then 8 stereo UFX sends
    when version >= 3. The block size does not depend on the Main type.
    Returns (entries, channel_section_offset, block_size).
    """
    ver, mg, sg, mfx, sfx, ma, sa, mm, sm = header[:9]
    entries: list[tuple[str, int, int]] = []
    o = mg + sg
    for kind, count, width in (("FX", mfx, 4), ("Aux", ma, 4), ("St FX", sfx, 5),
                               ("St Aux", sa, 5), ("Mtx", mm, 4), ("St Mtx", sm, 5)):
        for i in range(count):
            entries.append((f"{kind} {i + 1}", o, width)); o += width
    section = o; o += 47
    if ver >= 3:
        for i in range(8):
            entries.append((f"UFX {i + 1}", o, 5)); o += 5
    return entries, section, o

def input_mixer_field(record: Record, rel_start: int, rel_end: int, data: bytes) -> dict[str, Any] | None:
    header = data[record.state_start:record.state_start + 12]
    if len(header) < 12 or header[0] not in (2, 3):
        return None
    entries, section, size = input_mixer_layout(header)
    if size * 128 + 12 != record.state_length or rel_start < 12:
        return None
    ch, a = divmod(rel_start - 12, size); b = a + (rel_end - rel_start)
    if b >= size:
        return None
    def hit(lo: int, hi: int, name: str, enc: str | None) -> dict[str, Any] | None:
        if lo <= a and b <= hi:
            base = 12 + ch * size
            return {"name": f"CH{ch + 1} {name}", "encoding": enc, "field_start": base + lo, "field_end": base + hi}
        return None
    groups = header[1] + header[2]
    if b < groups:
        g = a + 1
        label = f"Grp {g}" if g <= header[1] else f"St Grp {g - header[1]}"
        return hit(a, a, f"{label} assign", "toggle_01_on")
    for name, o, width in entries:
        f = (hit(o, o, f"{name} send On", "toggle_01_on") or hit(o + 1, o + 1, f"{name} send Pre", "enum")
             or hit(o + 2, o + 3, f"{name} send level", "i16_div256")
             or (hit(o + 4, o + 4, f"{name} send pan", "u8_direct") if width == 5 else None))
        if f:
            return f
    return (hit(section, section, "Main send On", "toggle_01_on")
            or hit(section + 3, section + 4, "Main send level (fader)", "i16_div256")
            or hit(section + 5, section + 5, "Main send pan", "u8_direct"))

MIXCONFIG_MAIN_TYPES = {0: "None", 1: "LR", 2: "LR+Msum", 3: "LR+M", 4: "LCR", 5: "5.1 Surround", 6: "LCR+"}

def decode_mixconfig(raw: bytes) -> dict[str, Any]:
    """Show/MixConfig/MixConfig.dat (13 bytes), mapped from RevEngCfgA / RevEngM0-M6."""
    if len(raw) != 13:
        raise ValueError(f"MixConfig.dat should be 13 bytes, got {len(raw)}")
    return {
        "version": raw[0], "mono_groups": raw[1], "stereo_groups": raw[2],
        "mono_fx": raw[3], "stereo_fx": raw[4], "mono_aux": raw[5], "stereo_aux": raw[6],
        "main_strips": {1: "Combined", 0: "Individual"}.get(raw[7], f"unknown 0x{raw[7]:02x}"),
        "main_type": MIXCONFIG_MAIN_TYPES.get(raw[8], f"unknown 0x{raw[8]:02x}"),
        "stereo_matrices": raw[9], "mono_matrices": raw[10], "pafl": raw[11],
        "unknown_12": raw[12], "raw": raw.hex(" "),
    }

def load_mixconfig(path: str | Path) -> bytes:
    with tarfile.open(path, "r:gz") as t:
        return t.extractfile("Show/MixConfig/MixConfig.dat").read()

def known_field(record: Record, rel_start: int, rel_end: int, data: bytes) -> dict[str, Any] | None:
    label = record.label.strip()

    if label.startswith("Input Mixer"):
        return input_mixer_field(record, rel_start, rel_end, data)

    def exact(a: int, b: int, name: str, encoding: str | None = None, **extra: Any):
        if a <= rel_start and rel_end <= b:
            return {"name": name, "encoding": encoding, "field_start":a, "field_end":b, **extra}
        return None

    if label.startswith("Highpass Filter Input Channel"):
        return (exact(1, 2, "HPF frequency", "freq_log") or
                exact(3, 3, "HPF slope/type", "enum") or
                exact(4, 4, "HPF In/Out", "toggle_00_on"))

    if label.startswith("Lowpass Filter Input Channel"):
        return exact(3, 4, "LPF frequency", "freq_log") or exact(10, 10, "LPF In/Out", "toggle_00_on")

    if label.startswith("Parametric EQ, Input Channel"):
        if rel_start == 37 and rel_end == 37:
            return {"name": "PEQ In/Out", "encoding": "toggle_00_on", "field_start":37, "field_end":37}
        for band in range(1, 5):
            base = 1 + (band - 1) * 9
            f = (exact(base, base+1, f"PEQ band {band} gain", "i16_div256") or
                 exact(base+2, base+3, f"PEQ band {band} frequency", "freq_log") or
                 exact(base+4, base+5, f"PEQ band {band} width", "peq_width") or
                 exact(base+6, base+6, f"PEQ band {band} type", "enum"))
            if f:
                return f

    if label.startswith("Compressor, Input Channel"):
        fields = [
            (1, 1, "Compressor model", "enum"), (2, 2, "Compressor On/Off", "toggle_01_on"),
            (8, 9, "Compressor threshold", "i16_div256"), (10, 11, "Compressor attack", "time_log"),
            (12, 13, "Compressor release", "time_log"), (15, 15, "Compressor ratio", "enum"),
            (16, 17, "Compressor makeup gain", "i16_div256"), (18, 18, "Compressor knee", "enum"),
            (51, 51, "Bus compressor threshold", "bus_threshold"),
            (123, 123, "Compressor SC filter In/Out", "toggle_00_on"),
            (124, 124, "Compressor SC BPF", "enum"), (125, 126, "Compressor SC BPF frequency", "freq_log"),
        ]
        for a,b,n,e in fields:
            f=exact(a,b,n,e)
            if f:return f

    if label.startswith("Gate, Input Channel"):
        fields = [
            (2,3,"Gate threshold","i16_div256"),(8,9,"Gate depth","i16_div256"),
            (10,11,"Gate hold","time_log"),(13,14,"Gate release","time_log"),
            (15,16,"Gate attack","time_log"),(18,18,"Gate On/Off","toggle_01_on"),
        ]
        for a,b,n,e in fields:
            f=exact(a,b,n,e)
            if f:return f

    if label.startswith("SCF Gate, Input Channel"):
        fields=[(3,4,"Gate SC low frequency","freq_log"),(7,7,"Gate SC low type","enum"),
                (12,13,"Gate SC high frequency","freq_log"),(16,16,"Gate SC high type","enum"),
                (19,19,"Gate SC filter In/Out","toggle_00_on"),(20,20,"Gate SC BPF/notch","enum"),
                (21,22,"Gate SC BPF/notch frequency","freq_log")]
        for a,b,n,e in fields:
            f=exact(a,b,n,e)
            if f:return f

    if label.startswith("Gate side chain source, Input Channel"):
        return exact(1,2,"Gate sidechain source","source_pair")

    if label.startswith("Delay, Input Channel"):
        return exact(1,2,"Input delay","delay_96") or exact(3,3,"Input delay In/Out","toggle_00_on")

    if label.startswith("Digital Attenuator Input Channel"):
        return exact(1,2,"Digital trim","i16_div256") or exact(3,3,"Polarity","enum")

    if label.startswith("Stereo Image Input Channel"):
        return exact(2,2,"Stereo width","u8_direct") or exact(3,3,"Stereo image mode","enum")

    if label.startswith("StageBox Analogue Input, Number"):
        return (exact(1,2,"StageBox gain","i16_div256") or exact(3,3,"StageBox pad","toggle_01_on") or
                exact(4,4,"StageBox 48V","toggle_01_on"))

    if label.startswith("AHFX Manager"):
        eng = engine_id(record, data)
        common: dict[tuple[int,int], tuple[str,str]] = {}
        if eng == "1c03":
            common.update({
                (29,29):("Spaces model","enum"),(30,31):("Spaces Pre Delay","linear_8000_16"),
                (42,43):("Spaces DS","linear_8000_16"),(58,59):("Spaces Decay Time","time_log"),
                (60,61):("Spaces Width","linear_8000_16"),(62,63):("Spaces Length","linear_8000_16"),
                (68,69):("Spaces EL","position_anchor"),(70,71):("Spaces LL","position_anchor"),
                (76,77):("Spaces Low Cut","freq_log"),(78,79):("Spaces High Cut","freq_log"),
                (94,95):("Spaces SL","position_anchor"),(122,123):("Spaces Spread","linear_8000_16"),
                (125,125):("Spaces Echo section","toggle_10_on"),(127,127):("Spaces Echo 1 On/Off","toggle_10_on"),
                (133,133):("Spaces Echo 2 On/Off","toggle_10_on"),(147,147):("Spaces Size Link","toggle_10_on"),
            })
        elif eng == "1c04":
            common.update({
                (46,47):("Spaces damping LF frequency","freq_log"),(64,65):("Spaces damping HF frequency","freq_log"),
                (66,67):("Spaces damping HF shelf gain","offset_db_8000_256"),(68,69):("Spaces EL position","position_anchor"),
                (70,71):("Spaces LL position","position_anchor"),(83,83):("Spaces output HF type","enum"),
                (86,87):("Spaces output HF shelf gain","offset_db_8000_256"),(93,93):("Spaces damping HF type","enum"),
                (94,95):("Spaces SL position","position_anchor"),
            })
            # ReverseEngineer7: remaining controls; offsets match the 1c03 layout.
            for (a,b),val in {
                (30,31):("Spaces Pre Delay","linear_8000_16"),(32,33):("Spaces Density","linear_8000_16"),
                (34,35):("Spaces Impact","linear_8000_16"),(36,37):("Spaces Diffusion Early","linear_8000_16"),
                (38,39):("Spaces Diffusion Mid","linear_8000_16"),(40,41):("Spaces Diffusion Late","linear_8000_16"),
                (42,43):("Spaces Direct Send","linear_8000_16"),(50,51):("Spaces Colour HF Tone","freq_log"),
                (54,55):("Spaces Colour frequency","freq_log"),(56,57):("Spaces Colour gain","offset_db_8000_256"),
                (58,59):("Spaces Decay Time","time_log"),(60,61):("Spaces Width","linear_8000_16"),
                (62,63):("Spaces Length","linear_8000_16"),(72,73):("Spaces Modulation Rate","linear_8000_16"),
                (74,75):("Spaces Modulation Depth","linear_8000_16"),(76,77):("Spaces Output LF Cut","freq_log"),
                (78,79):("Spaces Output HF Cut","freq_log"),(122,123):("Spaces Stereo Spread","linear_8000_16"),
            }.items():
                common[(a,b)] = val
            # Six echo taps, record order L1,L2,L3,R1,R2,R3 (ReverseEngineer6); Echo 1/2 = L1/R1.
            for n, tap, k in ((1,"L1",0),(2,"R1",3),(3,"L2",1),(4,"R2",4),(5,"L3",2),(6,"R3",5)):
                common[(96+4*k, 97+4*k)] = (f"Spaces Echo {n} ({tap}) Time", "linear_8000_16")
                common[(98+4*k, 99+4*k)] = (f"Spaces Echo {n} ({tap}) Gain", "offset_db_8000_256")
                common[(127+2*k, 127+2*k)] = (f"Spaces Echo {n} ({tap}) On/Off", "toggle_10_on")
        elif eng == "1d00":
            # RevEngPlate1: Plate Reverb Designer, UFX Send 2. Same 262-byte AHFX payload
            # and coordinate systems (linear_8000_16, freq_log, time_log) as the Spaces
            # engines, at Plate-specific offsets.
            common.update({
                (30,31):("Plate Pre Delay","linear_8000_16"),(36,37):("Plate Diffusion","linear_8000_16"),
                (38,39):("Plate Size","linear_8000_16"),(40,41):("Plate Shape","linear_8000_16"),
                (56,57):("Plate Decay Time","time_log"),(66,67):("Plate Modulation Speed","linear_8000_16"),
                (68,69):("Plate Modulation Depth","linear_8000_16"),(70,71):("Plate Output LF Cut","freq_log"),
                (72,73):("Plate Output HF Cut","freq_log"),(85,85):("Plate Type preset","enum"),
                (112,113):("Plate Width","linear_8000_16"),(120,121):("Plate Position","linear_8000_16"),
                (131,131):("Plate Echoes section","enum"),
            })
            # Six echo taps, same record order as Spaces (L1,L2,L3,R1,R2,R3); L1/R2 proven,
            # the other four assumed by analogy with the identical Spaces echo layout.
            for n, tap, k in ((1,"L1",0),(2,"R1",3),(3,"L2",1),(4,"R2",4),(5,"L3",2),(6,"R3",5)):
                common[(88+4*k, 89+4*k)] = (f"Plate Echo {n} ({tap}) Time", "linear_8000_16")
                common[(90+4*k, 91+4*k)] = (f"Plate Echo {n} ({tap}) Gain", "offset_db_8000_256")
                common[(133+2*k, 133+2*k)] = (f"Plate Echo {n} ({tap}) On/Off", "toggle_10_on")
        elif eng == "2d00":
            # RevEngRD1: Rhythm Delay, UFX Send 3, Simple mode only. Same 262-byte AHFX
            # payload; BPM uses a new coordinate (raw = round(60000 / BPM), i.e. the delay
            # time in ms for one beat), everything else reuses coordinates already proven
            # on the Spaces/Plate engines.
            common.update({
                (28,29):("Rhythm Delay Tempo","bpm_60000"),
                (30,31):("Rhythm Delay Feedback","offset_db_8000_256"),
                (35,35):("Rhythm Delay Groove","enum"),  # 00 Triplet, 10 Straight, 20 Dotted
                (38,39):("Rhythm Delay Amplitude","linear_8000_16"),
                (144,145):("Rhythm Delay Drive","linear_8000_16"),
                (147,147):("Rhythm Delay Global Tap","toggle_10_on"),
                (148,149):("Rhythm Delay Auto Pan","linear_8000_16"),
            })
        for (a,b),val in common.items():
            if a <= rel_start and rel_end <= b:
                return {"name":val[0],"encoding":val[1],"engine":eng,"field_start":a,"field_end":b}
    return None

def decode_raw(raw: bytes, encoding: str | None) -> Any:
    if not encoding:
        return None
    if encoding == "i16_div256" and len(raw) == 2:
        return int.from_bytes(raw, "big", signed=True) / 256
    if encoding == "freq_log" and len(raw) == 2:
        return 4 * (2 ** (int.from_bytes(raw, "big") / 4608))
    if encoding == "linear_8000_16" and len(raw) == 2:
        return (int.from_bytes(raw, "big") - 0x8000) / 16
    if encoding == "offset_db_8000_256" and len(raw) == 2:
        return (int.from_bytes(raw, "big") - 0x8000) / 256
    if encoding == "delay_96" and len(raw) == 2:
        return int.from_bytes(raw, "big") / 96
    if encoding == "bus_threshold" and len(raw) == 1:
        return raw[0] / 4 - 15
    if encoding == "u8_direct" and len(raw) == 1:
        return raw[0]
    if encoding == "time_log" and len(raw) == 2:
        return 10 ** ((int.from_bytes(raw, "big") - 17874) / 5958)
    if encoding == "bpm_60000" and len(raw) == 2:
        raw16 = int.from_bytes(raw, "big")
        return round(60000 / raw16) if raw16 else None
    return None

def normalize_label_number(name: str) -> dict[str, Any] | None:
    """Extract one obvious numeric control value from a scene name.

    Supports both E1 TIME 100 and 100ms atk style labels. Values are normalized
    to Hz for kHz and milliseconds for us/s where the unit is explicit.
    """
    s = name.strip()
    unit_re = r"(?:µs|us|ms|khz|hz|db|s|%)?"
    end = re.search(rf"(?P<num>[+-]?\d+(?:\.\d+)?)\s*(?P<unit>{unit_re})\s*$", s, re.I)
    start = re.match(rf"^\s*(?P<num>[+-]?\d+(?:\.\d+)?)\s*(?P<unit>{unit_re})\b\s*(?P<rest>.*)$", s, re.I)
    if end:
        num = float(end.group("num")); unit=(end.group("unit") or "").lower(); prefix=s[:end.start()].strip()
    elif start and start.group("rest"):
        num=float(start.group("num")); unit=(start.group("unit") or "").lower(); prefix=start.group("rest").strip()
    else:
        return None
    value=num; normalized_unit=unit
    if unit == "khz": value *= 1000; normalized_unit="hz"
    elif unit in ("us","µs"): value /= 1000; normalized_unit="ms"
    elif unit == "s": value *= 1000; normalized_unit="ms"
    return {"value":value,"unit":normalized_unit,"prefix":re.sub(r"\s+"," ",prefix.upper()).strip()}

def encode_scene_value(known: dict[str,Any] | None, scene_label: str, width: int) -> bytes | None:
    if not known:
        return None
    enc=known.get("encoding")
    meta=normalize_label_number(scene_label)
    value=meta["value"] if meta else None
    raw: int | None=None
    if enc=="linear_8000_16" and value is not None and width==2:
        raw=round(0x8000+16*value)
    elif enc=="delay_96" and value is not None and width==2:
        raw=round(96*value)
    elif enc=="bus_threshold" and value is not None and width==1:
        raw=round((value+15)*4)
    elif enc=="freq_log" and meta and meta.get("unit")=="hz" and value and width==2:
        raw=math.floor(4608*math.log2(value/4))
    elif enc=="bpm_60000" and value and width==2:
        raw=round(60000/value)
    elif enc=="offset_db_8000_256" and value is not None and width==2:
        raw=round(0x8000+value*256)
    elif enc in ("toggle_00_on","toggle_01_on","toggle_10_on") and width==1:
        u=scene_label.upper()
        off=bool(re.search(r"\b(?:OFF|OUT)\b",u))
        on=bool(re.search(r"\b(?:ON|IN)\b",u))
        if off or on:
            active=on and not off
            if enc=="toggle_00_on": raw=0x00 if active else 0x01
            elif enc=="toggle_01_on": raw=0x01 if active else 0x00
            else: raw=0x10 if active else 0x00
    if raw is None:
        return None
    if raw < 0 or raw >= (1 << (8*width)):
        return None
    return int(raw).to_bytes(width,"big")

def writer_check_for_change(rep: dict[str,Any], change: dict[str,Any]) -> dict[str,Any] | None:
    known=change.get("known")
    if not known:
        return None
    fs=change["state_offset_start"]; fe=change["state_offset_end"]; width=fe-fs+1
    encoded=encode_scene_value(known,rep["scene_b"]["name"],width)
    if encoded is None:
        return None
    actual=bytes.fromhex(change["after"])
    return {
        "status":"PASS" if encoded==actual else "FAIL",
        "expected":hex_bytes(encoded),"actual":hex_bytes(actual),
        "note":"target scene label encoded through checker transform",
    }

def diff_scenes(a: Scene, b: Scene, rec_a: list[Record] | None=None, rec_b: list[Record] | None=None) -> dict[str, Any]:
    rec_a = rec_a if rec_a is not None else scan_records(a.data)
    rec_b = rec_b if rec_b is not None else scan_records(b.data)
    by_key_b={(r.frame_start,r.label):r for r in rec_b}
    changes=[]
    record_changed_bytes=0
    for ra in rec_a:
        rb=by_key_b.get((ra.frame_start,ra.label))
        if rb is None or ra.state_length!=rb.state_length:
            continue
        sa=a.data[ra.state_start:ra.frame_end]
        sb=b.data[rb.state_start:rb.frame_end]
        for run in changed_runs(sa,sb):
            rel_s,rel_e=run.start,run.end
            changed_before=sa[rel_s:rel_e+1]; changed_after=sb[rel_s:rel_e+1]
            known=known_field(ra,rel_s,rel_e,a.data)
            fs=known.get("field_start",rel_s) if known else rel_s
            fe=known.get("field_end",rel_e) if known else rel_e
            before=sa[fs:fe+1]; after=sb[fs:fe+1]
            record_changed_bytes += run.width
            changes.append({
                "record":ra.label.strip(),"frame_start":ra.frame_start,"state_start":ra.state_start,
                "state_offset_start":fs,"state_offset_end":fe,
                "changed_offset_start":rel_s,"changed_offset_end":rel_e,
                "offset":fmt_run(fs,fe),"changed_offset":fmt_run(rel_s,rel_e),
                "before":hex_bytes(before),"after":hex_bytes(after),
                "changed_before":hex_bytes(changed_before),"changed_after":hex_bytes(changed_after),
                "known":known,"decoded_before":decode_raw(before,known.get("encoding") if known else None),
                "decoded_after":decode_raw(after,known.get("encoding") if known else None),
            })
    n=min(len(a.data),len(b.data))
    total_changed=sum(1 for i in range(n) if a.data[i]!=b.data[i]) + abs(len(a.data)-len(b.data))
    outside_count=max(0,total_changed-record_changed_bytes)
    return {
        "scene_a":{"number":a.number,"name":a.name},"scene_b":{"number":b.number,"name":b.name},
        "changes":changes,
        "outside_record_changed_bytes":outside_count,
        "data_length_equal":len(a.data)==len(b.data),
    }

def pair_scenes(scenes: dict[int,Scene], max_gap: int=1) -> list[tuple[Scene,Scene]]:
    nums=[n for n in sorted(scenes) if n != 65535]
    return [(scenes[x],scenes[y]) for x,y in zip(nums,nums[1:]) if y-x <= max_gap]

def candidate_groups(reports: list[dict[str,Any]]) -> list[dict[str,Any]]:
    obs: dict[tuple[str,int,int,str,str], dict[float,int]] = defaultdict(dict)
    for rep in reports:
        for ch in rep["changes"]:
            if ch["state_offset_end"]-ch["state_offset_start"]+1 not in (1,2):
                continue
            for side in ("scene_a","scene_b"):
                meta=normalize_label_number(rep[side]["name"])
                if not meta: continue
                raw_hex=ch["before"] if side=="scene_a" else ch["after"]
                raw=int.from_bytes(bytes.fromhex(raw_hex),"big")
                key=(ch["record"],ch["state_offset_start"],ch["state_offset_end"],meta["prefix"],meta["unit"])
                obs[key][meta["value"]]=raw
    out=[]
    for key, vals in obs.items():
        if len(vals)<3: continue
        points=sorted(vals.items())
        xs=[x for x,_ in points]; ys=[y for _,y in points]
        xbar=statistics.mean(xs); ybar=statistics.mean(ys)
        denom=sum((x-xbar)**2 for x in xs)
        if denom==0: continue
        slope=sum((x-xbar)*(y-ybar) for x,y in points)/denom
        intercept=ybar-slope*xbar
        residuals=[abs((intercept+slope*x)-y) for x,y in points]
        exact_linear=max(residuals)<0.51
        known_linear8000=all(abs((0x8000+16*x)-y)<0.51 for x,y in points)
        freq_fit=key[4]=="hz" and all(x>0 for x in xs) and all(abs(math.floor(4608*math.log2(x/4))-y)<=1 for x,y in points)
        out.append({
            "record":key[0],"offset":fmt_run(key[1],key[2]),"scene_prefix":key[3],"unit":key[4],
            "points":[{"value":x,"raw":f"0x{y:0{2*(key[2]-key[1]+1)}X}"} for x,y in points],
            "candidate":("raw = 0x8000 + 16 × value" if known_linear8000 else
                         "dLive log-frequency coordinate" if freq_fit else
                         f"raw ≈ {intercept:.6g} + {slope:.6g} × value" if exact_linear else "non-linear / table"),
            "max_residual":max(residuals),
        })
    return out

def discover(path: str, max_gap: int) -> dict[str,Any]:
    scenes=load_show(path)
    reports=[]
    record_cache={n:scan_records(s.data) for n,s in scenes.items()}
    for a,b in pair_scenes(scenes,max_gap):
        rep=diff_scenes(a,b,record_cache[a.number],record_cache[b.number])
        if rep["changes"]:
            reports.append(rep)
    return {"file":str(path),"scene_count":len(scenes),"pair_count":len(reports),"pairs":reports,"candidates":candidate_groups(reports)}

def validate(path: str, max_gap: int) -> dict[str,Any]:
    d=discover(path,max_gap)
    results=[]
    counts=defaultdict(int)
    for rep in d["pairs"]:
        known=[c for c in rep["changes"] if c["known"]]
        unknown=[c for c in rep["changes"] if not c["known"]]
        if len(rep["changes"])==1 and len(known)==1:
            status="PASS"
        elif known and not unknown:
            status="PASS_MULTI"
        elif known and unknown:
            status="PARTIAL"
        else:
            status="NEW"
        counts[status]+=1
        checks=[]
        for c in known:
            wc=writer_check_for_change(rep,c)
            if wc:
                checks.append({"field":c["known"]["name"],**wc})
                counts[f"WRITER_{wc['status']}"]+=1
        results.append({
            "scene_a":rep["scene_a"],"scene_b":rep["scene_b"],"status":status,
            "known_fields":[c["known"]["name"] for c in known],
            "writer_checks":checks,
            "unknown_changes":[{"record":c["record"],"offset":c["offset"],"before":c["before"],"after":c["after"]} for c in unknown],
            "outside_record_changed_bytes":rep.get("outside_record_changed_bytes",0),
        })
    return {"file":str(path),"scene_count":d["scene_count"],"summary":dict(counts),"results":results,"candidates":d["candidates"]}

def print_diff(rep: dict[str,Any]) -> None:
    a,b=rep["scene_a"],rep["scene_b"]
    print(f"Scene {a['number']}: {a['name']}")
    print(f"Scene {b['number']}: {b['name']}")
    if not rep["changes"]:
        print("No recognised framed-record changes.")
    for c in rep["changes"]:
        print(f"\nRecord: {c['record']}")
        print(f"  state {c['offset']}: {c['before']} -> {c['after']}")
        if c["known"]:
            print(f"  known: {c['known']['name']} [{c['known'].get('encoding') or 'table'}]")
            if c["decoded_before"] is not None or c["decoded_after"] is not None:
                print(f"  decoded: {c['decoded_before']} -> {c['decoded_after']}")
        else:
            print("  known: no — candidate field")
    if rep.get("outside_record_changed_bytes"):
        print(f"\nOutside recognised record states: {rep['outside_record_changed_bytes']} changed byte(s) (usually scene metadata/name or an unmapped record family).")

def print_discover(d: dict[str,Any]) -> None:
    print(f"{d['file']}: {d['scene_count']} StageBox scenes; {d['pair_count']} adjacent pairs with recognised record changes")
    for rep in d["pairs"]:
        a,b=rep["scene_a"],rep["scene_b"]
        parts=[]
        for c in rep["changes"]:
            tag=c["known"]["name"] if c["known"] else "UNKNOWN"
            parts.append(f"{c['record']} {c['offset']} [{tag}] {c['before']}->{c['after']}")
        print(f"{a['number']:>5} {a['name']!r} -> {b['number']:>5} {b['name']!r}: " + "; ".join(parts))
    if d["candidates"]:
        print("\nCandidate transforms (3+ numeric scenes):")
        for c in d["candidates"]:
            unit=f" {c['unit']}" if c['unit'] else ""
            print(f"  {c['record']} {c['offset']} · {c['scene_prefix'] or '(numeric labels)'}{unit}: {c['candidate']}")

def print_validate(v: dict[str,Any]) -> None:
    print(f"{v['file']}: {v['scene_count']} StageBox scenes")
    summary=v["summary"]
    print("Validation summary: " + ", ".join(f"{k}={summary.get(k,0)}" for k in ("PASS","PASS_MULTI","PARTIAL","NEW")))
    if summary.get("WRITER_PASS",0) or summary.get("WRITER_FAIL",0):
        print(f"Writer checks: PASS={summary.get('WRITER_PASS',0)}, FAIL={summary.get('WRITER_FAIL',0)}")
    for r in v["results"]:
        if r["status"] in ("PARTIAL","NEW"):
            a,b=r["scene_a"],r["scene_b"]
            print(f"  [{r['status']}] {a['number']} {a['name']!r} -> {b['number']} {b['name']!r}")
            for u in r["unknown_changes"]:
                print(f"      {u['record']} {u['offset']} {u['before']}->{u['after']}")
        for wc in r.get("writer_checks",[]):
            if wc["status"]=="FAIL":
                a,b=r["scene_a"],r["scene_b"]
                print(f"  [WRITER FAIL] {a['number']}->{b['number']} {wc['field']}: expected {wc['expected']}, actual {wc['actual']}")

def build_parser() -> argparse.ArgumentParser:
    p=argparse.ArgumentParser(description="Automated dLive scene parameter diff/validation helper")
    sub=p.add_subparsers(dest="command",required=True)
    for name in ("discover","validate"):
        q=sub.add_parser(name)
        q.add_argument("show", help="show .tar.gz or a folder of Scene N.dat files")
        q.add_argument("--max-gap",type=int,default=1,help="maximum scene-number gap to compare (default: 1)")
        q.add_argument("--json",action="store_true")
        if name=="validate":
            q.add_argument("--strict",action="store_true",help="exit non-zero for new/partial mappings or writer-check failures")
    q=sub.add_parser("mixconfig", help="decode Show/MixConfig/MixConfig.dat")
    q.add_argument("show")
    q.add_argument("--json",action="store_true")
    q=sub.add_parser("diff")
    q.add_argument("show", help="show .tar.gz or a folder of Scene N.dat files")
    q.add_argument("scene_a",type=int)
    q.add_argument("scene_b",type=int)
    q.add_argument("--json",action="store_true")
    return p

def main(argv: list[str] | None=None) -> int:
    args=build_parser().parse_args(argv)
    try:
        if args.command=="mixconfig":
            result=decode_mixconfig(load_mixconfig(args.show))
            if args.json: print(json.dumps(result,indent=2))
            else:
                for k,v in result.items(): print(f"{k:16s} {v}")
            return 0
        if args.command=="diff":
            scenes=load_show(args.show)
            if args.scene_a not in scenes or args.scene_b not in scenes:
                raise ValueError("Requested scene number not found")
            result=diff_scenes(scenes[args.scene_a],scenes[args.scene_b])
            if args.json: print(json.dumps(result,indent=2))
            else: print_diff(result)
        elif args.command=="discover":
            result=discover(args.show,args.max_gap)
            if args.json: print(json.dumps(result,indent=2))
            else: print_discover(result)
        else:
            result=validate(args.show,args.max_gap)
            if args.json: print(json.dumps(result,indent=2))
            else: print_validate(result)
            if getattr(args,"strict",False):
                sm=result.get("summary",{})
                if sm.get("NEW",0) or sm.get("PARTIAL",0) or sm.get("WRITER_FAIL",0):
                    return 1
        return 0
    except (OSError,tarfile.TarError,ValueError) as e:
        print(f"error: {e}",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
