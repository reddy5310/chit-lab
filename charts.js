// Tiny dependency-free SVG chart helpers. Colours come from CSS classes (f1/f2/f3, s1/s2/s3).
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tipAttr = (t) => `data-tip="${esc(t)}"`;

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => f <= x + 1e-9) || 10) * p;
}
function frame(w, h, pad) { return { x0: pad.l, x1: w - pad.r, y0: h - pad.b, y1: pad.t }; }
function grid(f, lo, hi, yFmt, ticks = 4) {
  let out = '';
  for (let i = 0; i <= ticks; i++) {
    const v = lo + ((hi - lo) * i) / ticks, y = f.y0 - ((f.y0 - f.y1) * i) / ticks;
    out += `<line class="gl" x1="${f.x0}" x2="${f.x1}" y1="${y}" y2="${y}"/><text x="${f.x0 - 8}" y="${y + 4}" text-anchor="end">${esc(yFmt(v))}</text>`;
  }
  return out;
}
const xLabels = (f, n, label, band) => {
  const step = n > 14 ? Math.ceil(n / 10) : 1;
  let o = '';
  for (let i = 0; i < n; i++) if (i % step === 0 || i === n - 1) o += `<text x="${f.x0 + band * (i + 0.5)}" y="${f.y0 + 16}" text-anchor="middle">${esc(label(i))}</text>`;
  return o;
};

/** Vertical bars. data: [{label, v, tip, cls?}] ; optional ref line {v,label}; stack: data[i].v2 stacked on v. */
export function bars({ data, w = 640, h = 230, yFmt, ref, min = 0, max, cls = 'f1', cls2 = 'f2', pad = { l: 54, r: 14, t: 12, b: 26 } }) {
  const f = frame(w, h, pad), n = data.length, band = (f.x1 - f.x0) / n;
  const top = max ?? niceMax(Math.max(...data.map((d) => d.v + (d.v2 || 0)), ref ? ref.v : 0) * 1.04);
  const sy = (v) => f.y0 - ((v - min) / (top - min)) * (f.y0 - f.y1);
  const bw = Math.max(3, Math.min(30, band * 0.62)), r = Math.min(4, bw / 2);
  let g = grid(f, min, top, yFmt);
  g += data.map((d, i) => {
    const x = f.x0 + band * i + (band - bw) / 2;
    const y1 = sy(d.v), seg1 = `<path class="bar ${d.cls || cls}" d="M${x},${f.y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${f.y0} Z"/>`;
    let seg2 = '';
    if (d.v2) { const y2 = sy(d.v + d.v2); seg2 = `<rect class="bar ${cls2}" x="${x}" y="${y2}" width="${bw}" height="${Math.max(0, y1 - y2 - 2)}" rx="${r}"/>`; }
    return `<g class="col" ${tipAttr(d.tip)}>${seg1}${seg2}<rect class="hit" x="${f.x0 + band * i}" y="${f.y1}" width="${band}" height="${f.y0 - f.y1}"/></g>`;
  }).join('');
  if (ref) { const y = sy(ref.v); g += `<line class="ref" x1="${f.x0}" x2="${f.x1}" y1="${y}" y2="${y}"/><text x="${f.x1}" y="${y - 5}" text-anchor="end" class="lbl">${esc(ref.label)}</text>`; }
  g += xLabels(f, n, (i) => data[i].label, band);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Bar chart">${g}</svg>`;
}

/** Lines. series:[{name,cls,values[],tip(i)}], xs labels[]. Hover column shows tooltip for all series. */
export function lines({ series, xs, w = 640, h = 230, yFmt, tip, min, max, refs = [], pad = { l: 58, r: 74, t: 12, b: 26 } }) {
  const f = frame(w, h, pad), n = xs.length, band = (f.x1 - f.x0) / (n - 1 || 1);
  const all = series.flatMap((s) => s.values), lo0 = min ?? Math.min(0, ...all), hi0 = max ?? niceMax(Math.max(...all, ...refs.map((r) => r.v)) * 1.05);
  const lo = lo0 < 0 ? -niceMax(-lo0 * 1.05) : lo0;
  const sx = (i) => f.x0 + band * i, sy = (v) => f.y0 - ((v - lo) / (hi0 - lo)) * (f.y0 - f.y1);
  let g = grid(f, lo, hi0, yFmt);
  if (lo < 0 && hi0 > 0) g += `<line class="ax" x1="${f.x0}" x2="${f.x1}" y1="${sy(0)}" y2="${sy(0)}"/>`;
  for (const r of refs) g += `<line class="ref" x1="${f.x0}" x2="${f.x1}" y1="${sy(r.v)}" y2="${sy(r.v)}"/><text x="${f.x1 + 6}" y="${sy(r.v) + 4}" class="lbl">${esc(r.label)}</text>`;
  for (const s of series) {
    g += `<polyline class="ln ${s.cls}" points="${s.values.map((v, i) => `${sx(i)},${sy(v)}`).join(' ')}"/>`;
    const li = s.values.length - 1;
    g += `<circle class="${s.cls.replace('s', 'f')}" cx="${sx(li)}" cy="${sy(s.values[li])}" r="4"/>`;
    if (s.label) g += `<text x="${sx(li) + 8}" y="${sy(s.values[li]) + 4}" class="lbl">${esc(s.label)}</text>`;
  }
  g += xs.map((x, i) => `<g class="col" ${tipAttr(tip(i))}><line class="hl" x1="${sx(i)}" x2="${sx(i)}" y1="${f.y1}" y2="${f.y0}"/><rect class="hit" x="${sx(i) - band / 2}" y="${f.y1}" width="${band}" height="${f.y0 - f.y1}"/></g>`).join('');
  g += xs.map((x, i) => (i % (n > 14 ? Math.ceil(n / 10) : 1) === 0 || i === n - 1 ? `<text x="${sx(i)}" y="${f.y0 + 16}" text-anchor="middle">${esc(x)}</text>` : '')).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Line chart">${g}</svg>`;
}

/** Histogram with optional vertical markers [{v,label}] on a numeric x-axis. */
export function histogram({ hist, lo, width, w = 640, h = 220, xFmt, markers = [], tip, pad = { l: 40, r: 14, t: 38, b: 28 } }) {
  const f = frame(w, h, pad), n = hist.length, band = (f.x1 - f.x0) / n, top = Math.max(...hist) * 1.08 || 1;
  const sy = (c) => f.y0 - (c / top) * (f.y0 - f.y1), bw = band - 2;
  const xAt = (v) => f.x0 + ((v - lo) / (width * n)) * (f.x1 - f.x0);
  let g = `<line class="ax" x1="${f.x0}" x2="${f.x1}" y1="${f.y0}" y2="${f.y0}"/>`;
  g += hist.map((c, i) => {
    const x = f.x0 + band * i + 1, y = sy(c), r = Math.min(3, bw / 2);
    return `<g class="col" ${tipAttr(tip(i, c))}><path class="bar f1" d="M${x},${f.y0} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${f.y0} Z"/><rect class="hit" x="${x - 1}" y="${f.y1}" width="${band}" height="${f.y0 - f.y1}"/></g>`;
  }).join('');
  g += markers.map((m, i) => { const x = xAt(m.v); return `<line class="ref" x1="${x}" x2="${x}" y1="${f.y1 - 4}" y2="${f.y0}"/><text x="${x}" y="${f.y1 - 7 - (i % 3) * 11}" text-anchor="middle" class="lbl">${esc(m.label)}</text>`; }).join('');
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) { const v = lo + (width * n * i) / ticks; g += `<text x="${f.x0 + ((f.x1 - f.x0) * i) / ticks}" y="${f.y0 + 17}" text-anchor="middle">${esc(xFmt(v))}</text>`; }
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Distribution">${g}</svg>`;
}

export const legend = (items) => `<div class="legend">${items.map((i) => `<span><i style="background:var(--${i.v})"></i>${esc(i.t)}</span>`).join('')}</div>`;
