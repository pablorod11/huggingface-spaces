"""Causal daily close-to-close probability research. NumPy + Python standard library.

Three exclusive classes: r < -0.02; -0.02 <= r <= 0; r > 0.
No executable trading/backtest claim: close fills are not modeled.
"""
from pathlib import Path
import argparse
import csv
from datetime import date, timedelta
import json
import math
import numpy as np

FEATURE_NAMES = ['return_1','momentum_5','momentum_20','volatility_5','volatility_20','drawdown_60']
THRESHOLD = -.02

def normal_cdf(x):
    return np.vectorize(lambda z: .5*math.erfc(-float(z)/math.sqrt(2)),otypes=[float])(x)

def synthetic(n=2500,seed=42):
    if n<100: raise ValueError('At least 100 prices required')
    rng=np.random.default_rng(seed); r=np.zeros(n); state=0
    for t in range(1,n):
        if rng.random() < (.025 if state==0 else .10): state=1-state
        sigma=.008 if state==0 else .025
        jump=-rng.exponential(.025) if rng.random()<.008 else 0
        r[t]=.0003+.08*r[t-1]+sigma*rng.standard_t(6)/math.sqrt(1.5)+jump
    return 100*np.exp(np.cumsum(r))

def validate_prices(close):
    a=np.asarray(close,dtype=float)
    if a.ndim!=1 or len(a)<62 or not np.all(np.isfinite(a)) or np.any(a<=0):
        raise ValueError('Need >=62 finite positive closes in a one-dimensional series')
    return a

def features(close):
    a=validate_prices(close); r=np.diff(np.log(a)); rows=[]
    # At close t only data through t are used. Last row needs its next-close label.
    ix=np.arange(60,len(a)-1)
    for t in ix:
        rows.append([r[t-1],r[t-5:t].sum(),r[t-20:t].sum(),
                     r[t-5:t].std(ddof=1),r[t-20:t].std(ddof=1),
                     a[t]/np.max(a[t-59:t+1])-1])
    return np.asarray(rows),r[ix],ix

def classes(y):
    return np.where(y<THRESHOLD,0,np.where(y>0,2,1))

def softmax(z):
    e=np.exp(z-z.max(axis=1,keepdims=True)); return e/e.sum(axis=1,keepdims=True)

def linear_fit(x,y,l2=0.,l1=0.):
    """Minimize MSE/2 + l2*||b||²/2 + l1*||b||1; intercept unpenalized."""
    x=np.asarray(x,float); y=np.asarray(y,float)
    if x.ndim!=2 or y.shape!=(len(x),) or len(x)==0 or not np.isfinite(x).all() or not np.isfinite(y).all() or not np.isfinite([l1,l2]).all() or min(l1,l2)<0:
        raise ValueError('Invalid regression input or penalty')
    xm=x.mean(0); ym=y.mean(); z=x-xm; target=y-ym
    if l1==0:
        if l2==0: b=np.linalg.lstsq(z,target,rcond=None)[0]
        else: b=np.linalg.solve(z.T@z/len(x)+l2*np.eye(x.shape[1]),z.T@target/len(x))
    else:
        b=np.zeros(x.shape[1]); denom=(z*z).mean(0)+l2
        for _ in range(1000):
            old=b.copy()
            for j in range(x.shape[1]):
                rho=np.mean(z[:,j]*(target-z@b+z[:,j]*b[j]))
                b[j]=np.sign(rho)*max(abs(rho)-l1,0)/denom[j] if denom[j]>0 else 0
            if np.max(np.abs(b-old))<1e-10: break
    return np.r_[ym-xm@b,b]

def fit_models(x,y):
    m=x.mean(0); s=x.std(0); s=np.where(s<1e-10,1,s); z=(x-m)/s
    z1=np.c_[np.ones(len(x)),z]; out={}
    counts=np.bincount(classes(y),minlength=3)+1
    out['empirical']={'kind':'empirical','q':counts/counts.sum(),'mu':float(y.mean()),'sigma':float(max(y.std(ddof=1),1e-6))}
    for name,l2,l1 in [('ols',0,0),('ridge',1,0),('lasso',0,.0003),('elastic_net',.1,.00015)]:
        beta=linear_fit(z,y,l2,l1); residual=y-z1@beta
        out[name]={'kind':'normal','m':m,'s':s,'beta':beta,'sigma':float(max(residual.std(ddof=1),1e-6))}
    b=np.zeros((z1.shape[1],3)); target=np.eye(3)[classes(y)]
    # Fixed conservative step bounded by multinomial curvature, L2 only on slopes.
    step=1/(.5*np.linalg.norm(z1,2)**2/len(x)+.03)
    for _ in range(600):
        grad=z1.T@(softmax(z1@b)-target)/len(x); grad[1:]+=.03*b[1:]
        b-=step*grad
    out['softmax']={'kind':'softmax','m':m,'s':s,'beta':b,'temperature':1.,
                    'mu':float(y.mean()),'sigma':float(max(y.std(ddof=1),1e-6))}
    return out

def predict(model,x):
    n=len(x); kind=model['kind']
    if kind=='empirical':
        return np.tile(model['q'],(n,1)),np.full(n,model['mu']),np.full(n,model['sigma'])
    z=np.c_[np.ones(n),(x-model['m'])/model['s']]
    if kind=='softmax':
        return softmax(z@model['beta']/model['temperature']),np.full(n,model['mu']),np.full(n,model['sigma'])
    mu=z@model['beta']; sig=np.full(n,model['sigma'])
    lo=normal_cdf((THRESHOLD-mu)/sig); mid=normal_cdf(-mu/sig)
    return np.c_[lo,mid-lo,1-mid],mu,sig

def metrics(y,q):
    y=np.asarray(y,float); q=np.asarray(q,float)
    if y.ndim!=1 or len(y)==0 or not np.isfinite(y).all() or q.shape!=(len(y),3) or not np.isfinite(q).all() or np.any(q<0) or np.any(q>1) or not np.allclose(q.sum(1),1,atol=1e-10,rtol=0):
        raise ValueError('Need finite targets and normalized nonnegative three-class probabilities')
    c=classes(y); q=np.maximum(q,1e-12); q=q/q.sum(1,keepdims=True)
    bins=[]
    for j,name in [(0,'downside'),(2,'up')]:
        for low in np.arange(0,1,.1):
            mask=(q[:,j]>=low)&((q[:,j]<low+.1) if low<.9 else (q[:,j]<=1))
            if mask.any(): bins.append({'event':name,'low':float(low),'n':int(mask.sum()),
                                        'predicted':float(q[mask,j].mean()),'observed':float((c[mask]==j).mean())})
    return {'log_loss':float(-np.log(q[np.arange(len(c)),c]).mean()),
            'brier_multiclass':float(np.mean(np.sum((q-np.eye(3)[c])**2,axis=1))),
            'downside_brier':float(np.mean((q[:,0]-(c==0))**2)),
            'up_brier':float(np.mean((q[:,2]-(c==2))**2)),
            'accuracy':float(np.mean(q.argmax(1)==c)),'reliability':bins}

def block_bootstrap_loss_difference(y,a,b,seed=42,reps=400,block=20):
    """Paired moving-block percentile interval for mean log-loss(a)-log-loss(b).

    Descriptive only: stationarity and block choice matter; not a proof of alpha.
    """
    c=classes(y); ix=np.arange(len(c)); d=-np.log(np.maximum(a[ix,c],1e-12))+np.log(np.maximum(b[ix,c],1e-12))
    rng=np.random.default_rng(seed); n=len(d); block=min(block,n); means=[]
    for _ in range(reps):
        starts=rng.integers(0,n-block+1,size=math.ceil(n/block))
        sample=np.concatenate([d[i:i+block] for i in starts])[:n]; means.append(sample.mean())
    return {'mean_difference':float(d.mean()),'percentile_interval_95':np.quantile(means,[.025,.975]).tolist(),
            'block_length':block,'replicates':reps,'interpretation':'negative favors selected model; descriptive, no multiple-testing adjustment'}

def select_models(x_train,y_train,x_cal,y_cal):
    models=fit_models(x_train,y_train); scores={}
    for name,model in models.items():
        if name=='softmax':
            choices=[.5,.75,1.,1.5,2.,3.]; losses=[]
            for temperature in choices:
                model['temperature']=temperature
                losses.append(metrics(y_cal,predict(model,x_cal)[0])['log_loss'])
            model['temperature']=choices[int(np.argmin(losses))]
        scores[name]=metrics(y_cal,predict(model,x_cal)[0])['log_loss']
    return models,scores,min(scores,key=scores.get)


def latest_forecast(close,min_train=600,calibration=200):
    """Next unobserved close forecast. The appended price creates features only.

    Its dummy target is excluded from every fit and calibration operation.
    """
    a=validate_prices(close)
    if min_train<100 or calibration<30: raise ValueError('Need train>=100, calibration>=30')
    x,y,ix=features(np.r_[a,a[-1]])
    cal_stop=len(y)-1; cal_start=cal_stop-calibration; train_stop=cal_start-1
    if train_stop<min_train: raise ValueError('Insufficient history for latest forecast')
    models,scores,name=select_models(x[:train_stop],y[:train_stop],x[cal_start:cal_stop],y[cal_start:cal_stop])
    q,mu,sigma=predict(models[name],x[-1:])
    _,train_mu,_=predict(models[name],x[:train_stop])
    offsets=np.quantile(y[:train_stop]-train_mu,[.05,.5,.95])
    return {'feature_index':int(ix[-1]),'target_index':int(ix[-1]+1),'model':name,
            'probabilities':q[0].tolist(),'return_quantiles_05_50_95':(mu[0]+offsets).tolist(),
            'calibration_log_loss':scores,'train_label_end':int(ix[train_stop-1]+1),
            'calibration_label_end':int(ix[cal_stop-1]+1),
            'target_status':'UNOBSERVED; no realized outcome used'}


def evaluate(close,min_train=600,calibration=200,block=100):
    if min_train<100 or calibration<30 or block<1: raise ValueError('Need train>=100, calibration>=30, block>=1')
    x,y,ix=features(close); first=min_train+calibration+2
    if first>=len(y): raise ValueError('Insufficient history for train/calibration/embargo/test')
    predictions=[]; folds=[]; allq={}; all_y=[]; selected=[]; baseline=[]
    for start in range(first,len(y),block):
        stop=min(start+block,len(y)); cal_stop=start-1; cal_start=cal_stop-calibration; train_stop=cal_start-1
        models,scores,chosen=select_models(x[:train_stop],y[:train_stop],x[cal_start:cal_stop],y[cal_start:cal_stop])
        qs={name:predict(model,x[start:stop])[0] for name,model in models.items()}
        for name,q in qs.items(): allq.setdefault(name,[]).extend(q.tolist())
        selected.extend(qs[chosen].tolist()); baseline.extend(qs['empirical'].tolist()); all_y.extend(y[start:stop].tolist())
        # Empirical residual quantiles for return models; classifier uses unconditional training returns.
        model=models[chosen]; _,train_mu,_=predict(model,x[:train_stop]); residual=y[:train_stop]-train_mu
        offsets=np.quantile(residual,[.05,.5,.95]); _,test_mu,_=predict(model,x[start:stop])
        fold={'train_feature_start':int(ix[0]),'train_feature_end':int(ix[train_stop-1]),
              'train_label_end':int(ix[train_stop-1]+1),'calibration_feature_start':int(ix[cal_start]),
              'calibration_label_end':int(ix[cal_stop-1]+1),'test_feature_start':int(ix[start]),
              'test_feature_end':int(ix[stop-1]),'selected':chosen,'calibration_log_loss':scores,
              'softmax_temperature':models['softmax']['temperature']}
        folds.append(fold)
        for k,row in enumerate(range(start,stop)):
            predictions.append({'feature_index':int(ix[row]),'target_index':int(ix[row]+1),'model':chosen,
                                'probabilities':qs[chosen][k].tolist(),'actual_log_return':float(y[row]),
                                'return_quantiles_05_50_95':(test_mu[k]+offsets).tolist()})
    ay=np.array(all_y); aq=np.array(selected); bounds=np.array([r['return_quantiles_05_50_95'] for r in predictions])
    return {'schema_version':1,'target':'next-observed-close log return','threshold':THRESHOLD,
            'classes':['r < -0.02','-0.02 <= r <= 0','r > 0'],'feature_names':FEATURE_NAMES,
            'test_observations':len(ay),'folds':folds,'selected_metrics':metrics(ay,aq),
            'candidate_metrics':{name:metrics(ay,np.array(q)) for name,q in allq.items()},
            'selected_vs_empirical_bootstrap':block_bootstrap_loss_difference(ay,aq,np.array(baseline)),
            'empirical_90pct_interval_coverage':float(np.mean((ay>=bounds[:,0])&(ay<=bounds[:,2]))),
            'observed_downside_frequency':float(np.mean(ay<THRESHOLD)),
            'observed_up_frequency':float(np.mean(ay>0)), 'predictions':predictions,
            'limitations':['Synthetic results establish software behavior only.',
            'Close-to-close targets do not imply executable same-close fills.',
            'Normal residual probabilities assume conditional Gaussian errors; tails may be miscalibrated.',
            'Softmax return quantiles are unconditional; class probabilities are conditional.',
            'Residual intervals omit parameter uncertainty and can undercover under regime shifts.',
            'Calibration scores are reused for temperature and model selection; outer tests stay untouched.',
            'No transaction-cost backtest or statistically established economic edge.']}

def load_csv(path):
    with open(path,newline='') as f:
        reader=csv.DictReader(f)
        if not {'date','close'}.issubset(reader.fieldnames or []): raise ValueError('CSV requires date,close headers')
        rows=list(reader)
    dates=[date.fromisoformat(r['date']) for r in rows]
    if any(a>=b for a,b in zip(dates,dates[1:])): raise ValueError('Dates must be unique and strictly increasing')
    prices=validate_prices([float(r['close']) for r in rows])
    return [d.isoformat() for d in dates],prices

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv',type=Path); parser.add_argument('--out',type=Path,default=Path('results'))
    parser.add_argument('--seed',type=int,default=42); parser.add_argument('--n',type=int,default=2500)
    args=parser.parse_args()
    if args.csv:
        dates,close=load_csv(args.csv); source={'kind':'user_csv','path':str(args.csv),'adjustment_status':'unverified; supply split/dividend-adjusted closes','horizon':'next observed row; daily cadence not guaranteed','largest_calendar_gap_days':max((date.fromisoformat(b)-date.fromisoformat(a)).days for a,b in zip(dates,dates[1:]))}
    else:
        close=synthetic(args.n,args.seed); dates=[]; current=date(2000,1,3)
        while len(dates)<len(close):
            if current.weekday()<5: dates.append(current.isoformat())
            current+=timedelta(days=1)
        source={'kind':'SYNTHETIC','seed':args.seed,'n':args.n,'calendar':'weekday placeholders, not exchange calendar'}
    report=evaluate(close); report['source']=source
    report['latest_forecast']=latest_forecast(close)
    report['latest_forecast']['feature_date']=dates[-1]
    for row in report['predictions']:
        row['feature_date']=dates[row['feature_index']]; row['target_date']=dates[row['target_index']]
    args.out.mkdir(parents=True,exist_ok=True)
    (args.out/'report.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    with open(args.out/'predictions.csv','w',newline='') as f:
        writer=csv.writer(f); writer.writerow(['feature_date','target_date','model','p_log_return_below_minus_0_02','p_middle','p_up','actual_log_return','q05','q50','q95'])
        for r in report['predictions']:
            writer.writerow([r['feature_date'],r['target_date'],r['model'],*r['probabilities'],r['actual_log_return'],*r['return_quantiles_05_50_95']])
    if not args.csv:
        with open(args.out/'synthetic_prices.csv','w',newline='') as f:
            w=csv.writer(f); w.writerow(['date','close']); w.writerows(zip(dates,close))
    print(json.dumps({'source':source,'test_observations':report['test_observations'],
                      'log_loss':report['selected_metrics']['log_loss'],'baseline_log_loss':report['candidate_metrics']['empirical']['log_loss'],
                      'report':str(args.out/'report.json')},indent=2))

if __name__=='__main__': main()
