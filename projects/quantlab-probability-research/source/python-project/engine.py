"""Bounded chronological forecast experiments with truthful optional backends.

No market data is fetched here. Predictions target next observed-close log
returns. All tuning and calibration precede each scored test block.
"""
import importlib
import math
from datetime import date
import numpy as np
import pipeline as base


def _probability(estimator, x):
    p=np.asarray(estimator.predict_proba(x),float)
    result=np.zeros((len(x),3))
    result[:,np.asarray(estimator.classes_,int)]=p
    total=result.sum(axis=1,keepdims=True)
    if not np.isfinite(result).all() or np.any(result<0) or not np.allclose(total,1,rtol=0,atol=1e-5):
        raise ValueError('Backend returned invalid class probabilities')
    # XGBoost returns float32: remove harmless row-sum roundoff before scoring.
    return result/total


def _temperature(q,t):
    return base.softmax(np.log(np.clip(q,1e-12,1))/t)


def run_experiment(close, dates=None, backends=('sklearn','xgboost','lightgbm'), tune=False, explain=False, seed=42):
    """Run expanding train/calibration/test folds and forecast latest close.

    Optional fits use one CPU thread. Maximum history is 4,000 observations;
    calibration temperature and model selection reuse calibration observations,
    while test blocks are untouched. No refitting on calibration data occurs.
    """
    close=base.validate_prices(close)
    if len(close)>4000: raise ValueError('Maximum supported history is 4000 rows; select a recent window explicitly')
    if isinstance(backends,str): raise ValueError('backends must be a sequence of names')
    backends=tuple(dict.fromkeys(backends))
    if any(b not in ('sklearn','xgboost','lightgbm','torch') for b in backends): raise ValueError('Unknown backend')
    if dates is not None:
        if len(dates)!=len(close): raise ValueError('dates and close length mismatch')
        dates=[date.fromisoformat(str(d)).isoformat() for d in dates]
        if any(a>=b for a,b in zip(dates,dates[1:])): raise ValueError('Dates must increase strictly')
    x,y,ix=base.features(close)
    first=652
    if len(x)<=first: raise ValueError('Need at least 714 close observations')
    status={'empirical':{'status':'available'},'ridge':{'status':'available'}}
    modules={}
    for name in backends:
        try:
            modules[name]=importlib.import_module(name)
            status[name]={'status':'available','version':str(getattr(modules[name],'__version__','unknown'))}
        except Exception as exc: status[name]={'status':'unavailable','reason':f'{type(exc).__name__}: {exc}'}
    trials=[]; tuned={}; shap_result={'status':'not_requested'}

    def construct(name,params=None):
        params=params or {}
        if name=='sklearn':
            from sklearn.linear_model import LogisticRegression
            from sklearn.pipeline import make_pipeline
            from sklearn.preprocessing import StandardScaler
            return make_pipeline(StandardScaler(),LogisticRegression(C=1.,max_iter=250,random_state=seed))
        if name=='xgboost':
            return modules[name].XGBClassifier(n_estimators=60,max_depth=3,learning_rate=.05,n_jobs=1,
                random_state=seed,objective='multi:softprob',num_class=3,eval_metric='mlogloss',verbosity=0,**params)
        if name=='lightgbm':
            return modules[name].LGBMClassifier(n_estimators=60,max_depth=3,num_leaves=7,learning_rate=.05,
                n_jobs=1,random_state=seed,verbosity=-1)
        raise ValueError(name)

    if tune:
        if 'xgboost' not in modules:
            trials.append({'status':'skipped','reason':'XGBoost unavailable or not selected'})
        else:
            try:
                import optuna
                optuna.logging.set_verbosity(optuna.logging.WARNING)
                cut=350; end=500; labels=base.classes(y[:cut])
                if len(np.unique(labels))<3: raise ValueError('First training split lacks all three classes')
                def objective(trial):
                    params={'reg_lambda':trial.suggest_float('reg_lambda',.1,10.,log=True),
                            'subsample':trial.suggest_float('subsample',.7,1.)}
                    est=construct('xgboost',params); est.fit(x[:cut],labels)
                    return base.metrics(y[cut+1:end],_probability(est,x[cut+1:end]))['log_loss']
                study=optuna.create_study(direction='minimize',sampler=optuna.samplers.TPESampler(seed=seed))
                study.optimize(objective,n_trials=3)
                tuned=dict(study.best_params)
                trials=[{'trial':t.number,'params':t.params,'training_validation_log_loss':float(t.value),
                    'fit_rows':[0,cut-1],'validation_rows':[cut+1,end-1]} for t in study.trials]
            except Exception as exc: trials.append({'status':'skipped_or_failed','reason':f'{type(exc).__name__}: {exc}'})

    def torch_fit(tx,ty):
        torch=modules['torch']; torch.set_num_threads(1); torch.manual_seed(seed)
        mean=tx.mean(0); scale=tx.std(0); scale=np.where(scale<1e-10,1,scale)
        net=torch.nn.Sequential(torch.nn.Linear(tx.shape[1],16),torch.nn.ReLU(),torch.nn.Linear(16,3))
        optim=torch.optim.Adam(net.parameters(),lr=.02)
        tensor=torch.tensor((tx-mean)/scale,dtype=torch.float32); target=torch.tensor(ty,dtype=torch.long)
        for _ in range(70):
            optim.zero_grad(); loss=torch.nn.functional.cross_entropy(net(tensor),target); loss.backward(); optim.step()
        class TorchEstimator:
            classes_=np.arange(3)
            def predict_proba(self,z):
                with torch.no_grad():return torch.softmax(net(torch.tensor((z-mean)/scale,dtype=torch.float32)),dim=1).numpy()
        return TorchEstimator()

    def train(train_stop,cal_start,cal_stop):
        # Baseline fit shares the audited implementation. Retain empirical and ridge.
        baseline=base.fit_models(x[:train_stop],y[:train_stop]); models={n:('base',baseline[n]) for n in ('empirical','ridge')}
        labels=base.classes(y[:train_stop])
        for name in modules:
            if len(np.unique(labels))<2 or (name=='xgboost' and len(np.unique(labels))<3):
                status[name]['last_fit_status']='skipped_missing_classes'; continue
            try:
                est=torch_fit(x[:train_stop],labels) if name=='torch' else construct(name,tuned if name=='xgboost' else None)
                if name=='sklearn':
                    from threadpoolctl import threadpool_limits
                    with threadpool_limits(limits=1): est.fit(x[:train_stop],labels)
                elif name!='torch':est.fit(x[:train_stop],labels)
                models[name]=('external',est); status[name]['last_fit_status']='fitted'; status[name].pop('reason',None)
            except Exception as exc:status[name]['last_fit_status']='failed'; status[name]['reason']=f'{type(exc).__name__}: {exc}'
        temperatures={}; scores={}
        for name,(kind,est) in models.items():
            q=base.predict(est,x[cal_start:cal_stop])[0] if kind=='base' else _probability(est,x[cal_start:cal_stop])
            temperatures[name]=min((.5,.75,1.,1.5,2.,3.),key=lambda t:base.metrics(y[cal_start:cal_stop],_temperature(q,t))['log_loss'])
            scores[name]=base.metrics(y[cal_start:cal_stop],_temperature(q,temperatures[name]))['log_loss']
        return models,temperatures,scores

    def probabilities(models,temperatures,rows):
        return {name:_temperature(base.predict(est,rows)[0] if kind=='base' else _probability(est,rows),temperatures[name])
                for name,(kind,est) in models.items()}

    predictions=[]; folds=[]; candidate_q={}; candidate_y={}; selected_q=[]; selected_y=[]
    for start in range(first,len(y),200):
        stop=min(start+200,len(y)); cal_stop=start-1; cal_start=cal_stop-150; train_stop=cal_start-1
        models,temperatures,scores=train(train_stop,cal_start,cal_stop); chosen=min(scores,key=scores.get)
        qs=probabilities(models,temperatures,x[start:stop]); selected_q.extend(qs[chosen]); selected_y.extend(y[start:stop])
        for name,q in qs.items():candidate_q.setdefault(name,[]).extend(q); candidate_y.setdefault(name,[]).extend(y[start:stop])
        folds.append({'train_feature_start':int(ix[0]),'train_feature_end':int(ix[train_stop-1]),
            'train_label_end':int(ix[train_stop-1]+1),'calibration_feature_start':int(ix[cal_start]),
            'calibration_label_end':int(ix[cal_stop-1]+1),'test_feature_start':int(ix[start]),'test_feature_end':int(ix[stop-1]),
            'selected':chosen,'calibration_log_loss':scores,'temperatures':temperatures})
        for j,row in enumerate(range(start,stop)):
            item={'feature_index':int(ix[row]),'target_index':int(ix[row]+1),'model':chosen,
                'probabilities':qs[chosen][j].tolist(),'actual_log_return':float(y[row])}
            if dates:item.update(feature_date=dates[ix[row]],target_date=dates[ix[row]+1])
            predictions.append(item)
    # Appending one dummy close yields latest causal feature row. Dummy label is never fitted.
    latest_x=base.features(np.r_[close,close[-1]])[0][-1:]
    cal_stop=len(y)-1; cal_start=cal_stop-150; train_stop=cal_start-1
    models,temperatures,scores=train(train_stop,cal_start,cal_stop)
    chosen=min(scores,key=scores.get); latest_q=probabilities(models,temperatures,latest_x)
    latest={'feature_index':len(close)-1,'target_index':len(close),'model':chosen,
        'probabilities':latest_q[chosen][0].tolist(),'candidate_probabilities':{n:q[0].tolist() for n,q in latest_q.items()},
        'target_date':None,'target':'next observed close; future date not assumed',
        'calibration_log_loss':scores,'temperatures':temperatures,
        'train_label_end':int(ix[train_stop-1]+1),'calibration_feature_start':int(ix[cal_start]),
        'calibration_label_end':int(ix[cal_stop-1]+1)}
    if dates: latest['feature_date']=dates[-1]
    if explain:
        name=next((n for n in ('xgboost','lightgbm') if n in models),None)
        if name is None:shap_result={'status':'skipped','reason':'No fitted tree backend'}
        else:
            try:
                import shap
                values=shap.TreeExplainer(models[name][1])(latest_x)
                shap_result={'status':'computed','model':name,'space':'raw class margins; not probabilities or causal effects',
                    'feature_names':base.FEATURE_NAMES,'values':np.asarray(values.values).tolist(),
                    'base_values':np.asarray(values.base_values).tolist(),'shape':list(np.asarray(values.values).shape),
                    'calibration_note':'SHAP explains the uncalibrated tree; displayed probabilities apply temperature separately.'}
            except Exception as exc:shap_result={'status':'error','model':name,'reason':f'{type(exc).__name__}: {exc}'}
    return {'schema_version':1,'target':'next observed-close log return','threshold':base.THRESHOLD,
        'classes':['r < -0.02','-0.02 <= r <= 0','r > 0'],'feature_names':base.FEATURE_NAMES,
        'test_observations':len(selected_y),'folds':folds,'predictions':predictions,
        'candidate_metrics':{n:dict(base.metrics(np.array(candidate_y[n]),np.array(q)),observations=len(q)) for n,q in candidate_q.items()},
        'selected_metrics':base.metrics(np.array(selected_y),np.array(selected_q)),
        'latest_forecast':latest,'model_status':status,'tuning_trials':trials,'shap_explanation':shap_result,
        'limitations':['Backtest probabilities are research estimates, not validated economic edge.',
            'Calendar gaps change forecast horizon; target is the next observed close.',
            'Candidate metrics may cover different rows when a backend fails or lacks classes; inspect observations.',
            'Calibration selects temperature and model on the same block; outer test remains untouched.',
            'Latest classifier predicts categories; it does not estimate a full return distribution.',
            'No costs, execution, position sizing, TFT, DeepSurv, or PPO model is represented.']}
