import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mixconfig_convert as mc  # noqa: E402

BASE = mc.Config(0, 8, 8, 0, 6, 4, 2, 2, main=5, combined=True)  # Director test config (5.1 combined)


def synth_mix(cfg, ver=4, fill=False):
    """Mix Mixer state built from the layout, optionally with a distinct value per entry."""
    h = cfg.mix_header(ver); out = bytearray(h)
    for n, (k, w, d) in enumerate(mc.mix_keys(h)):
        out += bytes([(n * 7 + i) % 251 for i in range(w)]) if fill else d
    return bytes(out)


def synth_chan(cfg, n, ver=3):
    h = cfg.input_header(ver); keys, size = mc.chan_layout(h)
    body = bytes((i * 13) % 251 for i in range(n * size))
    return h + body


class MixConfigConvertTest(unittest.TestCase):
    def test_main_legs_and_blocks_match_director(self):
        cases = {  # (main type, combined): (legs, Mix Mixer blocks, mix channels) from Director 2.12 scenes
            (0, True): ([], 0), (1, True): ([(1, "L"), (1, "R")], 1), (1, False): ([(1, ""), (2, "")], 2),
            (4, True): ([(1, "L"), (1, "R"), (3, ""), (4, "")], 2), (4, False): ([(i, "") for i in (1, 2, 3, 4)], 3),
            (5, True): ([(1, "L"), (1, "R"), (3, ""), (4, ""), (5, "L"), (5, "R")], 4),
            (5, False): ([(i, "") for i in range(1, 7)], 6),
        }
        for (main, comb), (legs, blocks) in cases.items():
            cfg = mc.Config(0, 8, 8, 0, 6, 4, 2, 2, main=main, combined=comb)
            self.assertEqual((cfg.main_legs(), cfg.main_blocks()), (legs, blocks), (main, comb))

    def test_mix_mixer_size_matches_director(self):
        self.assertEqual(len(synth_mix(BASE)), 2811)
        self.assertEqual(len(synth_mix(mc.Config(2, 8, 8, 0, 6, 4, 2, 2, main=4))), 3109)
        self.assertEqual(len(synth_mix(mc.Config(0, 9, 10, 0, 8, 5, 2, 3, main=5))), 3634)

    def test_mix_mixer_round_trip_keeps_every_entry(self):
        src = synth_mix(BASE, fill=True)
        bigger = mc.Config(2, 9, 10, 2, 8, 5, 4, 3, main=5)
        self.assertEqual(mc.convert_mix_mixer(mc.convert_mix_mixer(src, bigger), BASE), src)

    def test_channel_mixer_round_trip(self):
        src = synth_chan(BASE, 128)
        bigger = mc.Config(2, 8, 8, 2, 6, 4, 4, 2, main=5)
        self.assertEqual(mc.convert_chan_mixer(mc.convert_chan_mixer(src, 128, bigger), 128, BASE), src)

    def test_new_sends_get_director_defaults(self):
        out = mc.convert_chan_mixer(synth_chan(BASE, 1), 1, mc.Config(2, 8, 8, 0, 6, 4, 2, 2, main=5))
        self.assertEqual(out[12:14], b"\0\0")  # new mono group assigns

    def test_mix_slots_order(self):
        cfg = mc.Config(2, 4, 16, 0, 8, 4, 4, 2, main=1, pafl=2)  # MultiSurface FoH layout
        s = mc.mix_slots(cfg)
        self.assertEqual((s.index(("MAux", 0)), s.index(("SAux", 3, "L")), s.index(("Main", 0)), s.index(("MMtx", 0))),
                         (26, 40, 42, 48))

    def test_bus_record_labels(self):
        labels = [l for l, _ in mc.bus_records(mc.Config(1, 1, 1, 0, 0, 0, 0, 0, main=0))]
        self.assertEqual(labels[:3], ["Parametric EQ, Mono Group Channel 01 ", "Parametric EQ, Stereo Group Channel 01 Left",
                                      "Parametric EQ, Stereo Group Channel 01 Right"])
        self.assertIn("Send Source Select, Mono FX 01 ", labels)
        self.assertEqual(mc.bus_default("Compressor side chain source", ("Stereo Matrix", 3, "R")), bytes([1, 11, 2]))


if __name__ == "__main__":
    unittest.main()
