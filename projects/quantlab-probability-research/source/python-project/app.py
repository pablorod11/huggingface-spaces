"""QuantLab Hugging Face Gradio Space. Run: python app.py."""
import os
import html
os.environ.setdefault('GRADIO_ANALYTICS_ENABLED','False')
os.environ.setdefault('MPLCONFIGDIR','/tmp/quantlab-matplotlib')
from pathlib import Path
import gradio as gr
from service import run_research
from math_lab import game_analysis,zero_sum_2x2,black_scholes,kelly_binary

CSS='''
.gradio-container { max-width: 1380px !important; background: #f2f4f7; }
#title h1 { font-size: 25px; font-weight: 500; letter-spacing: -.6px; margin-bottom: 5px; }
#title p { color: #4f5661; max-width: 840px; }
.stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; padding: 12px 0 22px; }
.stats span { display:block; font-size:13px; color:#505864; margin-bottom:6px; }
.stats strong { display:block; font-size:28px; font-weight:500; font-variant-numeric:tabular-nums; color:#141414; }
#run { background:#141414; color:white; border:0; min-height:44px; }
#source-note { color:#4f5661; font-size:13px; }
footer { display:none !important; }
@media(max-width:640px) { .stats {grid-template-columns:repeat(2,minmax(0,1fr));} .stats strong {font-size:24px;} }
@media(prefers-reduced-motion:reduce) { * {animation:none !important; transition:none !important;} }
'''


def submit(source,file,n,seed,backends,tune,explain):
    try:
        return run_research(source,file,n,seed,backends,tune,explain)
    except ValueError as error:
        return ('**Input error:** '+html.escape(str(error)), '', None, None, None, None, [], {}, {'status':'invalid_input'}, None, None)
    except Exception as error:
        # Avoid exposing server paths or uploaded contents in UI error messages.
        raise gr.Error(f'Experiment could not finish ({type(error).__name__}). Check the data format and try a smaller run.') from error


def game_demo(name):
    if name=='Prisoner’s dilemma':
        a=[[3,0],[5,1]]; b=[[3,5],[0,1]]
        return {'actions':['cooperate','defect'],'row_payoffs':a,'column_payoffs':b,**game_analysis(a,b),
                'interpretation':'Both defect is a pure Nash equilibrium; mutual cooperation gives both a larger payoff. Pareto analysis covers pure outcomes.'}
    a=[[1,-1],[-1,1]]
    return {'row_payoffs':a,'column_payoffs':[[-v for v in row] for row in a],**zero_sum_2x2(a),
            'interpretation':'Matching pennies: each player randomizes equally. This game does not define an equity trading policy.'}


def risk_demo(spot,strike,volatility,maturity,p,odds):
    return {'black_scholes':black_scholes(spot,strike,maturity,.03,volatility),
            'quarter_kelly_binary_fraction':kelly_binary(p,odds,.25,.25),
            'assumptions':'European options, constant volatility/rate, no dividends. Kelly is for a fixed-payoff binary bet. Neither output is an equity allocation recommendation.'}


def build_app():
    theme=gr.themes.Base(font=['Arial','sans-serif'],primary_hue='neutral',neutral_hue='slate',radius_size='sm')
    with gr.Blocks(title='QuantLab · probability research',delete_cache=(1800,3600)) as demo:
        gr.Markdown('# QuantLab / probability research\nForecast the next observed close. Inspect calibration before trusting conviction.',elem_id='title')
        gr.Markdown('Synthetic by default. Uploaded CSVs are processed on the Space server. Research estimates; no demonstrated trading edge.',elem_id='source-note')
        with gr.Tabs():
            with gr.Tab('Forecast workbench'):
                with gr.Row():
                    with gr.Column(scale=1,min_width=265):
                        source=gr.Radio(['Synthetic demo','Upload CSV'],value='Synthetic demo',label='Data source')
                        file=gr.File(label='CSV · date,close · 850–4,000 rows',file_types=['.csv'],type='filepath')
                        n=gr.Slider(850,2500,value=1400,step=50,label='Synthetic observations')
                        seed=gr.Number(value=42,minimum=0,maximum=100000,precision=0,label='Random seed')
                        backends=gr.CheckboxGroup(['sklearn','xgboost','lightgbm','torch'],value=['sklearn','xgboost','lightgbm'],label='Model challengers')
                        gr.Markdown('Empirical and ridge baselines always run. PyTorch requires the optional install. Unavailable backends are reported in the audit.')
                        with gr.Accordion('Research options',open=False):
                            tune=gr.Checkbox(value=False,label='Optuna · 3 XGBoost trials inside training')
                            explain=gr.Checkbox(value=False,label='SHAP · explain a fitted tree model')
                        run=gr.Button('Run chronological experiment',variant='primary',elem_id='run')
                        gr.Markdown('850–4,000 uploaded rows; ISO dates in ascending order. Use adjusted closes. No imputation or automatic market-data download.')
                    with gr.Column(scale=3,min_width=320):
                        status=gr.Markdown('Choose a data source, then run an experiment. Test scores and forecasts will appear here.')
                        stats=gr.HTML('<div class="stats"><div><span>P(downside)</span><strong>—</strong></div><div><span>P(positive)</span><strong>—</strong></div><div><span>Test log loss</span><strong>—</strong></div><div><span>Unseen observations</span><strong>—</strong></div></div>')
                        with gr.Row():
                            probabilities=gr.Plot(label='Next-close probabilities')
                            timeline=gr.Plot(label='Downside through time')
                        with gr.Tabs():
                            with gr.Tab('Validation'):
                                with gr.Row():
                                    reliability=gr.Plot(label='Reliability')
                                    comparison=gr.Plot(label='Candidate loss')
                                scores=gr.Dataframe(label='Candidate test scores · inspect observation counts',interactive=False,wrap=False)
                            with gr.Tab('Statistical diagnostics'):
                                gr.Markdown('Full-history exploratory diagnostics are separate from unseen test scores. ARIMA is not included in model rankings.')
                                diagnostics=gr.JSON(label='SciPy · statsmodels ARIMA · HAC inference')
                                histogram=gr.Image(label='Return distribution · Matplotlib export',interactive=False,type='filepath')
                            with gr.Tab('Audit & explanations'):
                                gr.Markdown('Inspect chronology, skipped backends, tuning, SHAP units and MLflow status. Tree SHAP explains raw margins before temperature calibration.')
                                audit=gr.JSON(label='Run audit')
                        download=gr.File(label='Download report, predictions, histogram and MLflow metadata',interactive=False)
                file.change(lambda uploaded: gr.update(value='Upload CSV') if uploaded else gr.skip(),file,source,api_name=False)
                outputs=[status,stats,probabilities,timeline,reliability,comparison,scores,diagnostics,audit,download,histogram]
                run.click(submit,[source,file,n,seed,backends,tune,explain],outputs,api_name='run_experiment',concurrency_limit=1)
            with gr.Tab('Mathematics lab'):
                gr.Markdown('## Incentives, prices and sizing\nSeparate mathematical examples. The assumptions here do not establish a market forecasting edge.')
                with gr.Row():
                    with gr.Column():
                        game=gr.Dropdown(['Prisoner’s dilemma','Matching pennies'],value='Prisoner’s dilemma',label='Two-player game')
                        game_button=gr.Button('Solve game')
                        game_result=gr.JSON(value=game_demo('Prisoner’s dilemma'),label='Equilibrium and incentives')
                    with gr.Column():
                        spot=gr.Number(value=100,minimum=1,label='Spot price')
                        strike=gr.Number(value=100,minimum=1,label='Strike price')
                        vol=gr.Slider(.01,1,value=.2,label='Annualized volatility')
                        maturity=gr.Slider(.01,3,value=1,label='Maturity · years')
                        probability=gr.Slider(0,1,value=.55,label='Binary bet win probability')
                        odds=gr.Slider(.1,5,value=1,label='Net payoff odds · binary bet')
                        risk_button=gr.Button('Calculate option prices and binary Kelly')
                        risk_result=gr.JSON(label='Assumption-bound results')
                game_button.click(game_demo,game,game_result,api_name='solve_game')
                risk_button.click(risk_demo,[spot,strike,vol,maturity,probability,odds],risk_result,api_name='risk_demo')
            with gr.Tab('Methods & limits'):
                gr.Markdown('''## What this Space implements
Forecasting uses causal return, momentum, realized volatility and drawdown features; an expanding training window; 150 calibration rows; a one-row embargo at each boundary; and 200-row outer test blocks. Temperatures and model selection use calibration data only. Outer scores should be treated as a final evaluation, not reused to tune the same history.

**Events:** log return below −0.02, between −0.02 and zero, or above zero. The downside cutoff corresponds to about −1.98% simple return. Their probabilities sum to one. The horizon follows the next observed CSV row, including any gaps.

**Libraries in use:** pandas and NumPy for data; scikit-learn, XGBoost and LightGBM for classifiers; Plotly and Matplotlib for charts; SciPy and statsmodels for diagnostics; Optuna for bounded inner-training tuning; SHAP for tree explanations; MLflow for local run metadata. An optional PyTorch MLP is a challenger, not TFT or DeepSurv.

**Other supplied code:** game theory, Bayesian networks, Cox survival, isolation forest, Markov simulation, linear algebra/calculus, fractional Brownian drivers, SLE approximation, ER graphs and finite random-matrix illustrations. These labs are independently scoped and are not all predictors in the ensemble. See the repository’s research register for reference access limits.

**Not implemented:** TFT, DeepSurv, PPO, full rough-volatility calibration, SPDE solvers, combinatorial optimization phase transitions, or any justified quantum algorithm. Qiskit and TensorFlow are intentionally omitted.

**Data and files:** uploads and results are processed server-side. Use public or non-sensitive research data on public Spaces. Run exports are isolated in random temporary directories; old results are removed on a subsequent run after an hour. Gradio also clears its file cache. Storage is ephemeral; download what you need. No remote MLflow server, broker, paid data feed or live trading is configured.

**Inference limits:** Gaussian assumptions, dependence, nonstationarity, class imbalance and repeated experiments can invalidate apparent gains. SHAP is not causal. Black–Scholes is risk-neutral pricing. Close-based features do not imply executable same-close fills. Full books were not read; accessible source metadata/abstracts and remaining reading are documented.''')
    return demo,theme


demo,theme=build_app()
if __name__=='__main__':
    demo.queue(max_size=8,default_concurrency_limit=1).launch(server_name='0.0.0.0',server_port=int(os.environ.get('PORT','7860')),
        theme=theme,css=CSS,show_error=False,share=False,max_file_size='2mb')
