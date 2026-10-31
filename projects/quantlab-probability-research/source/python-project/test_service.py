import unittest
import tempfile
from pathlib import Path
import numpy as np
from service import make_figures, export_run

class ServiceTests(unittest.TestCase):
    def test_figures_reconcile_and_export_has_no_upload(self):
        report={'latest_forecast':{'probabilities':[.1,.4,.5]},'predictions':[
            {'probabilities':[.1,.4,.5],'actual_log_return':.01,'target_index':1,'feature_index':0,'model':'empirical'}],
            'candidate_metrics':{'empirical':{'log_loss':.8,'brier_multiclass':.6}},
            'selected_metrics':{'reliability':[{'event':'up','predicted':.5,'observed':1.,'n':1,'low':.5}]}}
        figs=make_figures(report,['2020-01-01','2020-01-02'],np.array([100.,101.]))
        self.assertEqual(len(figs),4)
        self.assertAlmostEqual(sum(figs[0].data[0].y),1)
        with tempfile.TemporaryDirectory() as d:
            png=Path(d)/'histogram.png'; png.write_bytes(b'png')
            bundle=export_run(report,{'kind':'SYNTHETIC'}, {'n':2},png,Path(d))
            import zipfile,json
            with zipfile.ZipFile(bundle) as z:
                self.assertIn('report.json',z.namelist())
                self.assertIn('predictions.csv',z.namelist())
                self.assertFalse(any('upload' in name for name in z.namelist()))
                self.assertEqual(json.loads(z.read('report.json'))['source']['kind'],'SYNTHETIC')

if __name__=='__main__': unittest.main()

class ErrorPresentationTests(unittest.TestCase):
    def test_missing_upload_clears_outputs_and_explains_fix(self):
        from app import submit
        result=submit('Upload CSV',None,900,42,[],False,False)
        self.assertEqual(len(result),11)
        self.assertIn('Upload a date,close CSV',result[0])
        self.assertIsNone(result[9])
