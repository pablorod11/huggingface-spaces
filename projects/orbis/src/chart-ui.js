const charts = new Map();
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const color = (value) => (/^#[0-9a-f]{3,8}$/i.test(value) ? value : "#284fc9");
const strokePattern = (metric) => {
  const pattern =
    metric.pattern === "dot"
      ? "1 5"
      : metric.pattern === "dash" || metric.dashed
        ? "6 5"
        : "";
  return pattern ? ` stroke-dasharray="${pattern}" stroke-linecap="round"` : "";
};
const unitLabel = (unit) =>
  unit === "usd" ? "USD" : unit === "percent" ? "%" : "count";
function format(value, unit) {
  if (!finite(value)) return "Unavailable";
  return (
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: unit === "usd" ? 2 : unit === "percent" ? 3 : 2,
      ...(unit === "usd" ? { style: "currency", currency: "USD" } : {}),
    }).format(value) + (unit === "percent" ? "%" : "")
  );
}
export function resetCharts() {
  charts.clear();
}

export function chartHTML(
  points,
  metrics,
  { percent = false, forecast = [], hourly = false, title = "Trend" } = {},
) {
  const all = [...points, ...forecast];
  if (!all.length)
    return '<p class="empty">No observations available for this chart.</p>';
  const id = `trend-${charts.size}`;
  const selected = Math.max(0, points.length - 1);
  const columns = metrics.map((m) => ({
    ...m,
    unit: m.unit || (percent ? "percent" : "count"),
  }));
  const bandUnit =
    columns.find((m) => m.key === "forecast")?.unit ||
    columns[0]?.unit ||
    "count";
  const description = (point) =>
    `${point.date} UTC · ${columns.map((m) => `${m.label}: ${format(point[m.key], m.unit)}`).join(" · ")}${forecast.includes(point) ? ` · 95% forecast interval: ${format(point.lower, bandUnit)} to ${format(point.upper, bandUnit)}` : ""}`;
  const left = 58,
    right = 460,
    top = 18,
    bottom = 212;
  const values = all
    .flatMap((p) => columns.map((m) => p[m.key]))
    .concat(forecast.flatMap((p) => [p.lower, p.upper]))
    .filter(finite);
  const minimum = Math.min(0, ...values),
    maximum = Math.max(percent ? 100 : 1, ...values);
  const max = percent ? maximum : maximum + (maximum - minimum) * 0.08;
  const x = (i) => left + (i * (right - left)) / Math.max(1, all.length - 1);
  const y = (v) => bottom - ((v - minimum) / (max - minimum)) * (bottom - top);
  const compact = (v) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const value = minimum + f * (max - minimum);
      return `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="gridline"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${compact(value)}${percent ? "%" : ""}</text>`;
    })
    .join("");
  const lines = columns
    .map((m) => {
      let open = false;
      const path = all
        .map((p, i) => {
          if (!finite(p[m.key])) {
            open = false;
            return "";
          }
          const segment = `${open ? "L" : "M"}${x(i)},${y(p[m.key])}`;
          open = true;
          return segment;
        })
        .join(" ");
      // A lone observation still needs a visible mark, including observed zero.
      const dots = all
        .map((p, i) =>
          finite(p[m.key]) &&
          !finite(all[i - 1]?.[m.key]) &&
          !finite(all[i + 1]?.[m.key])
            ? `<circle cx="${x(i)}" cy="${y(p[m.key])}" r="3" fill="${color(m.color)}"/>`
            : "",
        )
        .join("");
      return `<path data-series="${esc(m.key)}" d="${path}" fill="none" stroke="${color(m.color)}" stroke-width="2.5"${strokePattern(m)}/>${dots}`;
    })
    .join("");
  const segments = [];
  let segment = [];
  forecast.forEach((p, i) => {
    if (finite(p.lower) && finite(p.upper))
      segment.push({ ...p, index: points.length + i });
    else if (segment.length) {
      segments.push(segment);
      segment = [];
    }
  });
  if (segment.length) segments.push(segment);
  const band = segments
    .map(
      (part) =>
        `<path aria-label="95% forecast interval" d="${part.map((p, i) => `${i ? "L" : "M"}${x(p.index)},${y(p.upper)}`).join(" ")} ${[
          ...part,
        ]
          .reverse()
          .map((p) => `L${x(p.index)},${y(p.lower)}`)
          .join(" ")} Z" fill="#a17c56" opacity=".15"/>`,
    )
    .join("");
  const target = percent
    ? `<line x1="${left}" x2="${right}" y1="${y(75)}" y2="${y(75)}" stroke="#8e9b9e" stroke-dasharray="4 5"/><text x="${right}" y="${y(75) - 6}" text-anchor="end">75% CPU target</text>`
    : "";
  const dates = [
    ...new Set([0, Math.floor((all.length - 1) / 2), all.length - 1]),
  ]
    .map((i) => {
      const date = new Date(all[i].date);
      const label = Number.isFinite(date.getTime())
        ? date.toLocaleString("en-US", {
            timeZone: "UTC",
            month: "short",
            day: "numeric",
            ...(hourly ? { hour: "2-digit", minute: "2-digit" } : {}),
          })
        : "Unknown date";
      return `<text x="${x(i)}" y="240" text-anchor="${i === 0 ? "start" : i === all.length - 1 ? "end" : "middle"}">${esc(label)}</text>`;
    })
    .join("");
  const hits = all
    .map((_, i) => {
      const start = i ? (x(i - 1) + x(i)) / 2 : left;
      const end = i < all.length - 1 ? (x(i) + x(i + 1)) / 2 : right;
      return `<rect data-chart-point="${i}" x="${start}" y="${top}" width="${end - start}" height="${bottom - top}" fill="transparent"/>`;
    })
    .join("");
  const table = `<details><summary>View chart data (${all.length} points)</summary><div class="table-wrap" tabindex="0" role="region" aria-label="${esc(title)} chart data"><table><caption>${esc(title)} · UTC dates · USD 2 decimals; percent 3; counts up to 2</caption><thead><tr><th scope="col">Date (UTC)</th>${columns.map((m) => `<th scope="col">${esc(m.label)} (${unitLabel(m.unit)})</th>`).join("")}${forecast.length ? `<th scope="col">95% lower</th><th scope="col">95% upper</th>` : ""}</tr></thead><tbody>${all.map((p) => `<tr><th scope="row"><time datetime="${esc(p.date)}">${esc(p.date)}</time></th>${columns.map((m) => `<td>${esc(format(p[m.key], m.unit))}</td>`).join("")}${forecast.length ? `<td>${esc(format(p.lower, bandUnit))}</td><td>${esc(format(p.upper, bandUnit))}</td>` : ""}</tr>`).join("")}</tbody></table></div></details>`;
  charts.set(id, { all, description, x });
  return `<section data-chart="${id}" aria-label="${esc(title)}"><div class="chart-legend">${columns.map((m) => `<span><svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true" focusable="false"><line x1="2" y1="4" x2="22" y2="4" stroke="${color(m.color)}" stroke-width="2.5"${strokePattern(m)}/></svg>${esc(m.label)}</span>`).join("")}</div>${values.length ? `<svg class="chart" viewBox="0 0 480 250" role="img" aria-label="${esc(title)}; use the point inspector or data table for full values"><title>${esc(title)}</title>${ticks}${band}${target}${lines}${dates}<line data-chart-cursor x1="${x(selected)}" x2="${x(selected)}" y1="${top}" y2="${bottom}" stroke="#64787d" stroke-dasharray="2 3"/>${hits}</svg>` : '<p class="empty">No numeric observations available for this chart.</p>'}<div class="chart-inspector"><label for="${id}-point">Inspect ${esc(title)} point</label><input id="${id}-point" type="range" min="0" max="${all.length - 1}" step="1" value="${selected}" aria-valuetext="${esc(description(all[selected]))}" style="width:100%"><output for="${id}-point" aria-live="polite" aria-atomic="true">${esc(description(all[selected]))}</output></div>${table}</section>`;
}

export function bindCharts(root = document) {
  root.querySelectorAll("[data-chart]").forEach((section) => {
    const chart = charts.get(section.dataset.chart);
    if (!chart) return;
    const input = section.querySelector('input[type="range"]');
    const output = section.querySelector("output");
    const cursor = section.querySelector("[data-chart-cursor]");
    const select = (index) => {
      index = Math.max(0, Math.min(chart.all.length - 1, index));
      input.value = String(index);
      const text = chart.description(chart.all[index]);
      input.setAttribute("aria-valuetext", text);
      output.textContent = text;
      cursor?.setAttribute("x1", chart.x(index));
      cursor?.setAttribute("x2", chart.x(index));
    };
    input.oninput = () => select(Number(input.value));
    const svg = section.querySelector("svg.chart");
    if (svg)
      svg.onclick = (event) => {
        const point = event.target.closest("[data-chart-point]");
        if (point) select(Number(point.dataset.chartPoint));
      };
  });
}
