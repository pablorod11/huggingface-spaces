import { saveWorkspaceChange } from "./workspace-actions.js?v=4.2";
import {
  incompatibleRegions,
  clearIncompatibleRegions,
  scopeSummary,
  activeFilterCount,
} from "./scope-ui.js?v=4.0";
import {
  captureInvestigation,
  intervalEvidence,
} from "./investigation.js?v=4.0";
import { loadDemoSource } from "./demo-source.js?v=4.0";
import { forecastContext } from "./forecast-ui.js?v=4.0";
import {
  validateContracts,
  renewalQueue,
  contractsJSON,
  contractRegistryKey,
  parseContractsJSON,
  MAX_CONTRACT_BYTES,
} from "./contracts.js?v=4.0";
import { resetCharts, chartHTML, bindCharts } from "./chart-ui.js?v=4.2";
import { spendBridge } from "./finance.js?v=4.0";
import {
  capacityExceptions,
  serviceExceptions,
  recentServiceBurn,
  exceptionFilters,
} from "./decisions.js?v=4.0";
import {
  PROVIDERS,
  ENVIRONMENTS,
  TIERS,
  defaultFilters,
  validateFilters,
  parseInfraCSV,
  infraCSV,
  validateInfraRows,
  selectInfra,
  summarizeInfra,
  groupInfra,
  seriesInfra,
  capacityModel,
  infraAnomalies,
  forecastInfra,
  infraInsights,
  infrastructureQuality,
} from "./infra.js?v=4.0";
import {
  readInfraState,
  writeInfraState,
  shareInfraState,
  parseSharedInfraState,
  TABS,
  reconcileCompanionSource,
} from "./infra-state.js?v=4.0";
import { upsertSchedule, scheduleSummary } from "./runner.js?v=4.0";
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (v, d = 0) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-US", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      });
const money = (v, d = 0) =>
    v == null || !Number.isFinite(v)
      ? "—"
      : (v < 0 ? "−$" : "$") + num(Math.abs(v), d),
  pct = (v, digits = 1) => (v == null ? "—" : num(v, digits) + "%");
const labels = {
  executive: "Executive summary",
  capacity: "Capacity & utilization",
  economics: "Unit economics & vendors",
};
const providerName = (k) => PROVIDERS.find((p) => p.id === k)?.label || k;
let storage;
try {
  storage = localStorage;
} catch {}
let state = readInfraState(storage);
Object.assign(state, parseSharedInfraState(location.href) || {});
let rows = [],
  source = { id: "demo", label: "Historical synthetic demo" },
  backend = "",
  token = "",
  sources = [],
  schedules = [],
  logs = [],
  connected = false;
let companionSourceId = "";
let sourceRevision = 0;
let pendingOperation = null;
const busyControls = new Map();
let activeExceptions = [];
let investigation = null;
let renewalsReviewOnly = false;
let demoContracts = [],
  contractEditId = "",
  utilitySection = "source",
  operations = {},
  removedBookmark = null;
let scenario = { demandGrowth: 20, capacityChange: 0, efficiencyGain: 0 };
function save() {
  return writeInfraState(storage, state);
}
function notice(message) {
  $("#notice").textContent = message;
  if ($("#utility").open && $("#utility-feedback"))
    $("#utility-feedback").textContent = message;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => ($("#notice").textContent = ""), 7000);
}
function syncPendingControls() {
  for (const [node, original] of busyControls) {
    if (node.isConnected) {
      node.disabled = original.disabled;
      if (original.busy === null) node.removeAttribute("aria-busy");
      else node.setAttribute("aria-busy", original.busy);
      if (original.text !== null) node.textContent = original.text;
    }
  }
  busyControls.clear();
  const body = $("#utility-body");
  body?.setAttribute("aria-busy", String(!!pendingOperation));
  if (!pendingOperation) return;
  document
    .querySelectorAll(
      '[data-action="snapshot"], [data-action="demo"], [data-action="runner-refresh"], [data-action="run"], [data-action="import"], #source-select, #connect-form button[type="submit"], #schedule-form button[type="submit"]',
    )
    .forEach((node) => {
      busyControls.set(node, {
        disabled: node.disabled,
        busy: node.getAttribute("aria-busy"),
        text: node.tagName === "BUTTON" ? node.textContent : null,
      });
      node.disabled = true;
    });
  if (pendingOperation.control?.isConnected) {
    pendingOperation.control.textContent = pendingOperation.label;
    pendingOperation.control.setAttribute("aria-busy", "true");
  }
  if ($("#utility-feedback"))
    $("#utility-feedback").textContent = pendingOperation.label;
}
function beginPending(control, label) {
  if (pendingOperation) return null;
  pendingOperation = { control, label };
  syncPendingControls();
  notice(label);
  return () => {
    pendingOperation = null;
    syncPendingControls();
    const feedback = $("#utility-feedback");
    if (feedback?.textContent === label)
      feedback.textContent = "Request finished.";
    if ($("#notice").textContent === label) $("#notice").textContent = "";
  };
}
function focusAfterUpdate(selector, root = document) {
  const target = root.querySelector(selector);
  target?.focus({ preventScroll: true });
}
function labelTables(root) {
  root.querySelectorAll(".table-wrap:not([aria-label])").forEach((wrap) => {
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute(
      "aria-label",
      (wrap.querySelector("caption")?.textContent ||
        wrap.closest(".panel, .utility-section")?.querySelector("h2,h3")
          ?.textContent ||
        "Analysis table") + " · scroll to see all columns",
    );
  });
}
function button(label, action, cls = "") {
  return `<button type="button" class="${cls}" data-action="${action}">${label}</button>`;
}
function filterMenu(title, key, options) {
  return `<details class="filter-menu"><summary><span>${title}</span><b data-count="${key}">All</b></summary><div class="filter-pop"><strong>${title}</strong><label><input type="checkbox" data-all="${key}">All ${esc(title.toLowerCase())}</label><p class="filter-hint">Choose individual options to narrow the scope.</p>${options.map((o) => `<label><input type="checkbox" data-filter="${key}" value="${esc(o.id)}">${esc(o.label)}</label>`).join("")}</div></details>`;
}
function positionFilter(details) {
  const anchor = details.querySelector("summary").getBoundingClientRect();
  const popup = details.querySelector(".filter-pop");
  const width = Math.min(340, window.innerWidth - 16);
  const below = window.innerHeight - anchor.bottom - 16;
  const top =
    below >= Math.min(180, window.innerHeight / 2) ? anchor.bottom + 7 : 8;
  popup.style.top = `${top}px`;
  popup.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
  popup.style.maxHeight = `${Math.max(40, window.innerHeight - top - 8)}px`;
}
function repositionFilters() {
  document.querySelectorAll(".filter-menu[open]").forEach(positionFilter);
}
function mount() {
  $("#app").innerHTML =
    `<header id="global-header"><div class="brand-row"><a href="./" class="brand" aria-label="Orbis home"><img class="brand-wordmark" src="./assets/orbis.svg" alt="Orbis" width="123" height="52"></a><span class="product-label">Infrastructure intelligence</span><span id="source-label" class="source-label"></span></div><div class="mobile-scope"><button type="button" id="scope-toggle" aria-expanded="false" aria-controls="global-filters">Filters · 0 active</button><span id="scope-summary"></span></div><div id="global-filters" class="filter-row"><label class="range-label">Period<select id="range" aria-label="Period"><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="qtd">Quarter to date</option><option value="yoy">Year over year</option></select></label>${filterMenu("Environment", "environments", ENVIRONMENTS)}<details class="filter-menu provider-menu"><summary><span>Provider & region</span><b id="provider-count">All</b></summary><div class="filter-pop"><label><input type="checkbox" data-all="providers,regions">All providers & regions</label><p class="filter-hint">Choose providers or regions below to narrow the scope.</p>${PROVIDERS.map((p) => `<fieldset><legend><label><input type="checkbox" data-filter="providers" value="${esc(p.id)}">${esc(p.label)}</label></legend>${p.regions.map((r) => `<label class="region-option"><input type="checkbox" data-filter="regions" value="${esc(r.id)}">${esc(r.label)}</label>`).join("")}</fieldset>`).join("")}<div id="region-recovery"></div><p>Provider and region selections intersect. The All option clears individual restrictions.</p></div></details>${filterMenu("Customer tier", "tiers", TIERS)}${button("Reset filters", "reset", "text-button")}<span class="filter-help">USD · UTC</span></div></header><aside class="brand-rail" aria-hidden="true"><span>Analysis workspace</span><p>Clarity, all around.</p></aside><div class="page"><div class="toolbar"><label class="mobile-audience">Dashboard view<select id="audience-select" aria-label="Dashboard view">${TABS.map((tab) => `<option value="${tab}">${labels[tab]}</option>`).join("")}</select></label><nav role="tablist" aria-label="Infrastructure audience">${TABS.map((tab) => `<button role="tab" id="tab-${tab}" aria-controls="main" data-tab="${tab}">${labels[tab]}</button>`).join("")}</nav><div class="tools">${button("Workspace", "tools")}<label class="saved-selector"><span class="sr-only">Saved views</span><select id="saved-view-select" aria-label="Saved views"><option value="">Saved views</option></select></label>${button("Save view", "bookmark")}${button("Export CSV", "csv", "primary")}</div></div><main id="main" role="tabpanel" tabindex="-1" aria-busy="true"><p class="loading">Loading infrastructure facts…</p></main><footer>Orbis · Infrastructure intelligence <span>Allocated capacity-hours · USD · UTC</span></footer></div><dialog id="utility" aria-labelledby="utility-title"><div class="dialog-head"><h2 id="utility-title">Workspace tools</h2>${button("Close", "close")}</div><div id="utility-body"></div></dialog><dialog id="save-view" aria-labelledby="save-view-title"><div class="dialog-head"><h2 id="save-view-title">Save this view</h2>${button("Close", "close-save")}</div><p>Save the current filters and tab in this browser profile. Loading a view uses your current source.</p><form id="bookmark-form"><label>View name<input name="name" maxlength="80" required placeholder="Production capacity review"></label><p id="save-view-error" role="alert"></p><button type="submit" class="primary">Save current view</button></form></dialog><input id="csv-file" type="file" accept=".csv,text/csv" hidden><input id="contract-file" type="file" accept=".json,application/json" hidden>`;
  new ResizeObserver((entries) => {
    document.documentElement.style.setProperty(
      "--header-height",
      `${entries[0].target.getBoundingClientRect().height}px`,
    );
  }).observe($("#global-header"));
  syncFilters();
  bind();
  window.addEventListener("resize", repositionFilters, { passive: true });
  $("#global-filters").addEventListener("scroll", repositionFilters, {
    passive: true,
  });
}
function syncFilters() {
  $("#scope-toggle").textContent =
    `Filters · ${activeFilterCount(state.filters)} active`;
  $("#scope-summary").textContent = scopeSummary(state.filters);
  $("#region-recovery").innerHTML = regionRecovery();
  document
    .querySelectorAll("[data-all]")
    .forEach(
      (e) =>
        (e.checked = e.dataset.all
          .split(",")
          .every((k) => !state.filters[k].length)),
    );
  $("#range").value = state.filters.range;
  document
    .querySelectorAll("[data-filter]")
    .forEach(
      (e) => (e.checked = state.filters[e.dataset.filter].includes(e.value)),
    );
  for (const key of ["environments", "tiers"])
    $(`[data-count="${key}"]`).textContent = state.filters[key].length
      ? `${state.filters[key].length} selected`
      : "All";
  $("#provider-count").textContent =
    state.filters.providers.length || state.filters.regions.length
      ? `${state.filters.providers.length || "All"} providers · ${state.filters.regions.length || "all"} regions`
      : "All";
}
function regionRecovery() {
  const conflicts = incompatibleRegions(state.filters);
  return conflicts.length
    ? `<p class="filter-conflict">${num(conflicts.length)} selected region(s) excluded by selected providers: ${esc(conflicts.join(", "))}.</p>${button("Clear incompatible regions", "repair-regions")}`
    : "";
}
function filtered() {
  const c = selectInfra(rows, state.filters);
  return {
    ...c,
    summary: summarizeInfra(c.rows),
    previous: summarizeInfra(c.previousRows),
    series: seriesInfra(c.rows, state.filters.range),
    burn: recentServiceBurn(c.rows, c.window.end),
    capacityExceptions: capacityExceptions(c.rows, 72),
    serviceExceptions: serviceExceptions(c.rows, 72),
  };
}
function panel(title, sub, body, extra = "") {
  return `<section class="panel"><div class="panel-heading"><div><h2>${title}</h2><p>${sub}</p></div>${extra}</div>${body}</section>`;
}
function kpi(title, value, sub) {
  return `<article class="kpi"><h2>${title}</h2><strong>${value}</strong><p>${sub}</p></article>`;
}
function delta(value, old) {
  if (value == null || old == null || old === 0)
    return "Prior comparison unavailable";
  return `${value >= old ? "+" : ""}${num(((value - old) / Math.abs(old)) * 100, 1)}% vs previous period`;
}
function metricCards(items) {
  return `<div class="kpis">${items.map((i) => kpi(...i)).join("")}</div>`;
}
function lineChart(points, metrics, options = {}) {
  return chartHTML(
    points,
    metrics.map((m) => ({
      ...m,
      unit: options.percent
        ? "percent"
        : ["revenue", "totalCost", "contribution"].includes(m.key)
          ? "usd"
          : "count",
    })),
    {
      ...options,
      hourly: options.hourly ?? state.filters.range === "24h",
      title: metrics.map((m) => m.label).join(" and "),
    },
  );
}

const colors = ["#284fc9", "#69748c", "#a5adbf", "#d7d9df"];
function costStack(s) {
  const fields = [
    ["Compute", "computeCost"],
    ["Storage", "storageCost"],
    ["Network", "networkCost"],
    ["Support", "supportCost"],
  ];
  return `<div class="cost-stack" aria-label="Infrastructure cost composition">${fields.map(([n, k], i) => `<div title="${n}: ${money(s[k])}" style="width:${s.totalCost ? (s[k] / s.totalCost) * 100 : 0}%;background:${colors[i]}"></div>`).join("")}</div><div class="stack-details">${fields.map(([n, k], i) => `<div><span><i style="background:${colors[i]}"></i>${n}</span><strong>${money(s[k])}</strong><small>${s.totalCost ? pct((s[k] / s.totalCost) * 100) : "—"}</small></div>`).join("")}</div>`;
}
function risk(value) {
  return value == null
    ? '<span class="badge">No capacity</span>'
    : `<span class="badge ${value >= 95 ? "critical" : value >= 85 ? "warning" : "good"}">${value >= 95 ? "Critical" : value >= 85 ? "Warning" : "Within threshold"}</span>`;
}
function groupTable(data, dimension = "provider", extended = false) {
  const sorted = extended
    ? [...data].sort(
        (a, b) => (b.peakCpuUtilization ?? -1) - (a.peakCpuUtilization ?? -1),
      )
    : data;
  return `<div class="table-wrap"><table><caption class="sr-only">${dimension} cost and capacity</caption><thead><tr><th>${dimension === "provider" ? "Provider" : dimension === "tier" ? "Customer tier" : "Region"}</th>${extended ? "<th>Capacity risk</th><th>Peak cohort CPU</th><th>Weighted CPU</th><th>Weighted memory</th>" : ""}<th>Spend</th><th>Cost / million tx</th><th>Margin after infrastructure</th></tr></thead><tbody>${sorted.map((g) => `<tr><th><button class="drill" data-drill="${dimension}" data-value="${esc(g.key)}">${esc(dimension === "provider" ? providerName(g.key) : g.key)}</button></th>${extended ? `<td>${risk(g.peakCpuUtilization)}</td><td>${pct(g.peakCpuUtilization)}</td><td>${pct(g.cpuUtilization)}</td><td>${pct(g.memoryUtilization)}</td>` : ""}<td>${money(g.totalCost)}</td><td>${money(g.costPerTransaction == null ? null : g.costPerTransaction * 1e6, 2)}</td><td>${pct(g.margin)}</td></tr>`).join("") || `<tr><td colspan="${extended ? 8 : 4}">No facts match this selection.</td></tr>`}</tbody></table></div>`;
}
function exceptionDescription(x) {
  if (x.kind === "recent-burn")
    return `${x.zeroBudgetBreached ? "Zero error allowance exceeded" : num(x.burnRate, 2) + "× burn"} in last ${num(x.windowHours)}h observed interval · ${pct(x.successRate, 3)} success vs ${pct(x.slaTarget, 3)} target. Selected period: ${x.periodSlaMet === true ? "target met" : x.periodSlaMet === false ? "below target" : "unavailable"}.`;
  return x.tab === "economics"
    ? `${pct(x.successRate, 3)} success vs ${pct(x.slaTarget, 3)} target · ${num(x.excessErrors)} excess error requests`
    : `${pct(x.peak)} peak ${esc(x.resource)} · ${num(x.intervals)} intervals ≥85% · peak ${esc(x.timestamp)} (${num(x.peakHours, 1)}h interval)`;
}
function exceptionStrip(c) {
  const capacity = c.capacityExceptions,
    service = c.serviceExceptions;
  const totals = [
    ["capacity", "capacity", capacity.length, "capacity cohorts"],
    ["economics", "service", service.length, "period SLO cohorts"],
    ["economics", "recent-burn", c.burn.signals.length, "recent burn cohorts"],
  ]
    .map(
      ([tab, kind, count, label]) =>
        `<button type="button" data-view-exceptions="${kind}" data-target-tab="${tab}" ${count ? "" : "disabled"}>View all ${num(count)} ${label}</button>`,
    )
    .join("");
  activeExceptions = [
    ...capacity.slice(0, 1),
    ...(c.burn.signals.length
      ? c.burn.signals.slice(0, 1)
      : service.slice(0, 1)),
  ];
  if (!activeExceptions.length)
    return '<div class="exception-strip calm"><strong>No threshold exceptions in observed scope.</strong><span>Missing or incomplete observations cannot establish service health.</span></div>';
  return `<section class="exception-strip" aria-label="Exceptions requiring investigation"><div class="exception-title"><h2>Investigate first</h2><span>Observed cohort exceptions · ${source.id === "demo" ? "historical demo" : "selected source"} · Showing up to two headline alerts</span></div><div class="exception-totals">${totals}</div><div class="exception-items">${activeExceptions.map((x, i) => `<article><div class="exception-evidence"><div class="exception-identity"><span class="badge ${x.severity === "critical" ? "critical" : "warning"}">${x.kind === "recent-burn" ? "Recent SLO burn" : x.tab === "economics" ? "Period SLO breach" : x.peak >= 95 ? "Critical" : "Warning"}</span><strong>${esc(providerName(x.scope.provider))} · ${esc(x.scope.region)} · ${esc(x.scope.tier)}</strong></div><p>${exceptionDescription(x)} · ${esc(x.scope.environment)}</p></div><button type="button" data-inspect="${i}">Inspect ${x.tab === "economics" ? "service level" : "capacity"}</button></article>`).join("")}</div></section>`;
}

function investigationPanel(c) {
  if (!investigation || investigation.sourceKey !== registryKey()) return "";
  const x = investigation.exception,
    r = intervalEvidence(c.rows, x);
  const evidence = r ? summarizeInfra([r]) : null;
  return `<section id="investigation" class="panel investigation" tabindex="-1" aria-label="Investigation context"><div class="panel-heading"><div><h2>Investigating ${esc(providerName(x.scope.provider))} · ${esc(x.scope.region)}</h2><p>${esc(x.scope.environment)} · ${esc(x.scope.tier)} · ${esc(x.timestamp)} UTC</p></div>${button("Return to previous analysis", "return-analysis")}</div><details><summary>Inspect exact observed interval</summary>${r ? `<p>${num(r.hours, 1)}h interval · ${r.prorated ? "Prorated estimate from a larger source interval; not hourly evidence." : r.hours === 1 ? "Observed hourly allocation." : "Observed daily allocation average; intra-day peaks unavailable."}</p><div class="table-wrap"><table><caption>Selected interval evidence</caption><thead><tr><th>CPU</th><th>Memory</th><th>Storage</th><th>Requests</th><th>Errors</th><th>Success</th><th>Latency</th></tr></thead><tbody><tr><td>${pct(evidence.cpuUtilization, 3)}</td><td>${pct(evidence.memoryUtilization, 3)}</td><td>${pct(evidence.storageUtilization, 3)}</td><td>${num(r.transactions, 2)}</td><td>${num(r.errors, 2)}</td><td>${pct(evidence.successRate, 3)}</td><td>${num(evidence.avgLatencyMs, 2)} ms</td></tr></tbody></table></div>` : "<p>Exact interval evidence is unavailable in this scope. No finer resolution is inferred.</p>"}<p class="footnote">The global period is preserved. Daily trend averages can differ from this individual interval. Source changes end this investigation.</p></details></section>`;
}

function financialDrivers(c) {
  const b = spendBridge(c.rows, c.previousRows);
  return panel(
    "What changed in spend",
    "Exact arithmetic bridge · volume first, then unit cost; not causal attribution",
    `<div class="bridge"><div><span>Prior spend</span><strong>${money(b.previous.totalCost, 2)}</strong></div><div><span>Transaction volume effect</span><strong>${b.comparable ? money(b.volumeEffect, 2) : "Unavailable"}</strong></div><div><span>Unit cost & mix effect</span><strong>${b.comparable ? money(b.unitCostEffect, 2) : "Unavailable"}</strong></div>${!b.comparable ? `<div><span>Unallocated change</span><strong>${money(b.unallocatedChange, 2)}</strong></div>` : ""}<div><span>Current spend</span><strong>${money(b.current.totalCost, 2)}</strong></div></div><p class="footnote">Net change ${money(b.totalChange, 2)}. ${b.comparable ? "Volume effect uses prior cost per transaction; the remaining effect includes rates, efficiency and workload mix." : "A nonzero transaction baseline is required to separate volume and unit-cost effects."} Periods use the selected scope; differences in coverage can affect comparison.</p><div class="table-wrap"><table><caption class="sr-only">Provider contributions to spend change</caption><thead><tr><th>Provider</th><th>Prior spend</th><th>Current spend</th><th>Change</th></tr></thead><tbody>${b.providerChanges.map((g) => `<tr><th><button class="drill" data-drill="provider" data-value="${esc(g.key)}">${esc(providerName(g.key))}</button></th><td>${money(g.previous, 2)}</td><td>${money(g.current, 2)}</td><td>${money(g.change, 2)}</td></tr>`).join("")}</tbody><tfoot><tr><th>Reconciled total</th><td>${money(b.previous.totalCost, 2)}</td><td>${money(b.current.totalCost, 2)}</td><td>${money(b.totalChange, 2)}</td></tr></tfoot></table></div>`,
  );
}
function insights(c) {
  return (
    infraInsights(c.rows, c.previousRows)
      .filter(
        (i) => !["Scoped economics", "Spend comparison"].includes(i.title),
      )
      .map(
        (i) =>
          `<article class="insight"><span class="insight-line"></span><div><h3>${esc(i.title)}</h3><p>${esc(i.body)}</p></div></article>`,
      )
      .join("") ||
    "<p>No observations support an insight for this selection.</p>"
  );
}
function audienceMetrics(c) {
  const s = c.summary,
    p = c.previous;
  return {
    executive: () =>
      metricCards([
        ["Revenue", money(s.revenue), delta(s.revenue, p.revenue)],
        [
          "Infrastructure spend",
          money(s.totalCost),
          delta(s.totalCost, p.totalCost),
        ],
        [
          "Margin after infrastructure",
          pct(s.margin),
          `${money(s.contribution)} = revenue − infrastructure; excludes other business costs`,
        ],
        [
          "Cost / million transactions",
          money(
            s.costPerTransaction == null ? null : s.costPerTransaction * 1e6,
            2,
          ),
          `${num(s.transactions)} transactions · ${money(s.costPerTransaction, 6)} each`,
        ],
      ]),
    capacity: () =>
      metricCards([
        ["Weighted CPU", pct(s.cpuUtilization), "Warning ≥85% · critical ≥95%"],
        [
          "Weighted memory",
          pct(s.memoryUtilization),
          "Used / allocated GB-hours",
        ],
        [
          "Weighted storage",
          pct(s.storageUtilization),
          "Used / allocated GB-hours",
        ],
        ["CPU headroom", pct(s.headroom), "Available CPU capacity-hours"],
      ]),
    economics: () =>
      metricCards([
        [
          "Cost / million transactions",
          money(
            s.costPerTransaction == null ? null : s.costPerTransaction * 1e6,
            2,
          ),
          "All four infrastructure cost components",
        ],
        [
          "Margin after infrastructure",
          pct(s.margin),
          `${money(s.contribution)} revenue less infrastructure; not full business profit`,
        ],
        [
          "Commitment utilization",
          pct(s.commitmentUtilization),
          "Covered eligible spend / allocated prepaid budget",
        ],
        [
          "Commitment coverage",
          pct(s.commitmentCoverage),
          "Covered spend / compute spend",
        ],
      ]),
  }[state.tab]();
}
function executive(c) {
  const s = c.summary;
  return (
    financialDrivers(c) +
    `<div class="two-col">${panel("Revenue trend", "USD per observed interval · independent scale", lineChart(c.series, [{ key: "revenue", label: "Revenue", color: colors[0] }]))}${panel("Infrastructure spend trend", "USD per observed interval · independent scale", lineChart(c.series, [{ key: "totalCost", label: "Infrastructure spend", color: "#69748c" }]))}</div><div class="two-col">${panel("Where spend goes", "Fully allocated across providers and customer tiers", costStack(s))}${panel("Provider unit economics", "Select a provider to filter every view", groupTable(groupInfra(c.rows, "provider"), "provider"))}</div>${panel("Operational signals", "Weighted metrics across the current selection", `<div class="signal"><span>Weighted CPU utilization</span><strong>${pct(s.cpuUtilization)}</strong></div><div class="signal"><span>Peak allocated cohort CPU ${risk(s.peakCpuUtilization)}</span><strong>${pct(s.peakCpuUtilization)}</strong></div><div class="signal"><span>Successful requests / weighted SLO target</span><strong>${pct(s.successRate, 3)} / ${pct(s.slaTarget, 3)}</strong></div><div class="signal"><span>Error requests</span><strong>${num(s.errors)}</strong></div><div class="signal"><span>Average response latency</span><strong>${num(s.avgLatencyMs, 1)} ms</strong></div>`)}${panel("Evidence notes", "Calculated observations, not causal AI claims", insights(c))}`
  );
}
function scenarioView(c) {
  const m = capacityModel(c.summary, scenario);
  return `<form id="scenario-form" class="scenario-controls">${[
    ["demandGrowth", "Demand growth", -90, 300],
    ["capacityChange", "Capacity change", -90, 300],
    ["efficiencyGain", "Efficiency gain", 0, 80],
  ]
    .map(
      ([k, label, min, max]) =>
        `<label>${label}<div class="input-unit"><input name="${k}" type="number" min="${min}" max="${max}" value="${scenario[k]}" required><span>%</span></div></label>`,
    )
    .join(
      "",
    )}<button class="primary" type="submit">Apply scenario</button></form><div class="scenario-results"><div><span>Baseline CPU</span><strong>${pct(c.summary.cpuUtilization)}</strong></div><div><span>Projected CPU</span><strong>${pct(m.projectedCpuUtilization)}</strong></div><div><span>Projected memory</span><strong>${pct(m.projectedMemoryUtilization)}</strong></div><div><span>Projected storage</span><strong>${pct(m.projectedStorageUtilization)}</strong></div><div><span>Memory headroom</span><strong>${pct(m.projectedMemoryHeadroom)}</strong></div><div><span>Extra capacity to all planning targets</span><strong>${pct(m.requiredCapacityPercent)}</strong></div><div><span>Binding resource</span><strong>${esc(m.bindingResource || "Unavailable")}</strong></div></div><p class="footnote"><strong>Scenario status: ${esc(m.status)}</strong>. CPU target 75%; memory and storage targets 85%. All resources scale with demand and efficiency; capacity scales independently. ${m.missingResources?.length ? "Missing baseline: " + esc(m.missingResources.join(", ")) + ". " : ""}Pooled capacity scenario; placement, hardware lead times and failover are not modeled.</p>`;
}
function capacity(c) {
  const s = c.summary;
  const forecast = forecastContext(rows, state.filters, c.window, 14);
  const projected = (forecast.points || []).map((p) => ({
    date: p.date,
    forecast: p.value,
    lower: p.lower,
    upper: p.upper,
  }));
  const anomaly = infraAnomalies(c.series, "totalCost");
  return (
    operationalExceptions(c, "capacity") +
    panel(
      "Utilization over time",
      "Weighted by allocated capacity-hours; planning target 75% CPU",
      `<p class="footnote">Peak allocated cohort CPU: ${pct(s.peakCpuUtilization)} ${risk(s.peakCpuUtilization)} · ${num(s.saturatedIntervals)} cohort intervals ≥85%. Cohort allocation, not a per-host measurement.</p>` +
        lineChart(
          c.series,
          [
            { key: "cpuUtilization", label: "CPU", color: colors[0] },
            {
              key: "memoryUtilization",
              label: "Memory",
              color: "#6b7280",
              pattern: "dash",
            },
            {
              key: "storageUtilization",
              label: "Storage",
              color: "#4d555f",
              pattern: "dot",
            },
          ],
          { percent: true },
        ),
    ) +
    `<div class="two-col">${panel("Provider → region capacity", "Select a provider, then a region. CPU thresholds: 85% / 95%.", groupTable(groupInfra(c.rows, state.filters.providers.length === 1 ? "region" : "provider"), state.filters.providers.length === 1 ? "region" : "provider", true))}${panel("Capacity planning scenario", "All controls use the globally filtered baseline", scenarioView(c))}</div>` +
    panel(
      "Transaction demand forecast",
      state.filters.range === "24h"
        ? "Daily model context: prior 14 days and next 14 days; KPIs retain the selected hourly window"
        : "Statistical forecast · next 14 daily intervals",
      `<p class="footnote forecast-caveat">Illustrative bands are not calibrated; external demand changes are not modeled. ${esc(forecast.reason || "")}</p>` +
      lineChart(
        state.filters.range === "24h" ? forecast.series.slice(-14) : c.series,
        [
          {
            key: "transactions",
            label: "Observed transactions",
            color: colors[0],
          },
          {
            key: "forecast",
            label: "Forecast",
            color: "#69748c",
            dashed: true,
          },
        ],
        { forecast: projected, hourly: false },
      ) +
        `<div class="table-wrap"><table><caption>Frozen 14-day holdout · same dates for every method</caption><thead><tr><th>Method</th><th>MAE · transactions</th><th>MAPE</th></tr></thead><tbody>${[
          ["Statistical model", "mae", "mape"],
          ["Last training value", "naiveMae", "naiveMape"],
          [
            "Last training week repeated",
            "seasonalNaiveMae",
            "seasonalNaiveMape",
          ],
        ]
          .map(
            ([label, mae, mape]) =>
              `<tr><th>${label}</th><td>${num(forecast.evaluation?.[mae], 2)}</td><td>${pct(forecast.evaluation?.[mape])}</td></tr>`,
          )
          .join(
            "",
          )}</tbody></table></div><details><summary>Forecast training and validation</summary><p>${esc(forecast.method || "Unavailable")} · Training: ${esc(forecast.trainingStart || "unavailable")} → ${esc(forecast.trainingEnd || "unavailable")} (exclusive), ${num(forecast.trainingDays)} full daily observations from the same cohorts, independent of display range.</p><p>Evaluation: ${esc(forecast.evaluation?.start || "unavailable")} → ${esc(forecast.evaluation?.end || "unavailable")} (exclusive). Evaluation fit: ${esc(forecast.evaluation?.fitStart || "unavailable")} → ${esc(forecast.evaluation?.fitEnd || "unavailable")} (exclusive). Both baselines are frozen before holdout; the seasonal baseline repeats the last seven training days. MAPE excludes zero actuals; MAE includes them. Model skill vs weekly baseline: ${forecast.evaluation?.seasonalSkill == null ? "unavailable (including zero baseline error)" : pct(100 * forecast.evaluation.seasonalSkill)}; positive means lower MAE.</p></details><p class="footnote">${num(anomaly.length)} cost anomaly signals in displayed history.</p>`,
    )
  );
}
function inspectButton(x, label = "Inspect") {
  const i = activeExceptions.push(x) - 1;
  return `<button type="button" data-inspect="${i}">${label}</button>`;
}
function recentBurnPanel(c) {
  return (
    `<div id="recent-burn-exceptions" tabindex="-1">` +
    panel(
      "Recent SLO burn",
      "Early warning at observed source resolution; separate from selected-period compliance",
      `<div class="table-wrap"><table><thead><tr><th>Cohort</th><th>Observed recent interval UTC</th><th>Burn / error allowance</th><th>Selected-period compliance</th><th>Period allowance consumed by recent errors</th><th>Action</th></tr></thead><tbody>${c.burn.signals.map((x) => `<tr><th>${esc(providerName(x.scope.provider))}<small>${esc(x.scope.region)} · ${esc(x.scope.environment)} · ${esc(x.scope.tier)}</small></th><td>${esc(x.start)}<small>to ${esc(x.end)} (exclusive), ${num(x.windowHours)}h</small></td><td><span class="badge ${x.severity}">${x.zeroBudgetBreached ? "Zero allowance exceeded" : num(x.burnRate, 2) + "× burn"}</span><small>${num(x.errors)} errors / ${num(x.allowedErrors, 2)} allowed</small></td><td>${x.periodSlaMet === true ? "Target met" : x.periodSlaMet === false ? "Below target" : "Unavailable"}<small>${pct(x.periodSuccessRate, 3)} success / ${pct(x.periodSlaTarget, 3)} target</small></td><td>${pct(x.periodBudgetConsumedByRecentPercent)}</td><td>${inspectButton(x)}</td></tr>`).join("") || '<tr><td colspan="6">No recent burn warnings among complete observed intervals.</td></tr>'}</tbody></table></div><p class="footnote">${num(c.burn.checkedCohorts - c.burn.unavailableCohorts)} cohorts have a complete recent interval; ${num(c.burn.unavailableCohorts)} unavailable. Warning ≥2× allowance, critical ≥10×; zero allowance plus errors is critical. Hourly facts use the last observed hour; daily facts use the last observed day. Gaps and prorated intervals cannot become hourly evidence. This is an investigation signal, not a calibrated paging policy.</p>`,
    ) +
    "</div>"
  );
}
function operationalExceptions(c, mode) {
  const list = mode === "capacity" ? c.capacityExceptions : c.serviceExceptions;
  const rowsHTML = list
    .map(
      (x) =>
        `<tr><th>${esc(providerName(x.scope.provider))}<small>${esc(x.scope.region)} · ${esc(x.scope.environment)} · ${esc(x.scope.tier)}</small></th>${mode === "capacity" ? `<td>${pct(x.peak)} ${esc(x.resource)}</td><td>${num(x.intervals)} intervals / ${num(x.hours, 1)} allocated cohort-hours</td><td>${esc(x.timestamp)}<small>${num(x.peakHours, 1)}h peak interval</small></td>` : `<td>${pct(x.successRate, 3)} / ${pct(x.slaTarget, 3)}</td><td>${num(x.excessErrors, 2)}<small>${num(x.allowedErrors, 2)} errors allowed</small></td><td>${x.burnRate == null ? "Zero error allowance" : num(x.burnRate, 2) + "× burn"}<small>${pct(x.errorBudgetRemainingPercent)} budget remaining · ${num(x.breachIntervals)} breached intervals</small></td>`}<td>${inspectButton(x)}</td></tr>`,
    )
    .join("");
  return (
    `<div id="${mode === "capacity" ? "capacity" : "service"}-exceptions" tabindex="-1">` +
    panel(
      mode === "capacity"
        ? "Capacity exceptions by cohort"
        : "Service-level exceptions & error budgets",
      mode === "capacity"
        ? "Observed allocated intervals ≥85% for any resource · no inferred host incident duration"
        : "Exact provider / region / environment / tier; period error budget = requests × (1 − target)",
      `<div class="table-wrap"><table><thead><tr><th>Affected cohort</th>${mode === "capacity" ? "<th>Peak resource</th><th>Observed saturation</th><th>Peak observation UTC</th>" : "<th>Success / target</th><th>Excess errors</th><th>Error budget</th>"}<th>Action</th></tr></thead><tbody>${rowsHTML || '<tr><td colspan="5">No period-level exceptions in this selection. Shorter windows can reveal interval breaches hidden by a period average.</td></tr>'}</tbody></table></div>${mode === "economics" ? '<p class="footnote">Burn compares observed errors with this period’s weighted allowance. Negative remaining budget means overspend. These service targets do not establish vendor fault or contractual credits. Use Last 24 hours to inspect recent interval changes.</p>' : ""}`,
    ) +
    "</div>"
  );
}
function registryKey() {
  return contractRegistryKey(source);
}
function currentContracts() {
  try {
    const raw = storage?.getItem(registryKey());
    if (raw != null) return validateContracts(JSON.parse(raw));
  } catch {}
  return source.id === "demo" ? demoContracts : [];
}
function storeContracts(items) {
  const records = validateContracts(items);
  try {
    if (!storage) throw Error();
    storage.setItem(registryKey(), JSON.stringify(records));
  } catch {
    throw Error(
      "Contract metadata could not be saved locally. Enable browser storage or export your records first.",
    );
  }
  return records;
}
function contractRegistry(c) {
  const records = currentContracts(),
    selected = records.filter(
      (r) =>
        !state.filters.providers.length ||
        state.filters.providers.includes(r.provider),
    );
  const asOf =
    source.id === "demo"
      ? c.window.end.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const queue = renewalQueue(selected, asOf, renewalsReviewOnly);
  const reviewCount = renewalQueue(selected, asOf, true).length;
  const editing = records.find((r) => r.id === contractEditId);
  return panel(
    "Vendor renewal workspace",
    `Provider-level metadata · as of ${asOf} UTC · ${source.id === "demo" ? "synthetic examples" : "local registry"}; region/tier filters do not imply contract entitlement`,
    `<div class="form-row"><label><input type="checkbox" id="renewals-review" ${renewalsReviewOnly ? "checked" : ""}>Needs review (${reviewCount}) · notice due within 30 days or passed</label>${button("Import contract JSON", "contract-import")}${button("Export contract JSON", "contract-export")}</div><div class="table-wrap"><table class="renewal-table"><thead><tr><th>Contract / provider</th><th>Owner</th><th>Renewal / notice</th><th>Status</th><th>Term / notes</th><th>Action</th></tr></thead><tbody>${
      queue
        .map((x) => {
          const r = x.record;
          return `<tr><th>${esc(r.id)}<small>${esc(providerName(r.provider))} · ${r.illustrative ? "Illustrative" : "User supplied"}</small></th><td>${esc(r.owner)}</td><td>${esc(r.renewalDate)}<small>Notice by ${esc(x.noticeDate)}</small></td><td><span class="badge ${x.needsReview ? "warning" : "good"}">${esc(x.noticeLabel)}</span><small>${esc(x.status)} · ${num(x.daysUntilRenewal)} days to renewal</small></td><td>${esc(r.term)}<small>${esc(r.notes || "")}</small></td><td><button type="button" data-contract-edit="${esc(r.id)}" aria-label="Edit contract ${esc(r.id)}">Edit contract</button></td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="6">No contracts match this provider scope and review filter. Add or import records, or turn off Needs review.</td></tr>'
    }</tbody></table></div><details class="contract-editor" ${editing ? "open" : ""}><summary>${editing ? "Edit " + esc(editing.id) : "Add contract metadata"}</summary><form id="contract-form" class="form-grid"><label>Contract ID<input name="id" required maxlength="80" value="${esc(editing?.id || "")}" ${editing ? "readonly" : ""}></label><label>Provider<select name="provider">${PROVIDERS.map((p) => `<option value="${p.id}" ${p.id === editing?.provider ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select></label><label>Owner / responsible role<input name="owner" required maxlength="120" value="${esc(editing?.owner || "")}"></label><label>Renewal date<input name="renewalDate" type="date" required value="${esc(editing?.renewalDate || "")}"></label><label>Notice days<input name="noticeDays" type="number" min="0" max="365" step="1" value="${editing?.noticeDays ?? 30}" required></label><label>Term / agreement reference<input name="term" required maxlength="240" value="${esc(editing?.term || "")}"></label><label>Notes<textarea name="notes" maxlength="1000">${esc(editing?.notes || "")}</textarea></label><label><input name="illustrative" type="checkbox" ${source.id === "demo" || editing?.illustrative ? "checked" : ""} ${source.id === "demo" ? "disabled" : ""}> Illustrative metadata</label><button type="submit" class="primary">${editing ? "Save contract changes" : "Add contract"}</button>${editing ? button("Cancel edit", "contract-cancel") : ""}</form><p class="footnote">Stored only in this browser for the current source. Export metadata for backup; share/embed links exclude it. Contract records do not change billing calculations, observed service targets or legal credits.</p></details>`,
  );
}
function economics(c) {
  const providers = groupInfra(c.rows, "provider");
  return (
    recentBurnPanel(c) +
    operationalExceptions(c, "economics") +
    contractRegistry(c) +
    `<div class="two-col">${panel("Provider economics", "Select a provider to cross-filter", groupTable(providers))}${panel("Customer tier economics", "Allocated costs and resources; select to filter", groupTable(groupInfra(c.rows, "tier"), "tier"))}</div>` +
    panel(
      "Cost & commitment audit",
      "USD · demo commitments are illustrative allocations, not vendor quotes or contracts",
      `<div class="table-wrap"><table><thead><tr><th>Provider</th><th>Compute</th><th>Storage</th><th>Network</th><th>Support</th><th>Prepaid budget</th><th>Covered eligible spend</th><th>Utilization</th><th>Coverage</th></tr></thead><tbody>${providers.map((p) => `<tr><th>${esc(providerName(p.key))}</th>${["computeCost", "storageCost", "networkCost", "supportCost", "committedCost", "coveredCost"].map((k) => `<td>${money(p[k])}</td>`).join("")}<td>${pct(p.commitmentUtilization)}</td><td>${pct(p.commitmentCoverage)}</td></tr>`).join("")}</tbody></table></div>`,
    ) +
    panel(
      "Provider service level audit",
      "Request-weighted targets from selected facts. Credits and contract terms are not inferred.",
      `<div class="table-wrap"><table><thead><tr><th>Provider</th><th>Transactions</th><th>Error requests</th><th>Success rate</th><th>Weighted target</th><th>Observed result</th></tr></thead><tbody>${providers.map((p) => `<tr><th>${esc(providerName(p.key))}</th><td>${num(p.transactions)}</td><td>${num(p.errors)}</td><td>${pct(p.successRate, 3)}</td><td>${pct(p.slaTarget, 3)}</td><td><span class="badge ${p.slaMet == null ? "" : p.slaMet ? "good" : "warning"}">${p.slaMet == null ? "Unavailable" : p.slaMet ? "Target met" : "Below target"}</span></td></tr>`).join("")}</tbody></table></div>`,
    )
  );
}
function render() {
  $("#main").setAttribute("aria-busy", "false");
  $("#audience-select").value = state.tab;
  if (!rows.length) return;
  const c = filtered();
  resetCharts();
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.tab === state.tab);
    b.tabIndex = b.dataset.tab === state.tab ? 0 : -1;
  });
  $("#main").setAttribute("aria-labelledby", `tab-${state.tab}`);
  $("#source-label").textContent =
    `${source.id === "demo" ? "Historical demo" : source.label} · ${source.id === "demo" ? "synthetic" : "snapshot"}`;
  const chips = Object.entries(state.filters)
    .filter(([k, v]) => Array.isArray(v) && v.length)
    .map(
      ([k, v]) =>
        `<button class="chip" data-clear="${k}">${esc(k)}: ${esc(v.join(", "))} ×</button>`,
    )
    .join("");
  const dates = c.window?.start
    ? `${c.window.start.replace("T", " ").replace(":00Z", " UTC")} → ${c.window.end.replace("T", " ").replace(":00Z", " UTC")} (end exclusive)`
    : "No source window";
  const coverage = (rs) => {
    const intervals = [
      ...new Map(
        rs.map((r) => [
          r.timestamp + ":" + r.hours,
          [
            Date.parse(r.timestamp),
            Date.parse(r.timestamp) + r.hours * 3600000,
          ],
        ]),
      ).values(),
    ].sort((a, b) => a[0] - b[0]);
    let total = 0,
      left = null,
      right = null;
    for (const [a, b] of intervals) {
      if (left === null) {
        left = a;
        right = b;
      } else if (a <= right) {
        right = Math.max(right, b);
      } else {
        total += right - left;
        left = a;
        right = b;
      }
    }
    return (total + (left === null ? 0 : right - left)) / 3600000;
  };
  const currentCoverage = c.window.hours
      ? (coverage(c.rows) / c.window.hours) * 100
      : null,
    previousCoverage = c.window.hours
      ? (coverage(c.previousRows) / c.window.hours) * 100
      : null;
  const fmtDate = (v) =>
    new Date(v).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const briefDates = c.window.start
    ? `${fmtDate(c.window.start)} – ${fmtDate(Date.parse(c.window.end) - 1)} · UTC`
    : "No source window";
  const sourceStatus =
    source.id === "demo"
      ? "Historical demo · synthetic data"
      : source.id === "upload"
        ? "Local CSV · validated snapshot"
        : `Snapshot · pipeline ${source.pipelineStatus?.status || "unknown"}`;
  $("#main").innerHTML =
    `${investigationPanel(c)}<div class="page-heading"><div><h1>${labels[state.tab]}</h1><p>${esc(briefDates)} · ${esc(sourceStatus)}</p></div><details class="methodology"><summary>Scope & methodology</summary><div><p>${esc(dates)}</p><p>${num(c.rows.length)} selected intervals · ${num(c.previousRows.length)} prior intervals · time coverage ${pct(currentCoverage)} current / ${pct(previousCoverage)} prior.</p><p>${esc(c.window.label)} · Prior: ${esc(c.window.previousStart)} → ${esc(c.window.previousEnd)} (exclusive). Coverage measures observed time, not cohort completeness.</p><p>Capacity uses allocated cohort-hours, not per-host measurements. ${source.id === "demo" ? "Deterministic synthetic data: daily history, hourly final 24 hours; not live pricing or production telemetry." : "Partial source intervals are prorated by time; values inside them are estimates."}</p><p>Source fetched: ${esc(source.fetchedAt || "Not reported")} · Pipeline last success: ${esc(source.pipelineStatus?.lastSuccess || "Not reported")}.</p><p>Margin after infrastructure = (revenue − compute − storage − network − support) / revenue. Other business costs are excluded. USD throughout.</p></div></details></div>${chips ? `<div class="scope-line" aria-label="Active filters">${chips}</div>` : ""}${c.rows.length ? audienceMetrics(c) + exceptionStrip(c) : ""}${!c.rows.length ? `<div class="empty"><h2>No data in this scope</h2><p>No facts match the current filters. Try a broader period or remove a scope restriction.</p>${regionRecovery() || button("Reset filters", "reset")}</div>` : { executive, capacity, economics }[state.tab](c)}`;

  bindCharts($("#main"));
  labelTables($("#main"));
  syncSavedViews();
  save();
}
function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}
async function api(path, options = {}, credentials = { backend, token }) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(credentials.backend + path, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const data = await r.json();
    if (!r.ok)
      throw Error(
        typeof data.error === "string"
          ? data.error
          : data.error?.message || `Companion failed (${r.status})`,
      );
    return data;
  } catch (err) {
    if (err.name === "AbortError")
      throw Error(
        "Companion request timed out. Check its URL and connectivity, then retry.",
      );
    if (err instanceof TypeError)
      throw Error(
        "Could not reach the companion. Check its URL, running process and allowed origin, then retry.",
      );
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
function syncSavedViews() {
  const select = $("#saved-view-select");
  if (!select) return;
  const list = state.profiles[state.profile].bookmarks;
  select.innerHTML =
    `<option value="">${list.length ? "Saved views (" + list.length + ")" : "No saved views yet"}</option>` +
    list.map((b, i) => `<option value="${i}">${esc(b.name)}</option>`).join("");
  select.disabled = !list.length;
  select.title = `Local profile: ${state.profile}`;
}
function loadBookmark(index) {
  investigation = null;
  const b = state.profiles[state.profile].bookmarks[index];
  if (!b) throw Error("Saved view unavailable. Choose another view.");
  state.filters = validateFilters(b.filters);
  state.tab = b.tab;
  syncFilters();
  render();
  $("#utility").close();
  $("#main").focus();
  notice(`Loaded ${b.name} using the current data source.`);
}
function runnerPresentation() {
  const date = (v) =>
    !v
      ? "Not reported"
      : Number.isFinite(Date.parse(v))
        ? new Date(v).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC"
        : "Not reported";
  return `<p class="footnote">Scheduler mode: ${esc(operations.schedulerMode || "owner-operated")}. A schedule entry does not confirm the scheduler process is running. Refresh to check overdue work. Last run below is source-level, not attributed to an individual schedule.</p><div class="table-wrap"><table><thead><tr><th>Schedule / source</th><th>Status / interval</th><th>Last source run</th><th>Next scheduled attempt</th><th>Destination / retries</th><th>Action</th></tr></thead><tbody>${
    schedules
      .map((s, i) => {
        const x = scheduleSummary(s, logs, operations);
        return `<tr><th>${esc(s.id)}<small>${esc(s.sourceId)}</small></th><td><span class="badge ${x.status === "overdue" ? "warning" : ""}">${esc(x.status)}</span><small>Every ${num(s.everyMinutes)} minutes</small></td><td>${date(x.lastRun?.at)}<small>${esc(x.lastRun?.status || "No recorded run")} · ${esc(x.lastRun?.message || "")}</small></td><td>${s.enabled ? date(x.nextRunAt) : "Disabled"}</td><td>${esc(x.destination)}<small>${esc(x.retries)}</small></td><td><button type="button" data-action="edit-schedule-${i}" aria-label="Edit schedule ${esc(s.id)}">Edit</button></td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="6">No schedules saved. Create a disabled dry-run schedule first to review its settings.</td></tr>'
  }</tbody></table></div><h4>Recent source executions</h4><div class="table-wrap"><table><thead><tr><th>Time UTC</th><th>Source</th><th>Result</th><th>Details / recovery</th></tr></thead><tbody>${
    logs
      .slice(0, 30)
      .map(
        (l) =>
          `<tr><td>${date(l.at)}</td><td>${esc(l.sourceId)}</td><td><span class="badge ${l.status === "error" ? "warning" : "good"}">${esc(l.status)}</span></td><td>${esc(l.message)}${l.status === "error" ? "<small>Check companion source configuration and connectivity, then use Run dry run before enabling delivery.</small>" : ""}</td></tr>`,
      )
      .join("") || '<tr><td colspan="4">No executions reported.</td></tr>'
  }</tbody></table></div><details><summary>Raw execution records</summary><pre>${esc(JSON.stringify(logs, null, 2))}</pre></details>`;
}
function utility(section = utilitySection) {
  const wasOpen = $("#utility").open;
  const focused = $("#utility").contains(document.activeElement)
    ? {
        id: document.activeElement.id,
        name: document.activeElement.getAttribute("name"),
        action: document.activeElement.dataset.action,
      }
    : null;
  utilitySection = ["source", "views", "export", "automation"].includes(section)
    ? section
    : "source";
  const checks = infrastructureQuality(rows, {
    mode: source.id === "demo" ? "demo" : "live",
    fetchedAt: source.fetchedAt,
  });
  companionSourceId = reconcileCompanionSource(sources, companionSourceId);
  const bookmarks = state.profiles[state.profile].bookmarks;
  const url = shareInfraState(state, location.href);
  $("#utility-body").innerHTML =
    `<section class="utility-section"><h3>Source & source-wide health</h3><p>${esc(source.label)} · ${num(rows.length)} validated facts. Filters do not hide source quality issues.</p><div class="form-row">${button("Import infrastructure CSV", "import")}${button("Restore historical demo", "demo")}</div><p class="footnote">Up to 20 MB / 100,000 rows. Import requires the InfraFact v1 schema. Failed imports preserve your last good snapshot.</p>${checks.map((q) => `<div class="health-row"><div><strong>${esc(q.label)}</strong><p>${esc(q.message)}</p></div><span class="badge">${esc(q.status)}</span></div>`).join("")}<p class="footnote">Pipeline: ${esc(source.pipelineStatus?.status || "No connected pipeline")} · ${esc(source.pipelineStatus?.message || "Historical demo or local CSV.")}<br>Last success: ${esc(source.pipelineStatus?.lastSuccess || "Not reported")} · Browser fetched: ${esc(source.fetchedAt || "Not reported")}</p></section><section class="utility-section"><h3>Companion connection</h3><form id="connect-form" class="form-grid"><label>Companion URL<input name="backend" type="url" placeholder="http://127.0.0.1:8765" value="${esc(backend)}" required></label><label>Bearer token<input name="token" type="password" autocomplete="off" value="${esc(token)}" required></label><button class="primary" type="submit">Connect companion</button></form><p class="footnote">Token stays in this tab's memory. Warehouse credentials stay in your companion. Hosted HTTPS pages may require an HTTPS companion with this page's origin allowed.</p>${connected ? `<div class="form-row"><label>Configured source<select id="source-select">${sources.map((s) => `<option value="${esc(s.id)}" ${s.id === companionSourceId ? "selected" : ""}>${esc(s.label || s.id)} · ${esc(s.schema || s.type || "source")}</option>`).join("")}</select></label>${button("Load snapshot", "snapshot")}${button("Disconnect", "disconnect")}</div>` : ""}</section><section class="utility-section"><h3>Profiles & saved views</h3><form id="profile-form" class="form-row"><label>Current profile<select name="existing">${Object.keys(
      state.profiles,
    )
      .map(
        (n) =>
          `<option ${n === state.profile ? "selected" : ""}>${esc(n)}</option>`,
      )
      .join(
        "",
      )}</select></label><label>New profile name<input name="name" maxlength="60"></label><button type="submit">Switch / create</button></form><div class="saved-views">${bookmarks.map((b, i) => `<div>${button(esc(b.name), `load-bookmark-${i}`)}<button type="button" class="text-button" data-action="delete-bookmark-${i}" aria-label="Remove saved view ${esc(b.name)}">Remove</button></div>`).join("") || "<p>No saved views in this profile.</p>"}</div></section><section class="utility-section"><h3>Share, embed & export</h3><label>Validated view URL<textarea readonly rows="3">${esc(url)}</textarea></label><label>Embed code<textarea readonly rows="3">${esc(`<iframe src="${url}" title="Orbis infrastructure" width="100%" height="900" loading="lazy"></iframe>`)}</textarea></label><div class="form-row">${button("Copy view URL", "copy-share")}${button("Export filtered CSV", "csv")}${button("Download digest", "digest")}${button("Print analysis", "print")}</div><p class="footnote">Links contain filters and selected tab; local CSV contents and companion tokens are never included. CSV exports are analytical slices: a partially intersecting interval can contain prorated hours and request estimates. Reimport the original source rather than a prorated slice.</p></section><section class="utility-section"><h3>Runner schedules & execution logs</h3><p>Jobs run only while your companion scheduler is running. Dry runs write local artifacts. Saving merges a fresh server collection.</p>${connected ? `<div class="form-row">${button("Refresh schedules & logs", "runner-refresh")}${button(`Run dry run: ${esc(sources.find((s) => s.id === companionSourceId)?.label || companionSourceId)}`, "run")}</div><form id="schedule-form" class="form-grid"><label>Schedule ID<input name="id" required maxlength="80" value="infra-digest"></label><label>Source<select name="sourceId">${sources.map((s) => `<option value="${esc(s.id)}" ${s.id === companionSourceId ? "selected" : ""}>${esc(s.label || s.id)}</option>`).join("")}</select></label><label>Every minutes<input name="everyMinutes" type="number" min="5" max="525600" value="1440" required></label><label><input name="enabled" type="checkbox"> Enabled</label><label><input name="dryRun" type="checkbox" checked> Dry run</label><button type="submit">Save schedule</button></form>${runnerPresentation()}` : "<p>Connect your companion to inspect and manage real schedules and logs.</p>"}</section>`;
  const names = {
    source: "Sources & quality",
    views: "Profiles & saved views",
    export: "Export & share",
    automation: "Automation",
  };
  $("#utility-title").textContent = names[utilitySection];
  const sections = [...$("#utility-body").querySelectorAll(".utility-section")];
  sections.forEach(
    (node, i) =>
      (node.hidden =
        ["source", "source", "views", "export", "automation"][i] !==
        utilitySection),
  );
  $("#utility-body").insertAdjacentHTML(
    "afterbegin",
    `<nav class="workspace-nav" aria-label="Workspace tools">${Object.entries(
      names,
    )
      .map(
        ([id, label]) =>
          `<button type="button" aria-pressed="${id === utilitySection}" data-action="workspace-${id}">${label}</button>`,
      )
      .join(
        "",
      )}</nav><p id="utility-feedback" class="request-status" role="status" aria-live="polite"></p>`,
  );
  if (removedBookmark?.profile === state.profile && utilitySection === "views")
    $("#utility-body").insertAdjacentHTML(
      "beforeend",
      button("Restore removed view", "undo-bookmark"),
    );
  syncSavedViews();
  labelTables($("#utility-body"));
  syncPendingControls();
  if (!wasOpen) $("#utility").showModal();
  else {
    const candidates = [
      ...$("#utility-body").querySelectorAll("button,input,select,textarea"),
    ];
    const target =
      focused &&
      candidates.find(
        (node) =>
          !node.disabled &&
          (focused.id
            ? node.id === focused.id
            : focused.action
              ? node.dataset.action === focused.action
              : focused.name
                ? node.getAttribute("name") === focused.name
                : false),
      );
    (target || $("#utility-body .workspace-nav [aria-pressed=true]"))?.focus({
      preventScroll: true,
    });
  }
}
async function loadDemo() {
  const revision = ++sourceRevision;
  const next = await loadDemoSource();
  if (revision !== sourceRevision) return;
  demoContracts = next.contracts;
  investigation = null;
  rows = next.rows;
  source = {
    id: "demo",
    label: "Historical synthetic demo",
    fetchedAt: new Date().toISOString(),
  };
  render();
  if (next.warning) notice(next.warning);
  return next;
}

async function refreshRunner() {
  const revision = sourceRevision;
  const [s, l] = await Promise.all([api("/api/schedules"), api("/api/logs")]);
  if (!Array.isArray(s.schedules) || !Array.isArray(l.logs))
    throw Error("Invalid runner response.");
  if (revision !== sourceRevision || !connected) return false;
  schedules = s.schedules;
  logs = l.logs;
  return true;
}
function changeFilters(keepInvestigation = false) {
  if (!keepInvestigation) investigation = null;
  state.filters = validateFilters(state.filters);
  syncFilters();
  render();
}
async function action(name) {
  if (name === "repair-regions") {
    state.filters = clearIncompatibleRegions(state.filters);
    document
      .querySelectorAll(".filter-menu[open]")
      .forEach((d) => (d.open = false));
    changeFilters();
    $("#main").focus();
    return;
  }
  if (name === "return-analysis" && investigation) {
    const previous = investigation.previous;
    investigation = null;
    state.filters = previous.filters;
    state.tab = previous.tab;
    changeFilters();
    $("#main").focus();
    return;
  }
  if (name === "close") return $("#utility").close();
  if (name === "tools") return utility("source");
  if (name.startsWith("workspace-")) return utility(name.slice(10));
  if (name === "bookmark") {
    $("#save-view-error").textContent = "";
    $("#save-view").showModal();
    $("#save-view input").focus();
    return;
  }
  if (name === "close-save") return $("#save-view").close();
  if (name === "undo-bookmark" && removedBookmark) {
    const removed = removedBookmark;
    state = saveWorkspaceChange(state, storage, (next) => {
      const list = next.profiles[removed.profile]?.bookmarks;
      if (!list || list.length >= 30)
        throw Error("This profile cannot restore another view.");
      list.splice(removed.index, 0, removed.item);
    });
    removedBookmark = null;
    utility("views");
    return;
  }
  if (name === "reset") {
    state.filters = defaultFilters();
    changeFilters();
    $("#main").focus();
    return;
  }
  if (name === "contract-import") return $("#contract-file").click();
  if (name === "contract-export")
    return download(
      "orbis-contracts.json",
      contractsJSON(currentContracts()),
      "application/json",
    );
  if (name === "contract-cancel") {
    contractEditId = "";
    render();
    focusAfterUpdate(".contract-editor summary");
    return;
  }
  if (name === "import") return $("#csv-file").click();
  if (name === "demo") {
    const loaded = await loadDemo();
    if (!loaded) return;
    utility();
    notice(loaded.warning || "Historical demo restored.");
    return;
  }
  if (name === "csv") {
    if (!filtered().rows.length) {
      notice(
        "No selected intervals to export. Broaden or reset filters first.",
      );
      return;
    }
    download(
      "orbis-infrastructure.csv",
      infraCSV(filtered().rows),
      "text/csv",
    );
    notice(
      `${num(filtered().rows.length)} selected intervals exported as CSV.`,
    );
    return;
  }
  if (name === "print") return window.print();
  if (name === "copy-share") {
    try {
      if (!navigator.clipboard?.writeText) throw Error();
      await navigator.clipboard.writeText(
        shareInfraState(state, location.href),
      );
    } catch {
      throw Error(
        "Clipboard unavailable. Select and copy the validated view URL above.",
      );
    }
    notice("View URL copied.");
    return;
  }
  if (name === "digest") {
    const c = filtered(),
      s = c.summary;
    download(
      "orbis-infrastructure-digest.md",
      `# Infrastructure digest\n\n${c.window.start} to ${c.window.end} (exclusive)\n\nRevenue: ${money(s.revenue)}\nInfrastructure spend: ${money(s.totalCost)}\nContribution: ${money(s.contribution)}\nMargin after infrastructure: ${pct(s.margin)}\nCost / transaction: ${money(s.costPerTransaction, 6)}\nCPU: ${pct(s.cpuUtilization)}\nSLO success / target: ${pct(s.successRate, 3)} / ${pct(s.slaTarget, 3)}\n\n${infraInsights(
        c.rows,
        c.previousRows,
      )
        .map((i) => `${i.title}\n${i.body}`)
        .join("\n\n")}`,
    );
    notice("Infrastructure digest downloaded for the selected scope.");
    return;
  }
  if (name.startsWith("load-bookmark-"))
    return loadBookmark(Number(name.split("-").at(-1)));
  if (name.startsWith("delete-bookmark-")) {
    const index = Number(name.split("-").at(-1));
    const removed = {
      profile: state.profile,
      index,
      item: state.profiles[state.profile].bookmarks[index],
    };
    state = saveWorkspaceChange(state, storage, (next) =>
      next.profiles[next.profile].bookmarks.splice(index, 1),
    );
    removedBookmark = removed;
    utility();
    return;
  }
  if (name === "disconnect") {
    sourceRevision++;
    operations = {};
    token = "";
    connected = false;
    sources = [];
    schedules = [];
    logs = [];
    utility();
    notice("Disconnected. Any pending source response will be ignored.");
    return;
  }
  if (name === "snapshot") {
    const revision = ++sourceRevision;
    const id = companionSourceId,
      result = await api("/api/snapshot?source=" + encodeURIComponent(id));
    if (revision !== sourceRevision || !connected || id !== companionSourceId)
      return;
    if (result.schemaVersion !== "infrastructure-v1")
      throw Error("Choose a source configured with schema infrastructure-v1.");
    const v = validateInfraRows(result.rows);
    if (!v.valid || !v.rows.length)
      throw Error(
        "Snapshot failed infrastructure validation. Last good source retained. " +
          (v.errors[0]?.message || ""),
      );
    investigation = null;
    rows = v.rows;
    source = {
      id,
      label: sources.find((s) => s.id === id)?.label || id,
      fetchedAt: result.fetchedAt,
      pipelineStatus: result.pipelineStatus,
      connection: backend,
    };
    render();
    utility();
    notice(`${num(rows.length)} validated snapshot intervals loaded.`);
    return;
  }
  if (name === "runner-refresh") {
    if (!(await refreshRunner())) return;
    utility();
    notice("Schedules and source execution records refreshed.");
    return;
  }
  if (name === "run") {
    const id = companionSourceId;
    if (!id) throw Error("Choose a source first.");
    await api("/api/run", {
      method: "POST",
      body: JSON.stringify({ sourceId: id, dryRun: true }),
    });
    if (!(await refreshRunner())) return;
    utility();
    notice("Dry run completed. Review the source execution records.");
    return;
  }
  if (name.startsWith("edit-schedule-")) {
    const s = schedules[Number(name.split("-").at(-1))],
      f = $("#schedule-form");
    for (const k of ["id", "sourceId", "everyMinutes"])
      f.elements[k].value = s[k];
    for (const k of ["enabled", "dryRun"]) f.elements[k].checked = s[k];
    f.elements.id.focus();
  }
}
function bind() {
  document.addEventListener("click", (e) => {
    const actionNode = e.target.closest("[data-action]");
    if (actionNode) {
      const name = actionNode.dataset.action;
      const pendingLabels = {
        demo: "Loading demo…",
        snapshot: "Loading snapshot…",
        "runner-refresh": "Refreshing operations…",
        run: "Running dry run…",
      };
      if (pendingLabels[name]) {
        const finish = beginPending(actionNode, pendingLabels[name]);
        if (!finish) return;
        action(name)
          .catch((err) => notice(err.message))
          .finally(finish);
      } else action(name).catch((err) => notice(err.message));
    }
    if (e.target.closest("#scope-toggle")) {
      const toggle = $("#scope-toggle"),
        expanded = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(expanded));
      $("#global-header").classList.toggle("scope-expanded", expanded);
      document
        .querySelectorAll(".filter-menu[open]")
        .forEach((d) => (d.open = false));
    }
    const tab = e.target.closest("[data-tab]");
    if (tab) {
      state.tab = tab.dataset.tab;
      render();
    }
    const clear = e.target.closest("[data-clear]");
    if (clear) {
      clear.dataset.clear.split(",").forEach((k) => (state.filters[k] = []));
      changeFilters();
      ($("#main [data-clear]") || $("#main")).focus({ preventScroll: true });
    }
    const editContract = e.target.closest("[data-contract-edit]");
    if (editContract) {
      contractEditId = editContract.dataset.contractEdit;
      render();
      $("#contract-form input").focus();
    }
    const viewAll = e.target.closest("[data-view-exceptions]");
    if (viewAll) {
      state.tab = viewAll.dataset.targetTab;
      render();
      const target = document.getElementById(
        viewAll.dataset.viewExceptions + "-exceptions",
      );
      target?.focus();
    }
    const inspect = e.target.closest("[data-inspect]");
    if (inspect) {
      const x = activeExceptions[Number(inspect.dataset.inspect)];
      if (x) {
        investigation = captureInvestigation(
          state,
          x,
          registryKey(),
          investigation,
        );
        state.filters = exceptionFilters(state.filters, x);
        state.tab = x.tab;
        changeFilters(true);
        $("#investigation").focus();
      }
    }
    const drill = e.target.closest("[data-drill]");
    if (drill) {
      const key = { provider: "providers", region: "regions", tier: "tiers" }[
        drill.dataset.drill
      ];
      state.filters[key] = [drill.dataset.value];
      changeFilters();
      $("#main").focus();
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "audience-select") {
      state.tab = e.target.value;
      render();
    }
    if (e.target.id === "renewals-review") {
      renewalsReviewOnly = e.target.checked;
      render();
      focusAfterUpdate("#renewals-review");
    }
    if (e.target.id === "saved-view-select" && e.target.value !== "") {
      try {
        loadBookmark(Number(e.target.value));
      } catch (err) {
        notice(err.message);
      }
    }
    if (e.target.matches("[data-all]")) {
      e.target.dataset.all.split(",").forEach((k) => (state.filters[k] = []));
      changeFilters();
    }
    if (e.target.matches("[data-filter]")) {
      const key = e.target.dataset.filter;
      state.filters[key] = [
        ...document.querySelectorAll(`[data-filter="${key}"]:checked`),
      ].map((n) => n.value);
      changeFilters();
    }
    if (e.target.id === "source-select") {
      sourceRevision++;
      companionSourceId = e.target.value;
      utility();
    }
    if (e.target.id === "range") {
      state.filters.range = e.target.value;
      changeFilters();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.target.closest("dialog")) {
      const disclosure =
        document.querySelector(".filter-menu[open]") ||
        e.target.closest("details[open]");
      if (disclosure) {
        e.preventDefault();
        disclosure.open = false;
        disclosure.querySelector("summary").focus();
      }
    }
    if (
      e.target.matches("[data-tab]") &&
      ["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)
    ) {
      e.preventDefault();
      let i = TABS.indexOf(state.tab);
      i =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? 2
            : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
      state.tab = TABS[i];
      render();
      $(`#tab-${state.tab}`).focus();
    }
  });
  document.querySelectorAll(".filter-menu").forEach((d) =>
    d.addEventListener("toggle", () => {
      if (d.open) {
        document.querySelectorAll(".filter-menu").forEach((other) => {
          if (other !== d) other.open = false;
        });
        positionFilter(d);
      }
    }),
  );
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".filter-menu"))
      document
        .querySelectorAll(".filter-menu[open]")
        .forEach((d) => (d.open = false));
  });
  document.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!(f instanceof HTMLFormElement)) return;
    const label = {
      "connect-form": "Connecting companion…",
      "schedule-form": "Saving schedule…",
    }[f.id];
    const finish = label
      ? beginPending(f.querySelector('button[type="submit"]'), label)
      : null;
    if (label && !finish) return;
    f.querySelector(".form-error")?.remove();
    try {
      if (f.getAttribute("id") === "contract-form") {
        const record = Object.fromEntries(new FormData(f).entries());
        record.noticeDays = Number(record.noticeDays);
        record.illustrative =
          source.id === "demo" || f.elements.illustrative.checked;
        const list = currentContracts();
        if (!contractEditId && list.some((r) => r.id === record.id.trim()))
          throw Error(
            "This contract ID exists. Choose Edit contract to update it.",
          );
        storeContracts([
          ...list.filter((r) => r.id !== contractEditId),
          record,
        ]);
        contractEditId = "";
        render();
        focusAfterUpdate(".contract-editor summary");
        notice(
          "Contract metadata saved in this browser. Export a backup when needed.",
        );
      }
      if (f.getAttribute("id") === "scenario-form") {
        scenario = Object.fromEntries(new FormData(f).entries());
        Object.keys(scenario).forEach(
          (k) => (scenario[k] = Number(scenario[k])),
        );
        render();
        focusAfterUpdate("#scenario-form button[type=submit]");
        notice("Scenario applied to the current filtered baseline.");
      }
      if (f.getAttribute("id") === "profile-form") {
        const name = f.elements.name.value.trim() || f.elements.existing.value;
        if (!name || ["__proto__", "prototype", "constructor"].includes(name))
          throw Error("Choose another profile name.");
        if (!state.profiles[name] && Object.keys(state.profiles).length >= 30)
          throw Error("Maximum 30 local profiles.");
        state = saveWorkspaceChange(state, storage, (next) => {
          next.profiles[name] ||= { bookmarks: [] };
          next.profile = name;
        });
        investigation = null;
        utility();
      }
      if (f.getAttribute("id") === "bookmark-form") {
        if (!f.elements.name.value.trim())
          throw Error("Enter a saved view name.");
        const list = state.profiles[state.profile].bookmarks;
        if (list.length >= 30)
          throw Error("Maximum 30 saved views per profile.");
        list.push({
          name: f.elements.name.value.trim(),
          filters: structuredClone(state.filters),
          tab: state.tab,
        });
        if (!save()) {
          list.pop();
          throw Error(
            "View could not be saved. Enable browser storage and try again.",
          );
        }
        syncSavedViews();
        $("#save-view").close();
        notice("Current view saved in " + state.profile + ".");
      }
      if (f.getAttribute("id") === "connect-form") {
        const u = new URL(f.elements.backend.value);
        if (
          !["http:", "https:"].includes(u.protocol) ||
          u.username ||
          u.password ||
          u.search ||
          u.hash
        )
          throw Error(
            "Use an HTTP(S) URL without credentials, query or fragment.",
          );
        const candidate = {
          backend: u.href.replace(/\/$/, ""),
          token: f.elements.token.value.trim(),
        };
        const revision = ++sourceRevision;
        const result = await api("/api/sources", {}, candidate);
        if (!Array.isArray(result.sources))
          throw Error("Invalid source response.");
        const [scheduleResult, logResult] = await Promise.all([
          api("/api/schedules", {}, candidate),
          api("/api/logs", {}, candidate),
        ]);
        if (
          !Array.isArray(scheduleResult.schedules) ||
          !Array.isArray(logResult.logs)
        )
          throw Error("Invalid runner response.");
        if (revision !== sourceRevision) return;
        backend = candidate.backend;
        token = candidate.token;
        sources = result.sources;
        operations = result.operations || {};
        companionSourceId = sources[0]?.id || "";
        schedules = scheduleResult.schedules;
        logs = logResult.logs;
        connected = true;
        utility();
        notice(
          "Connected. Choose an infrastructure source and load its snapshot.",
        );
      }
      if (f.getAttribute("id") === "schedule-form") {
        const entry = {
          id: f.elements.id.value.trim(),
          sourceId: f.elements.sourceId.value,
          everyMinutes: Number(f.elements.everyMinutes.value),
          enabled: f.elements.enabled.checked,
          dryRun: f.elements.dryRun.checked,
        };
        if (
          !entry.id ||
          !Number.isInteger(entry.everyMinutes) ||
          entry.everyMinutes < 5 ||
          entry.everyMinutes > 525600
        )
          throw Error("Enter a schedule ID and interval of 5–525600 minutes.");
        const revision = sourceRevision;
        const result = await upsertSchedule(api, entry);
        if (revision !== sourceRevision || !connected) return;
        schedules = result.schedules || [];
        utility();
        notice("Schedule saved. Start the companion scheduler separately.");
      }
    } catch (err) {
      if (f.getAttribute("id") === "bookmark-form") {
        const message = $("#save-view-error");
        message.textContent = err.message;
        message.tabIndex = -1;
        message.focus();
      } else if (f.isConnected) {
        const message = document.createElement("p");
        message.className = "form-error";
        message.setAttribute("role", "alert");
        message.textContent = err.message;
        message.tabIndex = -1;
        f.append(message);
        message.focus();
      }
      notice(err.message);
    } finally {
      finish?.();
    }
  });
  $("#contract-file").addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > MAX_CONTRACT_BYTES)
        throw Error(
          "Contract JSON exceeds 512 KB. Existing registry retained.",
        );
      const next = parseContractsJSON(await file.text());
      storeContracts(next);
      contractEditId = "";
      render();
      notice(
        "Contract registry imported for this source. Billing facts are unchanged.",
      );
    } catch (err) {
      notice(err.message);
    } finally {
      e.target.value = "";
    }
  });
  $("#csv-file").addEventListener("change", async (e) => {
    if (!e.target.files[0]) return;
    const finish = beginPending(null, "Validating infrastructure CSV…");
    if (!finish) {
      e.target.value = "";
      return;
    }
    const revision = ++sourceRevision;
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024)
        throw Error("CSV exceeds the 20 MB limit. Last good source retained.");
      const next = parseInfraCSV(await file.text());
      if (revision !== sourceRevision) return;
      if (!next.length)
        throw Error("CSV has no facts. Last good source retained.");
      investigation = null;
      rows = next;
      source = {
        id: "upload",
        label: file.name,
        fetchedAt: new Date().toISOString(),
      };
      render();
      if ($("#utility").open) utility();
      notice("CSV validated and loaded.");
    } catch (err) {
      notice(err.message);
    } finally {
      finish();
      e.target.value = "";
    }
  });
}
mount();
loadDemo().catch((e) => {
  $("#main").setAttribute("aria-busy", "false");
  $("#main").innerHTML =
    `<div class="empty"><h1>Infrastructure data unavailable</h1><p>${esc(e.message)}</p>${button("Source & tools", "tools")}</div>`;
  notice(e.message);
});
