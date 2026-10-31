"""Bounded research demonstrations, not production estimators.

ARIMA supports only (p,1,0), Cox uses Breslow ties and an L2-stabilized
full-batch partial likelihood, fractional Brownian sampling is dense O(n^3),
and SLE uses reverse vertical-slit compositions. No TFT, DeepSurv, PPO or
XGBoost implementation is claimed here. All fitting must use training data only.
"""
import itertools
import math
import numpy as np


def _array(x, ndim=None):
    a = np.asarray(x, dtype=float)
    if (ndim is not None and a.ndim != ndim) or not a.size or not np.all(np.isfinite(a)):
        raise ValueError('Expected a nonempty finite array of correct dimension')
    return a


def _integer(x, minimum, name):
    if isinstance(x, bool) or not isinstance(x, (int, np.integer)) or x < minimum:
        raise ValueError(f'{name} must be an integer >= {minimum}')


def arima_p10(series, p=1, steps=1):
    """OLS autoregression of first differences with an intercept; return level forecasts."""
    y = _array(series, 1)
    _integer(p, 1, 'p'); _integer(steps, 1, 'steps')
    if len(y) < 2*p+3: raise ValueError('Insufficient observations')
    d = list(np.diff(y))
    X = np.array([[1]+[d[t-j] for j in range(1,p+1)] for t in range(p,len(d))])
    coef = np.linalg.lstsq(X, np.array(d[p:]), rcond=None)[0]
    level = y[-1]; forecasts = []
    for _ in range(steps):
        increment = float(np.dot(coef,[1]+[d[-j] for j in range(1,p+1)]))
        d.append(increment); level += increment; forecasts.append(level)
    return np.array(forecasts)


class CoxPH:
    """Cox proportional hazards with right censoring; no left truncation or strata.

    Predictors are standardized internally. Coefficients are in original units.
    Breslow baseline hazard shares the same fitted linear predictor as survival.
    """
    def __init__(self, learning_rate=.05, iterations=800, penalty=.001):
        if not np.isfinite([learning_rate,penalty]).all() or learning_rate<=0 or penalty<0:
            raise ValueError('Invalid optimizer parameters')
        _integer(iterations,1,'iterations')
        self.learning_rate=learning_rate; self.iterations=iterations; self.penalty=penalty

    def fit(self, X, durations, events):
        X=_array(X,2); t=_array(durations,1); e=_array(events,1)
        if len(X)!=len(t) or len(t)!=len(e) or np.any(t<=0) or not np.isin(e,[0,1]).all() or not e.any():
            raise ValueError('Durations must be positive and events binary with at least one event')
        self.mean_=X.mean(0); scale=X.std(0); scale[scale==0]=1
        Z=(X-self.mean_)/scale; beta=np.zeros(X.shape[1]); times=np.unique(t[e==1])
        for _ in range(self.iterations):
            eta=Z@beta; grad=np.zeros_like(beta)
            for time in times:
                deaths=(t==time)&(e==1); risk=t>=time
                weights=np.exp(eta[risk]-np.max(eta[risk])); weights/=weights.sum()
                grad += Z[deaths].sum(0)-deaths.sum()*(weights@Z[risk])
            beta += self.learning_rate*(grad/e.sum()-self.penalty*beta)
        self.coef_=beta/scale; self.times_=times
        eta=(X-self.mean_)@self.coef_
        # Reject numerical divergence rather than silently clamp hazards.
        if not np.isfinite(eta).all() or np.max(np.abs(eta))>500: raise ValueError('Cox optimization diverged')
        self.baseline_=np.cumsum([np.sum((t==u)&(e==1))/np.exp(eta[t>=u]).sum() for u in times])
        return self

    def survival(self, X, times):
        if not hasattr(self,'coef_'): raise ValueError('Fit the model first')
        X=_array(X,2); times=_array(times,1)
        if X.shape[1]!=len(self.coef_) or np.any(times<0): raise ValueError('Invalid prediction shape or times')
        indices=np.searchsorted(self.times_,times,side='right')
        hazard=np.r_[0,self.baseline_][indices]
        eta=(X-self.mean_)@self.coef_
        if np.max(np.abs(eta))>500: raise ValueError('Prediction exceeds numerical range')
        return np.exp(-np.exp(eta[:,None])*hazard)


class BayesianNetwork:
    """Finite discrete DAG, nodes in topological order.

    Mapping values: (parent names, CPT). Parent axes follow supplied order;
    final axis is node state. Exact enumeration is exponential in node count.
    """
    def __init__(self,nodes):
        if not isinstance(nodes,dict) or not nodes: raise ValueError('Provide node mapping')
        self.nodes={}; self.sizes={}
        for name,(parents,table) in nodes.items():
            parents=list(parents); table=_array(table)
            if len(set(parents))!=len(parents) or any(p not in self.nodes for p in parents): raise ValueError('Parents must precede child')
            if table.ndim!=len(parents)+1 or table.shape[:-1]!=tuple(self.sizes[p] for p in parents): raise ValueError('CPT shape mismatch')
            if np.any(table<0) or not np.allclose(table.sum(-1),1,rtol=0,atol=1e-10): raise ValueError('CPT probabilities must sum to one')
            self.nodes[name]=(parents,table.copy()); self.sizes[name]=table.shape[-1]
    def query(self,node,evidence=None):
        evidence={} if evidence is None else dict(evidence)
        if node not in self.nodes: raise ValueError('Unknown node')
        for k,v in evidence.items():
            if k not in self.nodes or not isinstance(v,(int,np.integer)) or not 0<=v<self.sizes[k]: raise ValueError('Invalid evidence')
        result=np.zeros(self.sizes[node]); names=list(self.nodes)
        for states in itertools.product(*(range(self.sizes[n]) for n in names)):
            a=dict(zip(names,states))
            if any(a[k]!=v for k,v in evidence.items()): continue
            probability=1.
            for n,(parents,cpt) in self.nodes.items(): probability*=cpt[tuple(a[p] for p in parents)+(a[n],)]
            result[a[node]]+=probability
        if result.sum()==0: raise ValueError('Evidence has zero probability')
        return result/result.sum()


def _path_c(n):
    if n<=1:return 0.
    if n==2:return 1.
    return 2*(math.log(n-1)+np.euler_gamma)-2*(n-1)/n


class IsolationForest:
    """Random axis partition forest with standard path-length anomaly scores."""
    def __init__(self,trees=100,sample_size=256,seed=0):
        _integer(trees,1,'trees'); _integer(sample_size,2,'sample_size')
        self.trees=trees; self.sample_size=sample_size; self.seed=seed
    def fit(self,X):
        X=_array(X,2)
        if len(X)<2: raise ValueError('Need at least two rows')
        rng=np.random.default_rng(self.seed); self.n_=min(len(X),self.sample_size); self.features_=X.shape[1]
        def build(x,depth):
            choices=np.flatnonzero(np.ptp(x,axis=0)>0)
            if len(x)<=1 or depth>=math.ceil(math.log2(self.n_)) or not len(choices): return len(x)
            j=int(rng.choice(choices)); split=rng.uniform(x[:,j].min(),x[:,j].max()); left=x[:,j]<split
            return (j,split,build(x[left],depth+1),build(x[~left],depth+1))
        self.forest_=[build(X[rng.choice(len(X),self.n_,replace=False)],0) for _ in range(self.trees)]
        return self
    def score_samples(self,X):
        if not hasattr(self,'forest_'): raise ValueError('Fit first')
        X=_array(X,2)
        if X.shape[1]!=self.features_: raise ValueError('Feature mismatch')
        def path(x,node):
            if isinstance(node,int): return _path_c(node)
            j,s,l,r=node; return 1+path(x,l if x[j]<s else r)
        return np.array([2**(-np.mean([path(x,t) for t in self.forest_])/_path_c(self.n_)) for x in X])


def fractional_brownian(n=100,hurst=.1,horizon=1.,seed=0):
    """Exact Gaussian covariance sampling at n+1 grid points (up to roundoff).

    This is a fractional Brownian driver demonstration, not a fitted rough
    volatility or rough Bergomi model; H<1/2 corresponds to rough paths.
    """
    _integer(n,1,'n')
    if n>2000 or not np.isfinite([hurst,horizon]).all() or not 0<hurst<1 or horizon<=0: raise ValueError('Require n<=2000, 0<H<1, horizon>0')
    t=np.linspace(0,horizon,n+1); u=t[1:]
    cov=.5*(u[:,None]**(2*hurst)+u[None,:]**(2*hurst)-np.abs(u[:,None]-u[None,:])**(2*hurst))
    L=np.linalg.cholesky(cov)
    return t,np.r_[0,L@np.random.default_rng(seed).normal(size=n)]


def sle_trace(kappa=2.,n=100,dt=.001,seed=0):
    """SLE driving Brownian motion with reverse vertical-slit map approximation.

    Returns upper-half-plane trace tips; O(n^2) educational discretization.
    Each slit map solves constant-driving Loewner exactly over one step;
    discretized Brownian driving is not a convergence guarantee at finite dt.
    """
    _integer(n,1,'n')
    if n>5000 or not np.isfinite([kappa,dt]).all() or kappa<0 or dt<=0: raise ValueError('Invalid SLE parameters')
    driving=np.r_[0,np.cumsum(np.random.default_rng(seed).normal(size=n-1)*math.sqrt(kappa*dt))]
    tips=[]
    for j in range(n):
        z=complex(driving[j],0)
        for u in driving[:j+1][::-1]:
            root=np.sqrt((z-u)**2-4*dt+0j)
            if root.imag<0: root=-root
            z=u+root
            if not np.isfinite(z): raise ValueError('Loewner map became singular')
        tips.append(z)
    return np.array(tips)
