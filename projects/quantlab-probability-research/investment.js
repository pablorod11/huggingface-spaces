/* Independent USD fractional-share historical and conditional lognormal calculations. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuantInvestment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  const Z90 = 1.2815515655446004;
  function dateTime(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must use YYYY-MM-DD.');
    const time = Date.parse(value + 'T00:00:00Z');
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('Choose a real calendar date.');
    return time;
  }
  function bounded(value, min, max, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(label + ' must be a finite number from ' + min + ' to ' + max + '.');
    return value;
  }
  function finitePositive(value) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('These prices or assumptions produce an unsupported numerical result.');
    return value;
  }
  function validateSeries(series) {
    if (!series || !Array.isArray(series.dates) || !Array.isArray(series.closes) || series.dates.length !== series.closes.length || series.dates.length < 2) throw new Error('Provide at least two matching dates and closing prices.');
    let previous = -Infinity;
    for (let i = 0; i < series.dates.length; i++) {
      const date = series.dates[i];
      const time = dateTime(date);
      if (time <= previous) throw new Error('Dates must be unique and sorted from oldest to newest.');
      previous = time;
      if (typeof series.closes[i] !== 'number' || !Number.isFinite(series.closes[i]) || series.closes[i] <= 0) throw new Error('Every closing price must be a positive finite number.');
    }
    return series;
  }
  function historical(series, options) {
    validateSeries(series);
    if (!options) throw new Error('Choose an amount and date range.');
    const amount = bounded(options.amount, .01, 1e9, 'Investment amount');
    const startTime = dateTime(options.start), endTime = dateTime(options.end);
    const {dates, closes} = series;
    if (startTime >= endTime) throw new Error('The end date must follow the start date.');
    if (options.start < dates[0] || options.end > dates[dates.length - 1]) throw new Error('Choose dates within the available price history.');
    const first = dates.findIndex(date => date >= options.start);
    let last = dates.length - 1;
    while (last >= 0 && dates[last] > options.end) last--;
    if (last <= first) throw new Error('Choose a range containing at least two trading observations.');
    let peak = amount, maxDrawdown = 0;
    const points = [];
    for (let i = first; i <= last; i++) {
      const value = finitePositive(amount * (closes[i] / closes[first]));
      peak = Math.max(peak, value);
      const drawdown = value / peak - 1;
      maxDrawdown = Math.max(maxDrawdown, -drawdown);
      points.push({date: dates[i], value, drawdown});
    }
    const finalValue = points[points.length - 1].value;
    const roi = finalValue / amount - 1;
    const annualizedReturn = Math.expm1(Math.log(finalValue / amount) * 365.25 * DAY / (dateTime(dates[last]) - dateTime(dates[first])));
    if (![roi, annualizedReturn, finalValue - amount].every(Number.isFinite)) throw new Error('This date range produces an unsupported numerical result.');
    return {amount, finalValue, gain: finalValue - amount, roi, annualizedReturn, maxDrawdown, start: dates[first], end: dates[last], points};
  }
  function estimate(series, options) {
    validateSeries(series);
    const windowYears = options && options.windowYears;
    if (![1, 3, 5].includes(windowYears)) throw new Error('Choose a 1, 3, or 5 year estimation window.');
    const {dates, closes} = series;
    const end = dates[dates.length - 1];
    // Calendar window anchored at the final observation, including the boundary price.
    const boundary = new Date(dateTime(end));
    boundary.setUTCFullYear(boundary.getUTCFullYear() - windowYears);
    const first = dates.findIndex(date => dateTime(date) >= boundary.getTime());
    const count = dates.length - first - 1;
    if (count < 60) throw new Error('At least 60 daily returns are required in the selected window.');
    let mean = 0, m2 = 0, n = 0;
    for (let i = first + 1; i < closes.length; i++) {
      const value = Math.log(closes[i]) - Math.log(closes[i - 1]);
      n++;
      const delta = value - mean;
      mean += delta / n;
      m2 += delta * (value - mean);
    }
    const varianceAnnual = Math.max(0, m2 / (n - 1)) * 252;
    const annualReturn = Math.expm1(mean * 252 + varianceAnnual / 2);
    const volatility = Math.sqrt(varianceAnnual);
    if (![annualReturn, volatility].every(Number.isFinite)) throw new Error('Price history produces nonfinite annual assumptions.');
    return {annualReturn, volatility, start: dates[first], end, observations: count};
  }
  function normalCDF(x) {
    // Abramowitz–Stegun normal approximation: absolute error below 8e-8.
    if (x === 0) return .5;
    const t = 1 / (1 + .2316419 * Math.abs(x));
    const tail = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * t * (.319381530 + t * (-.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return Math.max(0, Math.min(1, x >= 0 ? 1 - tail : tail));
  }
  function project(options) {
    if (!options) throw new Error('Provide future scenario assumptions.');
    const amount = bounded(options.amount, .01, 1e9, 'Investment amount');
    const years = bounded(options.years, 1 / 12, 10, 'Years');
    const annualReturn = bounded(options.annualReturn, -.95, 2, 'Annual return');
    const volatility = bounded(options.volatility, 0, 2, 'Annual volatility');
    const growth = Math.log1p(annualReturn), drift = growth - volatility * volatility / 2;
    function point(time) {
      const center = drift * time, width = Z90 * volatility * Math.sqrt(time);
      return {years: time, mean: finitePositive(amount * Math.exp(growth * time)), median: finitePositive(amount * Math.exp(center)), p10: finitePositive(amount * Math.exp(center - width)), p90: finitePositive(amount * Math.exp(center + width))};
    }
    const result = point(years);
    const steps = Math.min(120, Math.max(1, Math.ceil(years * 12)));
    const points = Array.from({length: steps + 1}, (_, i) => point(years * i / steps));
    const lossProbability = volatility === 0 ? (annualReturn < 0 ? 1 : 0) : normalCDF(-drift * Math.sqrt(years) / volatility);
    return {amount, years, mean: result.mean, median: result.median, p10: result.p10, p90: result.p90, roi: result.mean / amount - 1, lossProbability, points};
  }
  function parseCSV(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > 2 * 1024 * 1024) throw new Error('CSV must be text no larger than 2 MiB.');
    text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const rows = [];
    let row = [], field = '', quoted = false, closed = false;
    function pushRow() {
      row.push(field);
      if (row.some(value => value.trim() !== '')) rows.push(row);
      if (rows.length > 2501) throw new Error('CSV supports at most 2,500 price rows.');
      row = []; field = ''; closed = false;
    }
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { quoted = false; closed = true; }
        else field += c;
      } else if (c === ',') { row.push(field); field = ''; closed = false; }
      else if (c === '\n') pushRow();
      else if (c === '"' && !field && !closed) quoted = true;
      else if (c === '"' || (closed && !/\s/.test(c))) throw new Error('CSV contains malformed quoting.');
      else field += c;
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted field.');
    pushRow();
    if (rows.length < 3) throw new Error('CSV needs a header and at least two price rows.');
    const headers = rows.shift().map(value => value.trim().toLowerCase());
    if (new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique.');
    const dateIndex = headers.indexOf('date');
    const priceIndex = headers.includes('adj_close') ? headers.indexOf('adj_close') : headers.indexOf('close');
    if (dateIndex < 0 || priceIndex < 0) throw new Error('CSV requires date and adj_close (or close) columns.');
    const series = {dates: [], closes: []};
    rows.forEach((values, i) => {
      if (values.length !== headers.length) throw new Error('CSV row ' + (i + 2) + ' has the wrong number of fields.');
      const price = values[priceIndex].trim();
      if (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(price)) throw new Error('CSV row ' + (i + 2) + ' needs a positive numeric closing price.');
      series.dates.push(values[dateIndex].trim());
      series.closes.push(Number(price));
    });
    return validateSeries(series);
  }
  return {validateSeries, historical, estimate, project, parseCSV};
});
