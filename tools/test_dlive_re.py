import importlib.util
import pathlib
import tempfile
import unittest
import sys

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('dlive_re',HERE/'dlive_re.py')
dl=importlib.util.module_from_spec(spec);sys.modules[spec.name]=dl;spec.loader.exec_module(dl)

class CheckerTests(unittest.TestCase):
    def test_numeric_label_units(self):
        self.assertEqual(dl.normalize_label_number('E1 TIME 100')['value'],100)
        self.assertEqual(dl.normalize_label_number('10khz')['value'],10000)
        self.assertAlmostEqual(dl.normalize_label_number('30us atk')['value'],0.03)

    def test_linear_writer_encoding(self):
        known={'encoding':'linear_8000_16'}
        self.assertEqual(dl.encode_scene_value(known,'E3 TIME 100',2),bytes.fromhex('8640'))

    def test_changed_runs(self):
        a=bytes.fromhex('0001020304');b=bytes.fromhex('0001FFFE04')
        self.assertEqual([(r.start,r.end) for r in dl.changed_runs(a,b)],[(2,3)])

    def test_load_scene_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            for n,name in ((7,b'CTL 1'),(8,b'CTL 2')):
                (pathlib.Path(tmp)/f'Scene {n}.dat').write_bytes(b'\x00\x01'+name+b'\x00'+bytes(16))
            (pathlib.Path(tmp)/'SceneUpdateFilters.dat').write_bytes(b'x')
            scenes=dl.load_show(tmp)
            self.assertEqual(sorted(scenes),[7,8])
            self.assertEqual(scenes[8].name,'CTL 2')

    def test_input_mixer_send_layout(self):
        header=bytes.fromhex('03 04 09 04 04 06 06 02 02 00 01 01')
        entries,section,size=dl.input_mixer_layout(header)
        self.assertEqual(size,208)
        where={n:o for n,o,w in entries}
        self.assertEqual((where['FX 1'],where['Aux 1'],where['St FX 1'],where['St Aux 1'],where['Mtx 1'],where['St Mtx 1'],where['UFX 1']),
                         (13,29,53,73,103,111,168))
        self.assertEqual(section+3,208-84)  # verified fader offset
        # legacy (version 2) blocks have no UFX sends
        self.assertEqual(dl.input_mixer_layout(bytes.fromhex('02 04 04 08 00 08 08 04 04 01 01 01'))[2],195)

if __name__=='__main__': unittest.main()
