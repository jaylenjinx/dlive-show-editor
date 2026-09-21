import importlib.util
import pathlib
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

if __name__=='__main__': unittest.main()
