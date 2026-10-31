import unittest
from unittest.mock import patch
import json
import numpy as np
import engine
import pipeline

class EngineTests(unittest.TestCase):
    def test_fallback_and_latest(self):
        prices=pipeline.synthetic(950,3)
        r=engine.run_experiment(prices,backends=())
        self.assertTrue(r['predictions'])
        self.assertEqual(r['latest_forecast']['feature_index'],949)
        self.assertEqual(r['latest_forecast']['target_index'],950)
        self.assertLess(r['latest_forecast']['calibration_label_end'],949)
        for row in r['predictions']+[r['latest_forecast']]:
            np.testing.assert_allclose(sum(row['probabilities']),1)
        for f in r['folds']:
            self.assertLess(f['train_label_end'],f['calibration_feature_start'])
            self.assertLess(f['calibration_label_end'],f['test_feature_start'])
    def test_future_mutation(self):
        a=pipeline.synthetic(1000,4); b=a.copy(); b[850:]*=1.2
        x=engine.run_experiment(a,backends=()); y=engine.run_experiment(b,backends=())
        for i,j in zip(x['predictions'],y['predictions']):
            if i['feature_index']<850: np.testing.assert_allclose(i['probabilities'],j['probabilities'])
    def test_absent_classes(self):
        r=engine.run_experiment(np.exp(np.arange(850)*.0001),backends=('sklearn',))
        self.assertTrue(r['latest_forecast'])
        self.assertIn('sklearn',r['model_status'])
    def test_optional_dependencies_unavailable(self):
        with patch('engine.importlib.import_module',side_effect=ImportError('simulated missing dependency')):
            report=engine.run_experiment(pipeline.synthetic(800,2),backends=('xgboost','lightgbm'),tune=True,explain=True)
        self.assertEqual(report['model_status']['xgboost']['status'],'unavailable')
        self.assertEqual(report['shap_explanation']['status'],'skipped')
        self.assertEqual(report['tuning_trials'][0]['status'],'skipped')
        json.dumps(report,allow_nan=False)
    def test_float32_backend_roundoff(self):
        class Estimator:
            classes_=np.arange(3)
            def predict_proba(self,x):
                return np.tile(np.array([.1,.2,.7],dtype=np.float32),(len(x),1))
        q=engine._probability(Estimator(),np.ones((2,1)))
        np.testing.assert_allclose(q.sum(1),1,rtol=0,atol=1e-14)
    def test_invalid(self):
        with self.assertRaises(ValueError): engine.run_experiment([1]*100)
        with self.assertRaises(ValueError): engine.run_experiment([1]*900,dates=['x'])
        with self.assertRaises(ValueError): engine.run_experiment([1]*900,backends=('bogus',))

if __name__=='__main__': unittest.main()
