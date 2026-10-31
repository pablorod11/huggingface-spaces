import unittest
import numpy as np
import pipeline as p

class PipelineTests(unittest.TestCase):
    def test_causal_features_and_labels(self):
        close=np.exp(np.cumsum(np.linspace(-.02,.02,150)))
        x,y,ix=p.features(close)
        changed=close.copy(); changed[120:]*=1.5
        x2,_,ix2=p.features(changed)
        np.testing.assert_allclose(x[ix<120],x2[ix2<120])
        np.testing.assert_allclose(y,np.log(close[ix+1]/close[ix]))
    def test_linear_estimators_and_shrinkage(self):
        x=np.arange(20.)[:,None]; y=2*x[:,0]+1
        a=p.linear_fit(x,y,0,0); b=p.linear_fit(x,y,5,0)
        self.assertAlmostEqual(a[0],1,places=6)
        self.assertAlmostEqual(a[1],2,places=6)
        self.assertLess(abs(b[1]),abs(a[1]))
        c=p.linear_fit(x,y,0,10000)
        self.assertAlmostEqual(c[1],0,places=6)
    def test_probability_conservation(self):
        x=np.array([[-1.],[0.],[1.]])
        models=p.fit_models(x,np.array([-.03,-.01,.02]))
        for model in models.values():
            q,mu,sigma=p.predict(model,x)
            self.assertTrue(np.all(q>=0)); np.testing.assert_allclose(q.sum(1),1)
            self.assertTrue(np.all(np.isfinite(mu)))
        self.assertAlmostEqual(p.normal_cdf(0),.5)
    def test_time_separation_and_metrics(self):
        close=p.synthetic(900,7)
        report=p.evaluate(close,min_train=300,calibration=100,block=100)
        for fold in report['folds']:
            self.assertLess(fold['train_label_end'],fold['calibration_feature_start'])
            self.assertLess(fold['calibration_label_end'],fold['test_feature_start'])
        self.assertGreater(report['test_observations'],100)
        self.assertTrue(0<=report['selected_metrics']['brier_multiclass']<=2)
        for row in report['predictions']:
            self.assertAlmostEqual(sum(row['probabilities']),1)
    def test_invalid_prices(self):
        for data in ([1,0,2],[1,float('nan'),2],[-1,2,3]):
            with self.assertRaises(ValueError): p.features(data)
        with self.assertRaises(ValueError): p.evaluate(p.synthetic(150,1))
    def test_holdout_mutation_does_not_change_earlier_forecast(self):
        a=p.synthetic(850,9); b=a.copy(); b[700:]*=1.3
        ra=p.evaluate(a,min_train=300,calibration=100,block=100)
        rb=p.evaluate(b,min_train=300,calibration=100,block=100)
        earlya=[r['probabilities'] for r in ra['predictions'] if r['feature_index']<699]
        earlyb=[r['probabilities'] for r in rb['predictions'] if r['feature_index']<699]
        np.testing.assert_allclose(earlya,earlyb)


class ForecastTests(unittest.TestCase):
    def test_latest_forecast_is_after_last_observation(self):
        result=p.latest_forecast(p.synthetic(1000,4),min_train=300,calibration=100)
        self.assertEqual(result['feature_index'],999)
        self.assertEqual(result['target_index'],1000)
        self.assertAlmostEqual(sum(result['probabilities']),1)
    def test_csv_rejects_unsorted_dates(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'bad.csv'
            path.write_text('date,close\n2020-01-02,1\n2020-01-01,2\n')
            with self.assertRaises(ValueError): p.load_csv(path)
    def test_linear_rejects_nonfinite(self):
        with self.assertRaises(ValueError): p.linear_fit(np.array([[0.],[np.nan]]),np.array([0.,1.]))

class ValidationTests(unittest.TestCase):
    def test_invalid_probabilities_rejected(self):
        for q in ([[1.,-1.,1.]],[[float('nan'),0.,1.]],[[.1,.1,.1]]):
            with self.assertRaises(ValueError): p.metrics(np.array([.01]),np.array(q))
    def test_invalid_penalties_rejected(self):
        with self.assertRaises(ValueError): p.linear_fit(np.ones((3,1)),np.zeros(3),float('nan'),0)

if __name__=='__main__': unittest.main()
