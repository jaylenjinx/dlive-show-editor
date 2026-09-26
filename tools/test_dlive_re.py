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

    def test_spaces_medium_remaining_controls(self):
        data=bytes(3)+bytes.fromhex('1c04')+bytes(300)
        rec=dl.Record(0,0,262,'AHFX Manager 01',0,len(data))
        self.assertEqual(dl.known_field(rec,30,31,data)['name'],'Spaces Pre Delay')
        self.assertEqual(dl.known_field(rec,37,37,data)['name'],'Spaces Diffusion Early')
        self.assertEqual(dl.known_field(rec,58,59,data)['encoding'],'time_log')
        self.assertAlmostEqual(dl.decode_raw(bytes.fromhex('8BA3'),'time_log'),1000,delta=1)
        self.assertEqual(dl.encode_scene_value({'encoding':'linear_8000_16'},'PREDLY 170',2),bytes.fromhex('8AA0'))

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

    def test_input_mixer_dca_mutegroup_labels(self):
        header=bytes.fromhex('03 04 09 04 04 06 06 02 02 00 01 01')
        _,section,size=dl.input_mixer_layout(header)
        state_len=12+128*size
        rec=dl.Record(0,2,state_len+20,'Input Mixer',20,20+state_len)
        data=bytearray(20+state_len); data[20:32]=header
        base=12+12*size  # CH13
        # RevEng scenes: DCA1 = end-72, DCA24 = end-49, Mute Group 1 = end-48, Mute Group 8 = end-41
        for off,name in [(size-72,'DCA 1'),(size-49,'DCA 24'),(size-48,'Mute Group 1'),(size-41,'Mute Group 8')]:
            f=dl.input_mixer_field(rec,base+off,base+off,bytes(data))
            self.assertEqual(f['name'],f'CH13 {name} assign')
    def test_direct_output_labels(self):
        rec=dl.Record(0,2,20,'Direct Output, Input Channel 13',20,23)
        self.assertEqual(dl.known_field(rec,1,2,bytes(3))['name'],'Direct out level')
        g=dl.Record(0,2,20,'Global Direct Outputs',20,26)
        self.assertEqual(dl.known_field(g,1,1,bytes(6))['name'],'Global direct-out source')
    def test_bus_record_labels_reuse_input_layouts(self):
        for label,rel,name in [('Compressor, Mono Aux Channel 01',(15,15),'Mono Aux 1 Compressor ratio'),
                               ('Parametric EQ, Stereo Group Channel 03 Left',(3,4),'Stereo Group 3 Left PEQ band 1 frequency'),
                               ('Mix Delay, Mono Matrix Channel 01',(1,2),'Mono Matrix 1 Input delay')]:
            rec=dl.Record(0,2,50,label+' ',20,60)
            self.assertEqual(dl.known_field(rec,rel[0],rel[1],bytes(80))['name'],name)

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

    def test_plate_engine_fields(self):
        data=bytes(3)+bytes.fromhex('1d00')+bytes(300)
        rec=dl.Record(0,0,262,'AHFX Manager 02',0,len(data))
        self.assertEqual(dl.known_field(rec,30,31,data)['name'],'Plate Pre Delay')
        self.assertEqual(dl.known_field(rec,88,89,data)['name'],'Plate Echo 1 (L1) Time')
        self.assertEqual(dl.known_field(rec,90,91,data)['name'],'Plate Echo 1 (L1) Gain')
        self.assertEqual(dl.known_field(rec,104,105,data)['name'],'Plate Echo 4 (R2) Time')
        self.assertEqual(dl.known_field(rec,133,133,data)['name'],'Plate Echo 1 (L1) On/Off')
        self.assertEqual(dl.known_field(rec,143,143,data)['name'],'Plate Echo 6 (R3) On/Off')
        self.assertEqual(dl.decode_raw(bytes.fromhex('5900'),'offset_db_8000_256'),-39.0)
        self.assertEqual(dl.decode_raw(bytes.fromhex('8A00'),'offset_db_8000_256'),10.0)

    def test_mixconfig_load_from_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            import tarfile as tf
            show_dir = pathlib.Path(tmp) / 'Show' / 'MixConfig'
            show_dir.mkdir(parents=True)
            (show_dir / 'MixConfig.dat').write_bytes(bytes.fromhex('01 04 09 04 04 06 06 01 00 02 02 01 17'.replace(' ', '')))
            archive = pathlib.Path(tmp) / 'test.tar.gz'
            with tf.open(archive, 'w:gz') as t:
                t.add(show_dir / 'MixConfig.dat', arcname='Show/MixConfig/MixConfig.dat')
            raw = dl.load_mixconfig(archive)
            self.assertEqual(dl.decode_mixconfig(raw)['main_type'], 'None')

    def test_rhythm_delay_engine_fields(self):
        data=bytes(3)+bytes.fromhex('2d00')+bytes(300)
        rec=dl.Record(0,0,262,'AHFX Manager 03',0,len(data))
        self.assertEqual(dl.known_field(rec,28,29,data)['name'],'Rhythm Delay Tempo')
        self.assertEqual(dl.known_field(rec,28,29,data)['encoding'],'bpm_60000')
        self.assertEqual(dl.known_field(rec,30,31,data)['name'],'Rhythm Delay Feedback')
        self.assertEqual(dl.known_field(rec,35,35,data)['name'],'Rhythm Delay Groove')
        self.assertEqual(dl.known_field(rec,147,147,data)['name'],'Rhythm Delay Global Tap')
        self.assertEqual(dl.known_field(rec,148,149,data)['name'],'Rhythm Delay Auto Pan')

    def test_bpm_60000_encoding(self):
        self.assertEqual(dl.decode_raw(bytes.fromhex('071A'),'bpm_60000'),33)
        self.assertEqual(dl.decode_raw(bytes.fromhex('003C'),'bpm_60000'),1000)
        self.assertEqual(dl.encode_scene_value({'encoding':'bpm_60000'},'BPM 500',2),bytes.fromhex('0078'))

if __name__=='__main__': unittest.main()
