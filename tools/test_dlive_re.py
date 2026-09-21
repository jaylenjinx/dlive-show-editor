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

    def test_spaces_medium_echo_taps(self):
        # Minimal AHFX record: engine id 1c04 lives at state +3..4.
        data=bytes(5)+bytes(300)
        data=data[:3]+bytes.fromhex('1c04')+data[5:]
        rec=dl.Record(0,0,262,'AHFX Manager 01',0,len(data))
        expect={(96,97):'Echo 1 (L1) Time',(100,101):'Echo 3 (L2) Time',(104,105):'Echo 5 (L3) Time',
                (108,109):'Echo 2 (R1) Time',(112,113):'Echo 4 (R2) Time',(118,119):'Echo 6 (R3) Gain',
                (127,127):'Echo 1 (L1) On/Off',(137,137):'Echo 6 (R3) On/Off'}
        for (a,b),name in expect.items():
            self.assertEqual(dl.known_field(rec,a,b,data)['name'],'Spaces '+name)

if __name__=='__main__': unittest.main()
