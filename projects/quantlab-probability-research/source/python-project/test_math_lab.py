"""Analytic identities and reproducible simulation checks."""
import unittest
import numpy as np
import math_lab as m


class MathLabTests(unittest.TestCase):
    def test_prisoners_dilemma(self):
        result = m.game_analysis([[3, 0], [5, 1]], [[3, 5], [0, 1]])
        self.assertEqual(result['pure_nash'], [(1, 1)])
        self.assertEqual(result['strict_dominant_rows'], [1])
        self.assertNotIn((1, 1), result['pareto_pure'])

    def test_matching_pennies(self):
        result = m.zero_sum_2x2([[1, -1], [-1, 1]])
        self.assertEqual(result, dict(row_probability=.5, column_probability=.5, value=0.))
        with self.assertRaises(ValueError):
            m.zero_sum_2x2([[1, 1], [1, 1]])

    def test_probability(self):
        self.assertAlmostEqual(m.bayes_binary(.01, .99, .05), .0099 / .0594)
        self.assertEqual(m.independence_gap(.5, .4, .2), 0)
        self.assertAlmostEqual(m.normal_pdf_cdf(0)[1], .5)
        self.assertEqual(m.mean_z_test([-1, 1])['p_value'], 1.)
        with self.assertRaises(ValueError):
            m.independence_gap(.9, .9, .1)
        clt = m.clt_experiment()
        self.assertLess(abs(clt['mean']), .1)
        self.assertLess(abs(clt['variance'] - 1), .15)

    def test_algebra_calculus(self):
        a, b, x = np.diag([2., 4.]), np.array([1., 2.]), np.array([.2, -.3])
        result = m.linear_algebra(a, b)
        np.testing.assert_allclose(result['reconstruction'], a)
        self.assertAlmostEqual(result['determinant'], 8)
        result = m.quadratic_calculus(a, b, x)
        h = 1e-5
        f = lambda z: .5 * z @ a @ z + b @ z
        numeric = [(f(x + h * e) - f(x - h * e)) / (2 * h) for e in np.eye(2)]
        np.testing.assert_allclose(result['gradient'], numeric, atol=1e-9)
        np.testing.assert_allclose(result['hessian'], a)
        self.assertAlmostEqual(m.taylor_exp(.1, 8), np.exp(.1), places=12)

    def test_markov(self):
        frequency = m.markov_monte_carlo([[.9, .1], [.2, .8]], steps=30000)
        np.testing.assert_allclose(frequency, [2/3, 1/3], atol=.025)
        with self.assertRaises(ValueError):
            m.markov_monte_carlo([[1, 1], [0, 1]])

    def test_pricing_sizing(self):
        prices = m.black_scholes(100, 100, 1, .05, .2)
        self.assertAlmostEqual(prices['call'], 10.450583572185565)
        self.assertAlmostEqual(prices['call'] - prices['put'], 100 - 100 * np.exp(-.05))
        self.assertAlmostEqual(m.kelly_binary(.6), .05)
        self.assertEqual(m.kelly_binary(.4), 0)

    def test_graph_and_random_matrices(self):
        self.assertEqual(m.er_graph(20, 0)['edges'], 0)
        self.assertEqual(m.er_graph(20, 19)['largest_component_fraction'], 1)
        result = m.random_matrix_experiment()
        self.assertTrue(np.all(result['eigenvalues'] >= 0))
        self.assertEqual(len(result['eigenvalues']), 40)
        self.assertLess(abs(result['centered_alternating_moment']), .08)


if __name__ == '__main__':
    unittest.main()
