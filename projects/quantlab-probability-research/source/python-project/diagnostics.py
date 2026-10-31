"""Data validation and explicitly in-sample return diagnostics for QuantLab."""
from pathlib import Path
import warnings
import numpy as np
import pandas as pd
from scipy import stats
import statsmodels.api as sm
from statsmodels.tsa.arima.model import ARIMA
from pipeline import synthetic

MIN_ROWS, MAX_ROWS, MAX_BYTES = 850, 4000, 2 * 1024 * 1024


def _close(close):
    x = np.asarray(close, dtype=float)
    if x.ndim != 1 or len(x) < MIN_ROWS or len(x) > MAX_ROWS or not np.isfinite(x).all() or (x <= 0).any():
        raise ValueError('Require 850–4000 finite positive closes.')
    return x


def load_data(file_path=None, n=1400, seed=42):
    """Read strictly ascending CSV date,close data; never sort or impute uploads.

    Calendar gaps are descriptive: weekdays include exchange holidays, so a gap
    does not establish missing market data. Synthetic dates are business-day
    labels beginning in 2010, not observations of a real market calendar.
    """
    if file_path is None:
        if isinstance(n, bool) or not isinstance(n, (int, np.integer)) or not MIN_ROWS <= n <= MAX_ROWS:
            raise ValueError('Synthetic row count must be an integer from 850 to 4000.')
        dates = pd.bdate_range('2010-01-04', periods=n)
        prices = _close(synthetic(n=n, seed=seed))
        source = dict(synthetic=True, name='Synthetic regime-switching returns', seed=int(seed))
    else:
        path = Path(file_path)
        if not path.is_file() or path.stat().st_size > MAX_BYTES:
            raise ValueError('CSV must exist and be no larger than 2 MiB.')
        try:
            frame = pd.read_csv(path)
        except Exception as exc:
            raise ValueError('Unable to read CSV.') from exc
        if not {'date', 'close'}.issubset(frame.columns):
            raise ValueError('CSV requires date and close columns.')
        if frame[['date', 'close']].isna().any().any():
            raise ValueError('Missing date or close values are refused.')
        try:
            date_text = frame['date'].astype(str)
            if not date_text.str.fullmatch(r'\d{4}-\d{2}-\d{2}').all():
                raise ValueError('Dates must use YYYY-MM-DD format.')
            dates = pd.DatetimeIndex(pd.to_datetime(date_text, format='%Y-%m-%d', errors='raise'))
            prices = _close(pd.to_numeric(frame['close'], errors='raise').to_numpy())
        except (ValueError, TypeError, OverflowError) as exc:
            raise ValueError('Invalid date or close values; require ISO dates and finite positive prices.') from exc
        if dates.has_duplicates or not dates.is_monotonic_increasing:
            raise ValueError('Dates must be unique and strictly ascending; data will not be sorted.')
        source = dict(synthetic=False, name='Uploaded CSV', rows=int(len(prices)))
    days = np.diff(dates.to_numpy()).astype('timedelta64[D]').astype(int)
    expected = pd.bdate_range(dates[0], dates[-1])
    missing = expected.difference(dates)
    source['calendar_gaps'] = dict(max_gap_days=int(days.max()), gaps_over_three_days=int((days > 3).sum()),
        missing_weekdays=int(len(missing)), missing_weekday_examples=[d.strftime('%Y-%m-%d') for d in missing[:10]],
        interpretation='Weekdays include market holidays; gaps do not by themselves prove missing observations.')
    source['rows'] = int(len(prices))
    source['return_definition'] = 'Next-observed-close log return; uploaded prices are assumed consistently adjusted.'
    return [d.strftime('%Y-%m-%d') for d in dates], prices, source


def _number(value):
    value = float(value)
    return value if np.isfinite(value) else None


def calculate_diagnostics(close):
    """Full-history diagnostics, separate from chronological prediction scores.

    ARIMA is fitted to log RETURNS, forecasts the next log return, and its normal
    confidence interval is conditional on model assumptions. OLS regresses the
    current return on its lag, with Newey–West/HAC uncertainty (five lags). This
    entire-history inference is exploratory, not out-of-sample forecast evidence.
    """
    returns = np.diff(np.log(_close(close)))
    sd = float(returns.std(ddof=1))
    if sd <= 1e-14:
        raise ValueError('Return variation is too small for meaningful diagnostics.')
    jb = stats.jarque_bera(returns)
    normality = dict(skew=_number(stats.skew(returns, bias=False)),
        excess_kurtosis=_number(stats.kurtosis(returns, fisher=True, bias=False)),
        jarque_bera_statistic=_number(jb.statistic), p_value=_number(jb.pvalue),
        interpretation='Jarque–Bera tests normality, not independence. Its asymptotic p-value assumes IID observations; serial dependence can invalidate it.')
    design = sm.add_constant(returns[:-1], has_constant='add')
    ols = sm.OLS(returns[1:], design).fit(cov_type='HAC', cov_kwds={'maxlags': 5}, use_t=False)
    hac = dict(target='r[t] = intercept + beta * r[t-1]',
        scope='Full-history in-sample exploratory inference; no out-of-sample forecasting validity claim.',
        covariance='HAC/Newey–West, 5 lags, asymptotic normal inference',
        observations=int(ols.nobs), coefficients=[_number(x) for x in ols.params],
        standard_errors=[_number(x) for x in ols.bse], p_values=[_number(x) for x in ols.pvalues],
        confidence_intervals=[[_number(x) for x in row] for row in ols.conf_int()], r_squared=_number(ols.rsquared))
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always')
        model = ARIMA(returns, order=(1, 0, 0), trend='c').fit()
        forecast = model.get_forecast(steps=1)
        ci = np.asarray(forecast.conf_int(alpha=.05))[0]
    arima = dict(order=[1, 0, 0], target='Next close-to-close log return',
        scope='Full-history fitted demonstration. Forecast is unvalidated; excluded from out-of-sample model rankings.',
        forecast_log_return=_number(np.asarray(forecast.predicted_mean)[0]),
        interval_95=[_number(x) for x in ci], interval_assumptions='Conditional Gaussian ARIMA innovation assumptions; parameter uncertainty omitted.',
        converged=bool(model.mle_retvals.get('converged', False)), warnings=list(dict.fromkeys(str(w.message) for w in caught)),
        aic=_number(model.aic), parameters={str(k): _number(v) for k, v in zip(model.param_names, model.params)})
    return dict(return_count=len(returns), mean_log_return=_number(returns.mean()),
        std_log_return=sd, normality=normality, ols_hac=hac, arima=arima)


def create_static_plot(close, path):
    """Export observed log-return histogram; normal overlay is descriptive only."""
    import matplotlib
    matplotlib.use('Agg')
    from matplotlib import pyplot as plt
    r = np.diff(np.log(_close(close)))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(8, 4.5), constrained_layout=True)
    ax.hist(r, bins=55, density=True, color='#1d5fbf', alpha=.8, label='Observed returns')
    sd = r.std(ddof=1)
    if sd > 1e-14:
        x = np.linspace(r.min(), r.max(), 500)
        ax.plot(x, stats.norm.pdf(x, loc=r.mean(), scale=sd), color='#141414', label='Normal with sample mean/SD')
    ax.set(xlabel='Next-observed-close log return', ylabel='Probability density', title='Return distribution · descriptive diagnostic')
    ax.legend(frameon=False)
    fig.savefig(path, format='png', dpi=160)
    plt.close(fig)
    return str(path.resolve())
