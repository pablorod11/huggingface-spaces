import unittest
import numpy as np
from advanced import arima_p10, CoxPH, BayesianNetwork, IsolationForest, fractional_brownian, sle_trace

class AdvancedTests(unittest.TestCase):
    def test_arima_linear(self):
        result = arima_p10(np.arange(40.), 2, 3)
        np.testing.assert_allclose(result, [40,41,42], atol=1e-8)
    def test_cox(self):
        model = CoxPH().fit(np.array([[0.],[1.],[0.],[1.],[0.],[1.]]), [8,2,9,3,10,4], [1]*6)
        self.assertGreater(model.coef_[0], 0)
        s = model.survival([[0.],[1.]], [0,3,10])
        self.assertTrue(np.all(np.diff(s,axis=1)<=0))
        self.assertTrue(np.all((s>=0)&(s<=1)))
    def test_bayes(self):
        net = BayesianNetwork({'A':([], np.array([.7,.3])), 'B':(['A'],np.array([[.9,.1],[.2,.8]]))})
        self.assertAlmostEqual(net.query('A', {'B':1})[1], .24/.31)
    def test_isolation(self):
        x=np.r_[np.zeros((30,1)),[[100.]]]
        forest=IsolationForest(trees=50,seed=2).fit(x)
        self.assertGreater(forest.score_samples([[100.]])[0],forest.score_samples([[0.]])[0])
    def test_fractional(self):
        t,b=fractional_brownian(12,.1,seed=3)
        self.assertEqual(b[0],0)
        self.assertEqual(t[-1],1)
        np.testing.assert_allclose(b,fractional_brownian(12,.1,seed=3)[1])
    def test_sle(self):
        result=sle_trace(0,20,.001)
        self.assertEqual(len(result),20)
        self.assertTrue(np.all(np.isfinite(result)))
    def test_bayes_impossible(self):
        net=BayesianNetwork({'A':([],np.array([1.,0.]))})
        with self.assertRaises(ValueError): net.query('A',{'A':1})
        with self.assertRaises(ValueError): BayesianNetwork({'A':([],np.array([.8,.8]))})
    def test_cox_censoring(self):
        model=CoxPH(iterations=100).fit([[0],[1],[0],[1]],[1,2,3,4],[1,0,1,0])
        survival=model.survival([[0]],[0,1,2,3,4])[0]
        self.assertEqual(survival[1],survival[2])
        self.assertEqual(survival[3],survival[4])
    def test_sle_vertical_exact(self):
        tips=sle_trace(0,12,.01)
        np.testing.assert_allclose(tips.real,0,atol=1e-12)
        np.testing.assert_allclose(tips.imag,2*np.sqrt(np.arange(1,13)*.01))
    def test_invalid(self):
        with self.assertRaises(ValueError): fractional_brownian(4,1.2)
        with self.assertRaises(ValueError): arima_p10([1,2],2)
        with self.assertRaises(ValueError): CoxPH().fit([[0],[1]],[1,2],[0,0])

if __name__=='__main__': unittest.main()
