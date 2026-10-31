"""Per-request research orchestration and export; never sends data to remote tracking."""
from pathlib import Path
import html
import json
import os
import shutil
import tempfile
import time
import zipfile
import numpy as np
import pandas as pd
import plotly.graph_objects as go

INK='#141414'; BLUE='#1d5fbf'; GRAY='#858b93'
RUN_ROOT=Path(tempfile.gettempdir())/'quantlab-space-runs'


def style(figure,title,ytitle=None):
    figure.update_layout(title={'text':title,'font':{'size':15}},template='plotly_white',
                         height=310,margin=dict(l=48,r=20,t=42,b=75),
                         font=dict(family='Arial, sans-serif',size=12,color=INK),
                         paper_bgcolor='white',plot_bgcolor='white',
                         legend=dict(orientation='h',y=-.45),yaxis_title=ytitle,
                         hovermode='closest')
    figure.update_xaxes(showgrid=False,zeroline=False)
    figure.update_yaxes(gridcolor='#eeeeee',zeroline=False)
    return figure


def make_figures(report,dates,close):
    q=report['latest_forecast']['probabilities']
    probability=go.Figure(go.Bar(x=['Below −0.02 log','−0.02 to zero','Above zero'],y=q,
                                marker_color=[GRAY,INK,BLUE],text=[f'{v:.1%}' for v in q],textposition='auto'))
    style(probability,'Next observed close · event probabilities','Probability')
    probability.update_yaxes(range=[0,1],tickformat='.0%')
    rows=report['predictions']; x=[dates[r['target_index']] for r in rows]
    trajectory=go.Figure(go.Scatter(x=x,y=[r['probabilities'][0] for r in rows],mode='lines',line=dict(color=BLUE,width=1.5),name='Predicted downside'))
    observed=pd.Series([r['actual_log_return']<-.02 for r in rows],dtype=float).rolling(100,min_periods=30).mean()
    trajectory.add_trace(go.Scatter(x=x,y=observed,mode='lines',line=dict(color=GRAY,width=1.5),name='Trailing 100 test outcomes'))
    style(trajectory,'Downside probability through unseen test blocks','Probability')
    trajectory.update_yaxes(tickformat='.0%',rangemode='tozero')
    calibration=go.Figure(go.Scatter(x=[0,1],y=[0,1],mode='lines',line=dict(color='#bbbbbb',dash='dot'),showlegend=False))
    for event,color in [('downside',BLUE),('up',INK)]:
        bins=[r for r in report['selected_metrics']['reliability'] if r['event']==event]
        if bins:
            calibration.add_trace(go.Scatter(x=[r['predicted'] for r in bins],y=[r['observed'] for r in bins],
                mode='markers+lines',name=event,marker=dict(color=color,size=[min(18,5+np.sqrt(r['n'])) for r in bins]),
                customdata=[r['n'] for r in bins],hovertemplate='Predicted %{x:.1%}<br>Observed %{y:.1%}<br>n=%{customdata}<extra>%{fullData.name}</extra>'))
    style(calibration,'Calibration · marker size reflects sample count','Observed frequency')
    calibration.update_xaxes(range=[0,1],tickformat='.0%',title='Mean predicted probability')
    calibration.update_yaxes(range=[0,1],tickformat='.0%')
    scores=report['candidate_metrics']; names=sorted(scores,key=lambda k:scores[k]['log_loss'])
    compare=go.Figure(go.Bar(x=[scores[n]['log_loss'] for n in names],y=names,orientation='h',marker_color=[BLUE if n=='empirical' else INK for n in names]))
    style(compare,'Outer-test log loss · lower is better','Candidate')
    compare.update_xaxes(title='Multiclass log loss'); compare.update_yaxes(autorange='reversed')
    return probability,trajectory,calibration,compare


def track_run(report,source,run_dir):
    """MLflow client pinned to request-local files; ignores external tracking URI."""
    try:
        # MLflow 3 requires explicit opt-in for its deprecated local file backend.
        os.environ['MLFLOW_ALLOW_FILE_STORE']='true'
        os.environ['MLFLOW_DISABLE_TELEMETRY']='true'
        os.environ['MLFLOW_DISABLE_AGENT_HINT']='true'
        from mlflow.tracking import MlflowClient
        store=(run_dir/'mlruns').resolve(); store.mkdir(exist_ok=True)
        client=MlflowClient(tracking_uri=store.as_uri())
        experiment=client.create_experiment('QuantLab request',artifact_location=(run_dir/'mlflow-artifacts').resolve().as_uri())
        run=client.create_run(experiment,tags={'source':'synthetic' if source.get('synthetic') else 'uploaded_csv','purpose':'probability_research'})
        rid=run.info.run_id
        for name,value in {'rows':source.get('rows',0),'threshold_log_return':-.02,'target':'next_observed_close','latest_model':report['latest_forecast']['model']}.items():
            client.log_param(rid,name,str(value))
        for name,value in report['selected_metrics'].items():
            if isinstance(value,(int,float)) and np.isfinite(value): client.log_metric(rid,name,float(value))
        client.set_terminated(rid)
        stored=client.get_run(rid)
        return {'status':'FINISHED','run_id':rid,'metrics':stored.data.metrics,'params':stored.data.params,
                'tracking':'request-local filesystem; no remote server or persistent history'}
    except Exception as error:
        return {'status':'UNAVAILABLE','reason':f'{type(error).__name__}: {error}'}


def export_run(report,source,diagnostics,png,run_dir):
    report=dict(report,source=source,diagnostics=diagnostics)
    (run_dir/'report.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    flat=[]
    for r in report['predictions']:
        flat.append({'feature_index':r['feature_index'],'target_index':r['target_index'],
                     'target_date':r.get('target_date',''),'model':r['model'],
                     'p_log_return_below_minus_0_02':r['probabilities'][0],
                     'p_log_return_minus_0_02_to_zero':r['probabilities'][1],
                     'p_positive_log_return':r['probabilities'][2],'actual_log_return':r['actual_log_return']})
    pd.DataFrame(flat).to_csv(run_dir/'predictions.csv',index=False)
    (run_dir/'mlflow_run.json').write_text(json.dumps(report.get('mlflow',{}),indent=2)+'\n')
    target=run_dir/'quantlab-results.zip'
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
        for name in ['report.json','predictions.csv','mlflow_run.json']:
            archive.write(run_dir/name,name)
        archive.write(png,'return_histogram.png')
    return str(target)


def new_run_directory():
    RUN_ROOT.mkdir(exist_ok=True)
    # Cleanup occurs on new runs. Downloads are temporary, not persistent storage.
    for directory in RUN_ROOT.glob('run-*'):
        if directory.is_dir() and time.time()-directory.stat().st_mtime>3600:
            shutil.rmtree(directory,ignore_errors=True)
    return Path(tempfile.mkdtemp(prefix='run-',dir=RUN_ROOT))


def run_research(source_choice,file_path,n,seed,backends,tune,explain):
    from diagnostics import load_data,calculate_diagnostics,create_static_plot
    from engine import run_experiment
    if source_choice=='Upload CSV' and not file_path: raise ValueError('Upload a date,close CSV before running.')
    dates,close,source=load_data(file_path if source_choice=='Upload CSV' else None,int(n),int(seed))
    report=run_experiment(close,dates=dates,backends=tuple(backends or ()),tune=bool(tune),explain=bool(explain),seed=int(seed))
    for row in report['predictions']: row['target_date']=dates[row['target_index']]
    report['latest_forecast']['feature_date']=dates[-1]
    diagnostics=calculate_diagnostics(close)
    run_dir=new_run_directory(); png=Path(create_static_plot(close,run_dir/'return_histogram.png'))
    report['mlflow']=track_run(report,source,run_dir)
    bundle=export_run(report,source,diagnostics,png,run_dir)
    figures=make_figures(report,dates,close)
    q=report['latest_forecast']['probabilities']; metrics=report['selected_metrics']
    cells=[('P(downside)',f'{q[0]:.2%}'),('P(positive)',f'{q[2]:.2%}'),('Test log loss',f"{metrics['log_loss']:.4f}"),('Unseen observations',f"{len(report['predictions']):,}")]
    stats='<div class="stats">'+''.join(f'<div><span>{label}</span><strong>{value}</strong></div>' for label,value in cells)+'</div>'
    kind='SYNTHETIC' if source.get('synthetic') else 'UPLOADED CSV'
    model=html.escape(str(report['latest_forecast']['model']))
    status=f"**{kind}** · {len(close):,} closes · latest information {dates[-1]} · next-close model **{model}**.\n\nProbabilities describe log returns, not executable trades. Candidate scores include their own observation counts; skipped folds can make coverage differ. Do not reuse outer test scores for tuning."
    table=pd.DataFrame([{'Model':name,'Observations':m.get('observations',len(report['predictions'])),'Log loss':m['log_loss'],'Brier':m['brier_multiclass'],'Up Brier':m['up_brier'],'Downside Brier':m['downside_brier']} for name,m in report['candidate_metrics'].items()]).sort_values('Log loss').round(4)
    audit={k:report.get(k) for k in ['model_status','folds','tuning_trials','shap_explanation','mlflow','latest_forecast']}
    return status,stats,*figures,table,diagnostics,audit,bundle,str(png)
