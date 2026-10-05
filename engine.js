// Chit Lab engine: pure maths, no DOM. Every number the UI shows comes from here.
//
// Model (matches the worked example in the product brief):
//   tickets T = months; every ticket pays base instalment s each month; chit C = s * T.
//   Each month one ticket wins. Winner gives up discount D (<= 30% of C by the Act).
//   Foreman takes commission fee (<= 7% of C by the Act); the rest of D, (D - fee),
//   is shared equally across ALL T tickets -> effective instalment = s - (D - fee) / T.
//   Winner receives C - D.
// All future auction outcomes are SCENARIOS driven by the "auction heat" assumption.

export const ACT = { maxCommissionPct: 7, maxDiscountPct: 30 };

export const SCHEMES = [
  { id: 'sprint6', name: 'Sprint6', months: 6,  members: 6,  min: 2000,  max: 10000,  role: 'Starter',     blurb: 'Short goals, first chit' },
  { id: 'easy12',  name: 'Easy12',  months: 12, members: 12, min: 2000,  max: 25000,  role: 'Mass market', blurb: 'Simple entry product' },
  { id: 'goal12',  name: 'Goal12',  months: 12, members: 12, min: 25000, max: 100000, role: 'High ticket', blurb: 'Planned big expense' },
  { id: 'goal18',  name: 'Goal18',  months: 18, members: 12, min: 5000,  max: 50000,  role: 'Balanced',    blurb: 'Family goals' },
  { id: 'prime20', name: 'Prime20', months: 20, members: 15, min: 10000, max: 100000, role: 'Core',        blurb: 'Flagship ₹2L–₹20L pot' },
  { id: 'trust24', name: 'Trust24', months: 24, members: 12, min: 10000, max: 100000, role: 'Proven',      blurb: 'Long saver, top tier' },
];
export const TICKETS = [2000, 5000, 10000, 25000, 50000, 100000];
export const HEATS = {
  calm:    { label: 'Calm',    start: 12, end: 5,  note: 'Few people need cash early' },
  typical: { label: 'Typical', start: 25, end: 9,  note: 'Balanced demand' },
  hot:     { label: 'Hot',     start: 30, end: 14, note: 'Many want cash early' },
};

// Guardrails behind the traffic lights (heuristics, stated in the UI).
export const GUARD = {
  earlyCost: { good: 24, warn: 36 },     // % per year cost of cash for an early winner
  saverYield: { good: 8, warn: 4 },      // % per year earned by the last winner
  marginPct: { good: 2, warn: 0.75 },    // manager net margin as % of chit volume
};

export const DEFAULTS = {
  scheme: 'prime20', ticket: 25000, months: 20, members: 15,
  commissionPct: 5, commissionBasis: 'auction', maxDiscountPct: 30,
  heat: 'typical', startPct: 25, endPct: 9, foremanFirst: true, override: null,
  defaultPct: 3, coverPct: 60, cacPerMember: 1500, opsPerMemberMonth: 40, txnFee: 3, securityPct: 100,
  mix: { early: 30, flex: 40, saver: 30 },
};

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const memberRange = (T) => [Math.min(10, T), Math.min(15, T)];

/** Heat presets are quoted for a 20-month cycle and scale with duration (shorter cycle => smaller % discounts). */
export function heatBids(key, months) {
  const h = HEATS[key], k = months / 20;
  return { startPct: Math.round(clamp(h.start * k, 0, 30) * 10) / 10, endPct: Math.round(clamp(h.end * k, 0, 30) * 10) / 10 };
}
export function withHeat(cfg, key) {
  return { ...cfg, heat: key, ...heatBids(key, cfg.months) };
}
export function withScheme(cfg, id) {
  const sc = SCHEMES.find((x) => x.id === id);
  const [lo, hi] = memberRange(sc.months);
  const next = { ...cfg, scheme: id, months: sc.months, members: clamp(sc.members, lo, hi), override: null };
  if (cfg.heat !== 'custom') return { ...next, ...heatBids(cfg.heat, sc.months) };
  const k = sc.months / cfg.months;
  return { ...next, startPct: clamp(cfg.startPct * k, 0, 30), endPct: clamp(cfg.endPct * k, 0, 30) };
}

/** Distribute tickets over members (a member can hold several when members < tickets). */
export function allocate(cfg) {
  const tk = cfg.months - (cfg.foremanFirst ? 1 : 0);
  const M = clamp(cfg.members, ...memberRange(cfg.months));
  const base = Math.floor(tk / M), extra = tk % M;
  const holds = Array.from({ length: M }, (_, i) => base + (i < extra ? 1 : 0));
  return { holds, maxHold: Math.max(...holds), multi: tk > M, M, tickets: tk };
}

export function simulate(cfg) {
  const T = cfg.months, s = cfg.ticket, C = s * T;
  const cp = cfg.commissionPct / 100;
  const maxD = Math.min(cfg.maxDiscountPct, ACT.maxDiscountPct) / 100;
  const ff = cfg.foremanFirst;
  const feeMonths = T - (ff ? 1 : 0);
  const feeOf = (m) => (ff && m === 1 ? 0 : cfg.commissionBasis === 'cycle' ? (cp * C) / feeMonths : cp * C);
  const first = ff ? 2 : 1, last = T - 1;
  const rows = [];
  for (let m = 1; m <= T; m++) {
    const fee = feeOf(m);
    let D, kind = 'auction';
    if (ff && m === 1) { D = 0; kind = 'foreman'; }
    else if (m === T) { D = fee; kind = 'final'; }
    else {
      const t = last > first ? (m - first) / (last - first) : 0;
      let pct = cfg.startPct + (cfg.endPct - cfg.startPct) * t;
      if (cfg.override && cfg.override.month === m) pct = cfg.override.pct;
      D = Math.max(fee, Math.min((pct / 100) * C, maxD * C));
    }
    const div = (D - fee) / T;
    rows.push({ m, kind, D, fee, div, eff: s - div, prize: C - D, pct: (D / C) * 100 });
  }
  return { cfg, T, s, C, rows, volume: C * T };
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
const npv = (fl, r) => { let d = 1, v = 0; const k = 1 / (1 + r); for (let i = 0; i < fl.length; i++) { d *= k; v += fl[i] * d; } return v; };

/** Annualised IRR of monthly cash flows (first root scanning up from -5%/month), or null. */
export function annualIrr(fl) {
  const step = 0.002;
  let r0 = -0.05, v0 = npv(fl, r0);
  for (let r = r0 + step; r <= 1.5; r += step) {
    const v = npv(fl, r);
    if (Math.abs(v) < 1e-9) return (Math.pow(1 + r, 12) - 1) * 100;
    if (v0 * v < 0) {
      let lo = r - step, hi = r;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (npv(fl, lo) * npv(fl, mid) <= 0) hi = mid; else lo = mid; }
      return (Math.pow(1 + (lo + hi) / 2, 12) - 1) * 100;
    }
    v0 = v;
  }
  return null;
}

/** Everything about a ticket that wins in month w. */
export function ticket(sim, w) {
  const r = sim.rows[w - 1];
  const paid = sum(sim.rows.map((x) => x.eff));
  const flows = sim.rows.map((x) => -x.eff + (x.m === w ? r.prize : 0));
  let run = 0;
  const cumulative = flows.map((f) => (run += f));
  return {
    w, prize: r.prize, discount: r.D, discountPct: r.pct,
    paid, net: r.prize - paid, face: sim.C,
    paidBefore: sum(sim.rows.slice(0, w).map((x) => x.eff)),
    remaining: sum(sim.rows.slice(w).map((x) => x.eff)),
    flows, cumulative,
    irr: annualIrr(flows),
  };
}

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function analyze(cfg) {
  const sim = simulate(cfg);
  const { T, rows, C, volume } = sim;
  const alloc = allocate(cfg);
  const firstMember = cfg.foremanFirst ? 2 : 1;
  const earlyW = Math.max(firstMember, Math.round(T * 0.15));
  const midW = Math.max(firstMember, Math.round(T * 0.5));
  const early = ticket(sim, earlyW), mid = ticket(sim, midW), saver = ticket(sim, T);

  const effs = rows.map((r) => r.eff);
  const revenue = sum(rows.map((r) => r.fee));
  const distributed = sum(rows.map((r) => r.D - r.fee));

  // Prized-member exposure: what prized members still owe the chit after receiving the pot.
  const suffix = Array(T + 2).fill(0);
  for (let m = T; m >= 1; m--) suffix[m] = suffix[m + 1] + rows[m - 1].eff;
  const remaining = (w) => suffix[w + 1];
  const unpaidAvg = (w) => { if (w >= T) return 0; let a = 0; for (let d = w + 1; d <= T; d++) a += suffix[d]; return a / (T - w); };
  const exposure = [];
  for (let t = 1; t <= T; t++) { let e = 0; for (let w = firstMember; w <= t; w++) e += remaining(w); exposure.push(e); }
  const peakExposure = Math.max(...exposure);
  const uncoveredFactor = 1 - cfg.coverPct / 100;
  const lossPerUnit = uncoveredFactor * sum(Array.from({ length: T - firstMember + 1 }, (_, i) => unpaidAvg(firstMember + i)));
  const expectedLoss = (cfg.defaultPct / 100) * lossPerUnit;

  const M = alloc.M;
  const processing = cfg.txnFee * M * T, ops = cfg.opsPerMemberMonth * M * T, acquisition = cfg.cacPerMember * M;
  const fixed = processing + ops + acquisition;
  const margin = revenue - expectedLoss - fixed;
  const capital = (cfg.securityPct / 100) * C;
  const mgr = {
    revenue, expectedLoss, processing, ops, acquisition, margin, capital, peakExposure, lossPerUnit,
    marginPct: (margin / volume) * 100,
    perCr: (margin * 1e7) / volume,
    roe: capital > 0 ? (margin / capital) * (12 / T) * 100 : null,
    breakEvenDefault: lossPerUnit > 0 ? ((revenue - fixed) / lossPerUnit) * 100 : Infinity,
    exposure,
  };

  const lvl = (v, g, lowerBetter) => (v == null ? 'bad' : lowerBetter ? (v <= g.good ? 'good' : v <= g.warn ? 'warn' : 'bad') : (v >= g.good ? 'good' : v >= g.warn ? 'warn' : 'bad'));
  const gauges = [
    { key: 'early', label: 'Early-access cost', value: early.irr, unit: 'per year', status: lvl(early.irr, GUARD.earlyCost, true), note: `Winner in month ${earlyW}` },
    { key: 'saver', label: 'Saver yield', value: saver.irr, unit: 'per year', status: lvl(saver.irr, GUARD.saverYield, false), note: `Waits to month ${T}` },
    { key: 'mgr', label: 'Manager margin', value: mgr.marginPct, unit: 'of volume', status: lvl(mgr.marginPct, GUARD.marginPct, false), note: `${fmtShort(mgr.perCr)} per ₹1 Cr` },
  ];
  const winWin = gauges.every((g) => g.status === 'good') ? 'good' : gauges.some((g) => g.status === 'bad') ? 'bad' : 'warn';

  // Heuristic group health (weights follow the brief: 30 payment, 25 saver, 20 liquidity, 15 margin, 10 fairness).
  const mix = cfg.mix, tot = mix.early + mix.flex + mix.saver || 1;
  const dist = Math.abs(mix.early / tot - 0.3) + Math.abs(mix.flex / tot - 0.4) + Math.abs(mix.saver / tot - 0.3);
  const parts = {
    payment: clamp(100 - cfg.defaultPct * 15, 0, 100),
    saver: clamp(((saver.irr ?? 0) / 10) * 100, 0, 100),
    liquidity: clamp(100 - dist * 100, 0, 100),
    margin: clamp((mgr.marginPct / 3) * 100, 0, 100),
    fairness: clamp(100 - Math.max(0, (early.irr ?? 99) - 24) * 3, 0, 100),
  };
  const concentration = clamp(100 - 25 * (alloc.maxHold - 1), 0, 100);
  const health = Math.round(0.3 * parts.payment + 0.25 * parts.saver + 0.2 * parts.liquidity + 0.15 * parts.margin + 0.1 * parts.fairness);

  return {
    sim, alloc, early, mid, saver, earlyW, midW, mgr, gauges, winWin, health, healthParts: { ...parts, concentration },
    revenue, distributed, volume, C,
    effMin: Math.min(...effs), effMax: Math.max(...effs), effAvg: sum(effs) / T,
    totalPaid: sum(effs), remaining, unpaidAvg, firstMember,
  };
}

/** Monte Carlo of post-prize defaults. Deterministic for a given seed. */
export function monteCarlo(cfg, a, trials = 3000, seed = 11) {
  const { T } = a.sim, p = cfg.defaultPct / 100, rand = rng(seed);
  const suffix = Array(T + 2).fill(0);
  for (let m = T; m >= 1; m--) suffix[m] = suffix[m + 1] + a.sim.rows[m - 1].eff;
  const base = a.mgr.revenue - a.mgr.processing - a.mgr.ops - a.mgr.acquisition;
  const unc = 1 - cfg.coverPct / 100;
  const out = [];
  for (let i = 0; i < trials; i++) {
    let loss = 0;
    for (let w = a.firstMember; w < T; w++) if (rand() < p) { const d = w + 1 + Math.floor(rand() * (T - w)); loss += suffix[d] * unc; }
    out.push(base - loss);
  }
  const sorted = [...out].sort((x, y) => x - y);
  const q = (f) => sorted[Math.min(trials - 1, Math.floor(f * trials))];
  const lo = sorted[0], hi = sorted[trials - 1], bins = 24, width = (hi - lo) / bins || 1;
  const hist = Array(bins).fill(0);
  for (const v of out) hist[Math.min(bins - 1, Math.floor((v - lo) / width))]++;
  return { p5: q(0.05), p50: q(0.5), p95: q(0.95), worst: lo, best: hi, probLoss: out.filter((v) => v < 0).length / trials, hist, lo, width, trials };
}

/** Compare schemes x tickets at the current assumptions. */
export function sweep(cfg, schemeIds = SCHEMES.map((s) => s.id), tickets = TICKETS) {
  return schemeIds.map((id) => tickets.map((t) => analyze({ ...withScheme(cfg, id), ticket: t })));
}

// ---------- formatting ----------
export const inr = (n) => (n < 0 ? '−' : '') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
export function fmtShort(n) {
  const a = Math.abs(n), sign = n < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 2).replace(/\.?0+$/, '')} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return `${sign}₹${Math.round(a)}`;
}
export const pct = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${v.toFixed(d)}%`);
