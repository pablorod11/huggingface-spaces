import test from "node:test";
import assert from "node:assert/strict";
import { bindCharts, chartHTML, resetCharts } from "../src/chart-ui.js";
const metric = { key: "value", label: "Spend", color: "#087f8c", unit: "usd" };

test("chart exposes exact dates and currency through a single native point inspector and table", () => {
  resetCharts();
  const html = chartHTML(
    [
      { date: "2026-11-01T01:00:00Z", value: 0 },
      { date: "2026-11-01T02:00:00Z", value: 1234.5678 },
    ],
    [metric],
    { hourly: true, title: "Hourly spend" },
  );
  assert.equal((html.match(/type="range"/g) || []).length, 1);
  assert.match(html, /max="1"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Inspect Hourly spend point/);
  assert.match(html, /<summary>View chart data/);
  assert.match(html, /2026-11-01T02:00:00Z/);
  assert.match(html, /\$1,234\.57/);
  assert.match(html, /\$0\.00/);
  assert.match(html, /Spend \(USD\)/);
  assert.match(
    html,
    /class="table-wrap" tabindex="0" role="region" aria-label="Hourly spend chart data"/,
  );
  assert.match(html, /viewBox="0 0 480 250"/);
});

test("missing observations break the drawn line while observed zero remains available", () => {
  const html = chartHTML(
    [
      { date: "2026-11-01", value: 10 },
      { date: "2026-11-02", value: null },
      { date: "2026-11-03", value: 0 },
    ],
    [metric],
  );
  const path = html.match(/<path[^>]*data-series="value"[^>]*d="([^"]*)"/);
  assert.ok(path);
  assert.equal((path[1].match(/M/g) || []).length, 2);
  assert.doesNotMatch(path[1], /L/);
  assert.match(html, /Unavailable/);
  assert.match(html, /\$0\.00/);
});

test("forecast dates and exact 95 percent bounds are inspectable alongside the forecast", () => {
  const html = chartHTML(
    [{ date: "2026-11-01", value: 10 }],
    [
      { key: "value", label: "Observed", color: "#087f8c", unit: "count" },
      {
        key: "forecast",
        label: "Forecast",
        color: "#a17c56",
        unit: "count",
        dashed: true,
      },
    ],
    { forecast: [{ date: "2026-11-02", forecast: 12, lower: -2, upper: 25 }] },
  );
  assert.match(html, /95% forecast interval/);
  assert.match(html, /95% lower/);
  assert.match(html, /95% upper/);
  assert.match(html, /2026-11-02/);
  assert.match(html, /<td>12<\/td>/);
  assert.match(html, /<td>-2<\/td>/);
  assert.match(html, /<td>25<\/td>/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test("chart escapes labels and dates and reports empty data without unusable controls", () => {
  const html = chartHTML(
    [{ date: '<img src=x onerror="bad">', value: 75 }],
    [{ ...metric, label: "<script>bad</script>" }],
    { title: "<b>Trend</b>", percent: true },
  );
  assert.doesNotMatch(html, /<script>|<img |<b>Trend/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /75% CPU target/);
  assert.match(html, /&lt;img/);
  const empty = chartHTML([], [metric]);
  assert.match(empty, /No observations/);
  assert.doesNotMatch(empty, /type="range"/);
});

test("point inspector rounds binary tails and initially selects the latest observation before forecasts", () => {
  const html = chartHTML(
    [
      { date: "2026-11-01", spend: 0, percent: null, count: 0 },
      {
        date: "2026-11-02",
        spend: 5131.188800000001,
        percent: 72.123456789,
        count: 272.48230700000005,
      },
    ],
    [
      { key: "spend", label: "Spend", unit: "usd" },
      { key: "percent", label: "CPU", unit: "percent" },
      { key: "count", label: "Transactions", unit: "count" },
    ],
    {
      forecast: [{ date: "2026-11-03", forecast: 100, lower: 90, upper: 110 }],
    },
  );
  assert.match(html, /step="1" value="1"/);
  assert.match(html, /\$5,131\.19/);
  assert.match(html, /72\.123%/);
  assert.match(html, /272\.48/);
  assert.doesNotMatch(
    html.replace(/<svg[\s\S]*?<\/svg>/g, ""),
    /00000001|00000005|72\.123456789/,
  );
  assert.match(html, /USD 2 decimals; percent 3; counts up to 2/);
  assert.match(html, /Unavailable/);
});

test("all-null series explain absent numeric evidence without hiding the inspector and table", () => {
  const html = chartHTML([{ date: "2026-11-01", value: null }], [metric], {
    percent: true,
  });
  assert.match(html, /No numeric observations available/);
  assert.doesNotMatch(
    html,
    /class="gridline"|75% CPU target|data-chart-cursor/,
  );
  assert.match(html, /type="range"/);
  assert.match(html, /<table>/);
  assert.match(html, /Unavailable/);
  const zero = chartHTML([{ date: "2026-11-01", value: 0 }], [metric], {
    percent: true,
  });
  assert.doesNotMatch(zero, /No numeric observations/);
  assert.match(zero, /class="gridline"/);
  assert.match(zero, /75% CPU target/);
  assert.match(zero, /<circle/);
});

test("legend samples match validated metric patterns and the forecast dashed fallback", () => {
  const patterns = [
    { key: "a", pattern: "dash", expected: "6 5" },
    { key: "b", pattern: "dot", expected: "1 5" },
    { key: "c", dashed: true, expected: "6 5" },
  ];
  for (const { expected, ...m } of patterns) {
    const html = chartHTML(
      [{ date: "2026-11-01", [m.key]: 1 }],
      [{ ...metric, ...m }],
    );
    assert.match(
      html,
      new RegExp(
        `<path data-series="${m.key}"[^>]*stroke-dasharray="${expected}"`,
      ),
    );
    assert.match(
      html,
      new RegExp(
        `<svg[^>]*width="24"[^>]*height="8"[^>]*aria-hidden="true"[^>]*>[\\s\\S]*?<line[^>]*stroke-dasharray="${expected}"`,
      ),
    );
  }
  const malicious = chartHTML(
    [{ date: "2026-11-01", value: 1 }],
    [{ ...metric, pattern: '\" onload=\"bad', color: '\" onload=\"bad' }],
    { title: '\" onfocus=\"bad' },
  );
  assert.doesNotMatch(malicious, / onload=|aria-label="" onfocus=/);
  assert.doesNotMatch(
    malicious.match(/<path data-series="value"[^>]*>/)[0],
    /stroke-dasharray=/,
  );
  assert.match(malicious, /aria-label="&quot; onfocus=&quot;bad chart data"/);
});

test("point binding keeps null-data inspectors usable and binds the plot rather than its legend", () => {
  for (const missing of [true, false]) {
    resetCharts();
    chartHTML(
      [
        { date: "2026-11-01", value: missing ? null : 1 },
        { date: "2026-11-02", value: missing ? null : 2 },
      ],
      [metric],
    );
    const attributes = {};
    const input = {
      value: "0",
      setAttribute: (key, value) => {
        attributes[key] = value;
      },
    };
    const output = {};
    const cursor = missing
      ? null
      : {
          setAttribute: (key, value) => {
            attributes[key] = value;
          },
        };
    const svg = missing ? null : {};
    const legend = {};
    const section = {
      dataset: { chart: "trend-0" },
      querySelector: (selector) =>
        ({
          'input[type="range"]': input,
          output,
          "[data-chart-cursor]": cursor,
          "svg.chart": svg,
          svg: legend,
        })[selector],
    };
    bindCharts({ querySelectorAll: () => [section] });
    input.oninput();
    assert.match(attributes["aria-valuetext"], /2026-11-01/);
    assert.match(output.textContent, missing ? /Unavailable/ : /\$1\.00/);
    assert.equal(legend.onclick, undefined);
    if (svg) {
      assert.equal(typeof svg.onclick, "function");
      assert.equal(attributes.x1, 58);
      assert.equal(attributes.x2, 58);
    }
  }
});
