import importlib.util
import pathlib
import sys
import unittest

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('director_automation',HERE/'director_automation.py')
da=importlib.util.module_from_spec(spec);sys.modules[spec.name]=da;spec.loader.exec_module(da)

class DirectorAutomationTests(unittest.TestCase):
    def test_expand_sweep_includes_control_pair(self):
        sweep={
            'version':1,
            'control_scenes':['CTL 1','CTL 2'],
            'sweeps':[{'control':'echo3.time','scene':'E3 TIME {value}','values':[0,100,200]}],
        }
        items=da.expand_sweep(sweep)
        self.assertEqual([x.scene for x in items],['CTL 1','CTL 2','E3 TIME 0','E3 TIME 100','E3 TIME 200'])
        self.assertEqual(items[-1].entry,'200')

    def test_unique_controls(self):
        sweep={'version':1,'control_scenes':[], 'sweeps':[
            {'control':'a','scene':'A {value}','values':[1,2]},
            {'control':'b','scene':'B {value}','values':[3]},
            {'control':'a','scene':'A2 {value}','values':[4]},
        ]}
        self.assertEqual(da.unique_controls(da.expand_sweep(sweep)),['a','b'])

    def test_scene_row_calculation(self):
        sweep={'version':1,'control_scenes':[], 'sweeps':[{'control':'a','scene':'A {value}','values':[1]}]}
        profile=da.build_default_profile(sweep,{
            'scene_first_row':[100,200], 'scene_second_row':[100,225],
            'focus_safe':[1,1], 'scene_manager':[2,2], 'store_button':[3,3],
            'scene_name_field':[4,4], 'scene_confirm':[5,5], 'return_processing':[6,6],
            'control:a':[7,7]
        })
        profile['scene']['start_offset']=2
        self.assertEqual(da._scene_row_point(profile,3),[100.0,325.0])

    def test_selected_row_mode_description(self):
        sweep={'version':1,'control_scenes':[], 'sweeps':[{'control':'a','scene':'A {value}','values':[1,2]}]}
        captured={
            'scene_first_row':[100,200], 'scene_second_row':[100,225],
            'focus_safe':[1,1], 'scene_manager':[2,2], 'store_button':[3,3],
            'scene_name_field':[4,4], 'scene_confirm':[5,5], 'return_processing':[6,6],
            'control:a':[7,7]
        }
        profile=da.build_default_profile(sweep,captured)
        profile['scene']['row_mode']='selected'
        plan=da.build_plan(sweep,profile)
        action=next(x for x in plan[1]['actions'] if x.get('click_scene_row'))
        self.assertIn('Down Arrow', da._expand_action(action,profile,plan[1]['item'],1))

    def test_build_plan_dry(self):
        sweep={'version':1,'control_scenes':['CTL 1'], 'sweeps':[{'control':'a','scene':'A {value}','values':[1]}]}
        captured={
            'scene_first_row':[100,200], 'scene_second_row':[100,225],
            'focus_safe':[1,1], 'scene_manager':[2,2], 'store_button':[3,3],
            'scene_name_field':[4,4], 'scene_confirm':[5,5], 'return_processing':[6,6],
            'control:a':[7,7]
        }
        profile=da.build_default_profile(sweep,captured)
        plan=da.build_plan(sweep,profile)
        self.assertEqual(len(plan),2)
        self.assertEqual(plan[0]['item'].kind,'control')
        self.assertEqual(plan[1]['item'].control,'a')

if __name__=='__main__': unittest.main()
