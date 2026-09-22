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

    def test_decode_mixconfig(self):
        a=dl.decode_mixconfig(bytes.fromhex('01 02 07 06 03 04 05 01 01 01 08 02 17'))
        self.assertEqual((a['mono_groups'],a['stereo_groups'],a['mono_fx'],a['stereo_fx'],a['mono_aux'],a['stereo_aux']),(2,7,6,3,4,5))
        self.assertEqual((a['stereo_matrices'],a['mono_matrices'],a['pafl'],a['main_type'],a['main_strips']),(1,8,2,'LR','Combined'))
        self.assertEqual(dl.decode_mixconfig(bytes.fromhex('01 02 07 06 03 04 05 00 05 01 08 02 17'))['main_type'],'5.1 Surround')

    def test_config_a_layout(self):
        # RevEngCfgA: every send offset measured on input 13 matches the rule
        entries,section,size=dl.input_mixer_layout(bytes.fromhex('03 02 07 06 03 04 05 08 01 01 01 02'))
        where={n:o for n,o,w in entries}
        self.assertEqual(size,213)
        self.assertEqual((where['FX 6']+2,where['Aux 4']+2,where['St FX 3']+2,where['St Aux 5']+2,where['Mtx 8']+2,where['St Mtx 1']+2,where['UFX 8']+2),
                         (31,47,61,86,119,123,210))
        self.assertEqual((section,section+3,section+5),(126,129,131))  # Main On / level / pan

if __name__=='__main__': unittest.main()
