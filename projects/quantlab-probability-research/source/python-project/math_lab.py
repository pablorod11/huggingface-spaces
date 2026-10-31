"""Small, inspectable quantitative experiments; not a trading recommendation.

These are mathematical demonstrations, not fitted market models. The RMT/free
probability experiment illustrates independent Gaussian covariance matrices only;
it does not establish asymptotic freeness for financial observations. The graph
experiment illustrates the ER giant-component transition, not optimization
hardness. All random routines accept an explicit seed.
"""
from math import erf, exp, factorial, isfinite, log, pi, sqrt
import numpy as np


def _array(x, ndim=None):
    a = np.asarray(x, dtype=float)
    if not np.all(np.isfinite(a)) or (ndim is not None and a.ndim != ndim):
        raise ValueError("Expected a finite array with the required dimension")
    if a.size == 0:
        raise ValueError("Empty arrays are unsupported")
    return a


def _prob(x):
    if not isfinite(x) or not 0 <= x <= 1:
        raise ValueError("Probability must lie in [0, 1]")
    return x


def game_analysis(row_payoffs, column_payoffs):
    """Enumerate pure Nash, strict dominant actions and Pareto-efficient outcomes.

    Rows are player 1 actions; columns are player 2 actions. Pareto comparison
    covers pure outcomes only, excluding randomized attainable payoff mixtures.
    """
    a, b = _array(row_payoffs, 2), _array(column_payoffs, 2)
    if a.shape != b.shape:
        raise ValueError("Payoff matrices must have identical shapes")
    nash, pareto = [], []
    for i, j in np.ndindex(a.shape):
        if a[i, j] >= a[:, j].max() and b[i, j] >= b[i, :].max():
            nash.append((i, j))
        dominates = (a >= a[i, j]) & (b >= b[i, j]) & ((a > a[i, j]) | (b > b[i, j]))
        if not dominates.any():
            pareto.append((i, j))
    row_dominant = [i for i in range(a.shape[0]) if all(
        np.all(a[i] > a[k]) for k in range(a.shape[0]) if k != i)]
    col_dominant = [j for j in range(b.shape[1]) if all(
        np.all(b[:, j] > b[:, k]) for k in range(b.shape[1]) if k != j)]
    return dict(pure_nash=nash, pareto_pure=pareto,
                strict_dominant_rows=row_dominant, strict_dominant_columns=col_dominant)


def zero_sum_2x2(payoffs):
    """Solve a nondegenerate interior mixed equilibrium; reject boundary cases."""
    a = _array(payoffs, 2)
    if a.shape != (2, 2):
        raise ValueError("Requires a 2x2 row-player payoff matrix")
    aa, bb, cc, dd = a.ravel()
    denom = aa - bb - cc + dd
    if abs(denom) < 1e-12:
        raise ValueError("Degenerate game; use a general game solver")
    p, q = (dd - cc) / denom, (dd - bb) / denom
    if not (0 < p < 1 and 0 < q < 1):
        raise ValueError("No nondegenerate interior equilibrium")
    return dict(row_probability=float(p), column_probability=float(q),
                value=float((aa * dd - bb * cc) / denom))


def bayes_binary(prior, likelihood_true, likelihood_false):
    prior, lt, lf = map(_prob, (prior, likelihood_true, likelihood_false))
    evidence = prior * lt + (1 - prior) * lf
    if evidence == 0:
        raise ValueError("Conditioning event has zero probability")
    return prior * lt / evidence


def independence_gap(p_a, p_b, p_intersection):
    """Zero means independent for the specified pair of events only."""
    pa, pb, pab = map(_prob, (p_a, p_b, p_intersection))
    if pab < max(0, pa + pb - 1) - 1e-12 or pab > min(pa, pb) + 1e-12:
        raise ValueError("Impossible joint probability")
    return pab - pa * pb


def normal_pdf_cdf(x, mean=0., sigma=1.):
    if not all(map(isfinite, (x, mean, sigma))) or sigma <= 0:
        raise ValueError("Finite values and positive sigma required")
    z = (x - mean) / sigma
    return exp(-z * z / 2) / (sigma * sqrt(2 * pi)), (1 + erf(z / sqrt(2))) / 2


def clt_experiment(sample_size=100, repetitions=2000, seed=7):
    """Standardized means of IID Exp(1) samples, whose mean/variance are one."""
    if sample_size < 1 or repetitions < 2:
        raise ValueError("Positive sample size and at least two repetitions required")
    z = (np.random.default_rng(seed).exponential(size=(repetitions, sample_size)).mean(axis=1) - 1) * sqrt(sample_size)
    return dict(mean=float(z.mean()), variance=float(z.var(ddof=1)))


def mean_z_test(sample, null_mean=0., known_sigma=1.):
    """Two-sided normal test, exact for IID normal data with KNOWN sigma.

    For dependent returns or estimated sigma this is not a valid exact test.
    """
    x = _array(sample, 1)
    if not isfinite(null_mean) or not isfinite(known_sigma) or known_sigma <= 0:
        raise ValueError("Finite null mean and positive known sigma required")
    z = float((x.mean() - null_mean) * sqrt(len(x)) / known_sigma)
    return dict(z=z, p_value=1 - erf(abs(z) / sqrt(2)))


def linear_algebra(matrix, vector):
    a, v = _array(matrix, 2), _array(vector, 1)
    if a.shape[1] != len(v):
        raise ValueError("Incompatible matrix and vector")
    u, s, vt = np.linalg.svd(a, full_matrices=False)
    return dict(dot=a @ v, rank=int(np.linalg.matrix_rank(a)), singular_values=s,
                reconstruction=(u * s) @ vt,
                eigenvalues=np.linalg.eigvals(a) if a.shape[0] == a.shape[1] else None,
                determinant=float(np.linalg.det(a)) if a.shape[0] == a.shape[1] else None)


def quadratic_calculus(matrix, vector, x):
    """f(x)=1/2 x' A x + b'x; exact derivative, gradient and Hessian.

    Directional derivative in direction b is grad(f)'b. Chain rule example
    computes grad(exp(f)); Taylor expression is exact for this quadratic.
    """
    a, b, x = _array(matrix, 2), _array(vector, 1), _array(x, 1)
    if a.shape != (len(x), len(x)) or b.shape != x.shape or not np.allclose(a, a.T):
        raise ValueError("A must be symmetric and dimensions must agree")
    f = float(.5 * x @ a @ x + b @ x)
    grad = a @ x + b
    return dict(value=f, gradient=grad, hessian=a.copy(),
                directional_derivative=float(grad @ b), chain_rule_exp=exp(f) * grad)


def taylor_exp(x, order=5):
    if not isfinite(x) or not isinstance(order, int) or order < 0:
        raise ValueError("Finite x and nonnegative integer order required")
    return sum(x ** k / factorial(k) for k in range(order + 1))


def markov_monte_carlo(transition, initial=0, steps=10000, seed=7):
    """Simulate a finite Markov chain; occupancy need not equal stationarity."""
    p = _array(transition, 2)
    if p.shape[0] != p.shape[1] or np.any(p < 0) or not np.allclose(p.sum(axis=1), 1):
        raise ValueError("Requires square row-stochastic transition matrix")
    if not isinstance(steps, int) or steps < 1 or not 0 <= initial < len(p):
        raise ValueError("Invalid initial state or number of steps")
    rng, state, counts = np.random.default_rng(seed), initial, np.zeros(len(p))
    for _ in range(steps):
        state = rng.choice(len(p), p=p[state])
        counts[state] += 1
    return counts / steps


def black_scholes(spot, strike, maturity, rate, volatility):
    """European call/put; constant volatility/rate, no dividends, frictionless."""
    if not all(map(isfinite, (spot, strike, maturity, rate, volatility))) or min(spot, strike, maturity, volatility) <= 0:
        raise ValueError("Positive spot, strike, maturity and volatility required")
    d1 = (log(spot / strike) + (rate + volatility ** 2 / 2) * maturity) / (volatility * sqrt(maturity))
    d2 = d1 - volatility * sqrt(maturity)
    n = lambda x: normal_pdf_cdf(x)[1]
    call = spot * n(d1) - strike * exp(-rate * maturity) * n(d2)
    put = call - spot + strike * exp(-rate * maturity)
    return dict(call=call, put=put)


def kelly_binary(win_probability, net_odds=1., fraction=.25, cap=1.):
    """Long-only fractional Kelly for a binary bet; not continuous-return sizing."""
    p = _prob(win_probability)
    if not all(map(isfinite, (net_odds, fraction, cap))) or net_odds <= 0 or not 0 <= fraction <= 1 or not 0 <= cap <= 1:
        raise ValueError("Positive odds, fraction/cap in [0,1] required")
    return min(cap, max(0., fraction * (p - (1 - p) / net_odds)))


def er_graph(n=300, mean_degree=1., seed=7):
    """ER G(n,p), p=c/(n-1); giant-component threshold c≈1 asymptotically."""
    if not isinstance(n, int) or n < 2 or not isfinite(mean_degree) or not 0 <= mean_degree <= n - 1:
        raise ValueError("n>=2 and mean degree in [0,n-1] required")
    rng = np.random.default_rng(seed)
    upper = np.triu(rng.random((n, n)) < mean_degree / (n - 1), 1)
    adj = upper | upper.T
    unseen, largest = set(range(n)), 0
    while unseen:
        frontier, size = [unseen.pop()], 0
        while frontier:
            u = frontier.pop()
            size += 1
            neighbors = set(np.flatnonzero(adj[u])) & unseen
            unseen.difference_update(neighbors)
            frontier.extend(neighbors)
        largest = max(largest, size)
    return dict(largest_component_fraction=largest / n, edges=int(upper.sum()))


def random_matrix_experiment(dimension=40, observations=200, seed=7):
    """Wishart spectrum and centered alternating moment of independent matrices.

    The latter approaches zero under asymptotic freeness, not exactly at finite n.
    MP support assumes IID zero-mean, unit-variance observations and q<=1.
    """
    if not isinstance(dimension, int) or not isinstance(observations, int) or not 1 <= dimension <= observations:
        raise ValueError("Require integer 1 <= dimension <= observations")
    rng = np.random.default_rng(seed)
    x, y = rng.normal(size=(dimension, observations)), rng.normal(size=(dimension, observations))
    a, b = x @ x.T / observations, y @ y.T / observations
    ac = a - np.trace(a) / dimension * np.eye(dimension)
    bc = b - np.trace(b) / dimension * np.eye(dimension)
    q = dimension / observations
    return dict(eigenvalues=np.linalg.eigvalsh(a), mp_support=((1 - sqrt(q)) ** 2, (1 + sqrt(q)) ** 2),
                centered_alternating_moment=float(np.trace(ac @ bc @ ac @ bc) / dimension))
