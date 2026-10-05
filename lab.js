import * as E from './engine.js';
import { bars, lines, histogram, legend, esc } from './charts.js';

const { inr, fmtShort, pct, SCHEMES, TICKETS, HEATS, GUARD } = E;
const $ = (s, r = document) => r.querySelector(s);
const rate = (v) => (v == null ? '—' : v >= 1000 ? '>1000%' : `${v.toFixed(v < 10 ? 1 : 0)}%`);
const KEY = 'chit-lab:v1';
const TABS = [['lab', 'Lab'], ['auctions', 'Auctions'], ['member', 'Member view'], ['manager', 'Manager'], ['compare', 'Compare']];

// ---------- state ----------
const mergeCfg = (c) => ({ ...E.DEFAULTS, ...c, mix: { ...E.DEFAULTS.mix, ...(c && c.mix) } });
function load() {
  const st = { cfg: mergeCfg(), tab: 'lab', pinned: [], sel: null, need: null, metric: 'perCr' };
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) { st.cfg = mergeCfg(d.cfg); st.tab = d.tab || 'lab'; st.pinned = d.pinned || []; } } catch {}
  try { const m = location.hash.match(/c=([^&]+)/); if (m) st.cfg = mergeCfg(JSON.parse(decodeURIComponent(escape(atob(m[1]))))); } catch {}
  return st;
}
const S = load();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ cfg: S.cfg, tab: S.tab, pinned: S.pinned })); } catch {} };
const schemeName = (c) => (SCHEMES.find((s) => s.id === c.scheme) || { name: 'Custom' }).name;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200); }

// ---------- controls ----------
const RANGES = {
  members:           { label: 'Members', min: (c) => E.memberRange(c.months)[0], max: (c) => E.memberRange(c.months)[1], step: 1, fmt: (c) => `${c.members} people` },
  startPct:          { label: 'Opening discount', min: () => 0, max: () => 30, step: 0.5, fmt: (c) => `${c.startPct}% of chit` },
  endPct:            { label: 'Late-cycle discount', min: () => 0, max: () => 30, step: 0.5, fmt: (c) => `${c.endPct}% of chit` },
  commissionPct:     { label: 'Foreman commission', min: () => 1, max: () => E.ACT.maxCommissionPct, step: 0.25, fmt: (c) => `${c.commissionPct}% of chit` },
  maxDiscountPct:    { label: 'Max discount allowed', min: () => 10, max: () => E.ACT.maxDiscountPct, step: 1, fmt: (c) => `${c.maxDiscountPct}% of chit` },
  defaultPct:        { label: 'Post-prize default rate', min: () => 0, max: () => 15, step: 0.5, fmt: (c) => `${c.defaultPct}% of prized tickets` },
  coverPct:          { label: 'Security covering dues', min: () => 0, max: () => 100, step: 5, fmt: (c) => `${c.coverPct}%` },
  securityPct:       { label: 'Foreman security deposit', min: () => 0, max: () => 150, step: 10, fmt: (c) => `${c.securityPct}% of chit` },
  cacPerMember:      { label: 'Acquisition cost / member', min: () => 0, max: () => 5000, step: 100, fmt: (c) => inr(c.cacPerMember) },
  opsPerMemberMonth: { label: 'Ops cost / member / month', min: () => 0, max: () => 200, step: 5, fmt: (c) => inr(c.opsPerMemberMonth) },
  txnFee:            { label: 'Payment fee / instalment', min: () => 0, max: () => 15, step: 0.5, fmt: (c) => inr(c.txnFee) },
};
const MIX = { early: 'Early seekers', flex: 'Flexible', saver: 'Savers' };
const rangeField = (k) => `<div class="field"><label for="r-${k}">${RANGES[k].label}<output id="o-${k}"></output></label><input type="range" id="r-${k}" data-k="${k}"></div>`;

function buildControls() {
  $('#ctl').innerHTML = `
  <div class="cgroup"><h3>Scheme</h3>
    <div class="chips" id="schemes">${SCHEMES.map((s) => `<button class="chip" data-scheme="${s.id}"><b>${s.name}</b><span>${s.months} months · ${s.role}</span></button>`).join('')}</div>
    <div class="field"><div class="lab">Duration</div><div class="chips row" id="durs">${[6, 12, 18, 20, 24].map((m) => `<button class="chip" data-months="${m}"><b>${m}m</b></button>`).join('')}</div></div>
  </div>
  <div class="cgroup"><h3>Contribution</h3>
    <div class="field"><label for="ticketLog">Monthly ticket<output id="o-ticket"></output></label><input type="range" id="ticketLog" min="0" max="1000" step="1">
      <div class="chips row" id="tickets">${TICKETS.map((t) => `<button class="chip" data-ticket="${t}"><b>${fmtShort(t)}</b></button>`).join('')}</div><small id="s-ticket"></small></div>
  </div>
  <div class="cgroup"><h3>Group</h3>${rangeField('members')}<div class="alloc" id="alloc"></div><small class="mute" id="s-alloc"></small>
    <details class="adv field"><summary>Liquidity mix (Chit DNA)</summary>
      ${Object.entries(MIX).map(([k, l]) => `<div class="field"><label for="m-${k}">${l}<output id="om-${k}"></output></label><input type="range" id="m-${k}" data-mix="${k}" min="0" max="100" step="5"></div>`).join('')}
      <small class="mute">Ideal mix is about 30 / 40 / 30. It feeds the group-health score.</small></details>
  </div>
  <div class="cgroup"><h3>Auction behaviour</h3>
    <div class="seg" id="heat">${Object.entries(HEATS).map(([k, h]) => `<button data-heat="${k}">${h.label}</button>`).join('')}</div>
    <small class="mute" id="s-heat"></small>
    ${rangeField('startPct')}${rangeField('endPct')}
    <div class="field switch"><span>Foreman takes month 1 at no discount</span><input type="checkbox" id="ff" aria-label="Foreman takes month 1"></div>
  </div>
  <div class="cgroup"><h3>Foreman terms</h3>${rangeField('commissionPct')}
    <div class="field"><div class="lab">Commission charged</div><div class="seg" id="basis"><button data-basis="auction">Every auction</button><button data-basis="cycle">Once per cycle</button></div><small class="mute" id="s-basis"></small></div>
    ${rangeField('maxDiscountPct')}
  </div>
  <div class="cgroup"><details class="adv"><summary>Manager assumptions</summary>${['defaultPct', 'coverPct', 'securityPct', 'cacPerMember', 'opsPerMemberMonth', 'txnFee'].map(rangeField).join('')}</details></div>`;
}

const ticketToPos = (t) => Math.round((1000 * Math.log(t / 2000)) / Math.log(50));
const posToTicket = (p) => { const t = 2000 * Math.pow(50, p / 1000); const st = t < 10000 ? 500 : t < 50000 ? 1000 : 5000; return Math.min(100000, Math.max(2000, Math.round(t / st) * st)); };
const fillPct = (el) => el.style.setProperty('--p', `${((el.value - el.min) / (el.max - el.min || 1)) * 100}%`);

function sync() {
  const c = S.cfg;
  document.querySelectorAll('[data-scheme]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.scheme === c.scheme));
  document.querySelectorAll('[data-months]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.months === c.months));
  document.querySelectorAll('[data-ticket]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.ticket === c.ticket));
  document.querySelectorAll('[data-heat]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.heat === c.heat));
  document.querySelectorAll('[data-basis]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.basis === c.commissionBasis));
  $('#ff').checked = c.foremanFirst;
  const tl = $('#ticketLog'); tl.value = ticketToPos(c.ticket); fillPct(tl);
  $('#o-ticket').textContent = inr(c.ticket);
  const sc = SCHEMES.find((s) => s.id === c.scheme);
  $('#s-ticket').textContent = sc ? (c.ticket < sc.min || c.ticket > sc.max ? `Outside ${sc.name}'s usual range (${fmtShort(sc.min)}–${fmtShort(sc.max)})` : `${sc.name} range ${fmtShort(sc.min)}–${fmtShort(sc.max)}`) : 'Custom duration';
  for (const k of Object.keys(RANGES)) {
    const el = $(`#r-${k}`), r = RANGES[k];
    el.min = r.min(c); el.max = r.max(c); el.step = r.step; el.value = c[k]; fillPct(el);
    $(`#o-${k}`).textContent = r.fmt(c);
  }
  const mt = Object.values(c.mix).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(MIX)) { const el = $(`#m-${k}`); el.value = c.mix[k]; fillPct(el); $(`#om-${k}`).textContent = `${Math.round((c.mix[k] / mt) * 100)}%`; }
  $('#s-heat').textContent = c.heat === 'custom' ? 'Custom bidding curve' : HEATS[c.heat].note;
  $('#s-basis').textContent = c.commissionBasis === 'auction' ? 'Industry practice: fee deducted from every month’s discount.' : 'Conservative reading: one fee for the whole chit.';
  const al = E.allocate(c);
  $('#alloc').innerHTML = al.holds.map((h, i) => `<i class="${h > 1 ? 'm' + Math.min(3, h) : ''}" title="Member ${i + 1} holds ${h} ticket${h > 1 ? 's' : ''}">${h}</i>`).join('');
  $('#s-alloc').textContent = `${al.tickets} member tickets over ${al.M} members${al.multi ? ' (multi-ticket)' : ''}`;
}

function set(patch, fn) {
  S.cfg = fn ? fn(S.cfg) : { ...S.cfg, ...patch };
  S.cfg.members = E.clamp(S.cfg.members, ...E.memberRange(S.cfg.months));
  persist(); sync(); render();
}

function wireControls() {
  const ctl = $('#ctl');
  ctl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.scheme) set(0, (c) => E.withScheme(c, d.scheme));
    else if (d.months) set(0, (c) => { const n = { ...c, months: +d.months, scheme: 'custom', override: null }; return c.heat === 'custom' ? n : { ...n, ...E.heatBids(c.heat, +d.months) }; });
    else if (d.ticket) set({ ticket: +d.ticket });
    else if (d.heat) set(0, (c) => E.withHeat(c, d.heat));
    else if (d.basis) set({ commissionBasis: d.basis });
  });
  ctl.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'ticketLog') set({ ticket: posToTicket(+el.value) });
    else if (el.id === 'ff') set({ foremanFirst: el.checked, override: null });
    else if (el.dataset.k) {
      const k = el.dataset.k, v = +el.value;
      if (k === 'startPct' || k === 'endPct') set({ [k]: v, heat: 'custom', override: null });
      else set({ [k]: v });
    } else if (el.dataset.mix) set({ mix: { ...S.cfg.mix, [el.dataset.mix]: +el.value } });
  });
}

// ---------- hero ----------
function verdictText(a) {
  const g = Object.fromEntries(a.gauges.map((x) => [x.key, x]));
  if (a.winWin === 'good') return ['Balanced win-win', `Early members pay ${rate(g.early.value)} a year for cash, savers earn ${rate(g.saver.value)}, and the foreman keeps ${pct(g.mgr.value)} of volume.`];
  const out = [];
  if (g.early.status !== 'good') out.push(`early access costs ${rate(g.early.value)} p.a. (target ≤ ${GUARD.earlyCost.good}%)`);
  if (g.saver.status !== 'good') out.push(`savers earn ${rate(g.saver.value)} p.a. (target ≥ ${GUARD.saverYield.good}%)`);
  if (g.mgr.status !== 'good') out.push(`manager margin is ${pct(g.mgr.value)} of volume (target ≥ ${GUARD.marginPct.good}%)`);
  const t = out.join(' · ');
  return [a.winWin === 'warn' ? 'Workable' : 'Out of balance', t[0].toUpperCase() + t.slice(1) + '.'];
}
const ICON = { good: '✓', warn: '!', bad: '✕' };
function renderHero(a) {
  const c = S.cfg, [vt, vd] = verdictText(a);
  $('#hero').innerHTML = `
  <div class="card heroL">
    <div class="kpi"><div class="k">${schemeName(c)} · gross chit</div><div class="v">${inr(a.C)}</div><div class="n">${inr(c.ticket)} × ${c.months} months · ${a.alloc.M} members · volume ${fmtShort(a.volume)}</div></div>
    <div class="kpi"><div class="k">Every member pays</div><div class="v sm">${inr(a.effMin)} – ${inr(a.effMax)}</div><div class="n">avg ${inr(a.effAvg)} vs ${inr(c.ticket)} base · ${inr(c.ticket * c.months - a.totalPaid)} saved over the cycle</div></div>
    <div class="kpi"><div class="k">Foreman earns</div><div class="v sm ${a.mgr.margin < 0 ? 'neg' : ''}">${inr(a.mgr.margin)}</div><div class="n">${fmtShort(a.mgr.perCr)} per ₹1 Cr · ${pct(a.mgr.roe, 0)} p.a. on ${fmtShort(a.mgr.capital)} security</div></div>
    <div class="kpi"><div class="k">Group health</div><div class="v sm">${a.health}<span class="mute" style="font-size:14px"> / 100</span></div><div class="n">Heuristic score · see Manager tab</div></div>
  </div>
  <div class="card"><div class="gauges">${a.gauges.map((g) => `<div class="gauge st-${g.status}"><span class="ic" title="${g.status}">${ICON[g.status]}</span><span class="t">${g.label}<small>${g.note}</small></span><span class="val">${g.key === 'mgr' ? pct(g.value, 2) : rate(g.value)}<small>${g.unit}</small></span></div>`).join('')}</div>
  <div class="verdict st-${a.winWin}"><b>${vt}</b><span>${esc(vd)}</span></div></div>`;
}

// ---------- tabs / views ----------
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('');
}
const note = (t, k = '') => `<div class="note ${k}">${t}</div>`;

function insights(a) {
  const c = S.cfg, n = [];
  if (c.commissionBasis === 'cycle') n.push(note(`<b>Commission charged once per cycle.</b> Foreman revenue is ${inr(a.revenue)}, only ${pct((a.revenue / a.volume) * 100, 2)} of volume. Charging ${c.commissionPct}% on every auction gives ${inr(c.commissionPct / 100 * a.C * (c.months - (c.foremanFirst ? 1 : 0)))}. The brief’s “₹35K per ₹5L group” figure is this once-per-cycle reading, so confirm the basis with counsel.`, 'warn'));
  if (a.alloc.multi) n.push(note(`<b>Multi-ticket structure.</b> ${a.alloc.tickets} member tickets sit with ${a.alloc.M} members, so some hold ${a.alloc.maxHold}. One default hits ${a.alloc.maxHold}× harder, so cap exposure per member, and have counsel confirm the ticket structure.`, 'warn'));
  if (a.saver.irr != null && a.saver.irr < GUARD.saverYield.warn) n.push(note(`<b>Savers are not rewarded.</b> The last winner earns ${rate(a.saver.irr)} a year. Dividends only exist when discounts exceed the ${c.commissionPct}% fee, so lengthen the cycle or lower the commission.`, 'bad'));
  if (c.startPct >= c.maxDiscountPct) n.push(note(`The opening discount is at the ${c.maxDiscountPct}% ceiling, so early bidders are capped by law. The real cost of early cash can’t rise further.`));
  if (c.foremanFirst) n.push(note(`The foreman takes month 1 at zero discount, so the foreman’s ticket is a ${inr(a.C)} advance repaid through instalments. That float is your capital at work.`));
  return n.join('');
}

function story(t, title, color, lab, a) {
  const cash = t.net < 0 ? 'cost' : 'yield';
  return `<div class="card story" style="--c:var(--${color})"><h2>${title}<span class="tag">Month ${t.w}</span></h2>
    <div class="sub">${lab}</div><div class="big">${inr(t.prize)}</div><div class="mute" style="font-size:12px;margin-bottom:6px">cash received</div>
    <div class="row"><span>Discount given up</span><b>${inr(t.discount)} · ${pct(t.discountPct, 0)}</b></div>
    <div class="row"><span>You pay in total</span><b>${inr(t.paid)}</b></div>
    <div class="row"><span>Net vs ${inr(t.face)}</span><b class="${t.net < 0 ? 'neg' : 'pos'}">${inr(t.net)}</b></div>
    <div class="row"><span>${t.irr == null ? 'Annual rate' : cash === 'cost' ? 'Cost of cash p.a.' : 'Yield p.a.'}</span><b>${rate(t.irr)}</b></div></div>`;
}

function viewLab(a) {
  const c = S.cfg, rows = a.sim.rows;
  const effChart = bars({ data: rows.map((r) => ({ label: r.m, v: r.eff, tip: `<b>Month ${r.m}</b>\nDiscount ${pct(r.pct)} (${inr(r.D)})\nDividend per ticket ${inr(r.div)}\nYou pay ${inr(r.eff)}` })), yFmt: fmtShort, ref: { v: c.ticket, label: `Base ${fmtShort(c.ticket)}` } });
  const discChart = lines({ series: [{ name: 'Discount', cls: 's2', values: rows.map((r) => r.pct) }], xs: rows.map((r) => r.m), yFmt: (v) => `${Math.round(v)}%`,
    max: Math.ceil((c.maxDiscountPct * 1.1) / 5) * 5, refs: [{ v: c.maxDiscountPct, label: `${c.maxDiscountPct}% cap` }, { v: (rows[rows.length - 1].fee / a.C) * 100, label: 'Fee' }],
    tip: (i) => `<b>Month ${rows[i].m}</b>\nDiscount ${pct(rows[i].pct)} · ${inr(rows[i].D)}\nWinner gets ${inr(rows[i].prize)}` });
  return `${insights(a)}
  <div class="grid2"><div class="card"><h2>What each member pays</h2><div class="sub">Effective instalment after the month’s dividend. Hover a bar.</div>${effChart}</div>
  <div class="card"><h2>Auction discount by month</h2><div class="sub">Scenario from the “${c.heat === 'custom' ? 'custom' : HEATS[c.heat].label}” auction behaviour.</div>${discChart}</div></div>
  <div class="grid3 stories">${story(a.early, 'Early seeker', 's2', 'Needs money soon', a)}${story(a.mid, 'Flexible', 's1', 'Takes it midway', a)}${story(a.saver, 'Saver', 's3', 'Waits for the end', a)}</div>`;
}

function viewAuctions(a) {
  const rows = a.sim.rows, c = S.cfg;
  const sel = rows[(S.sel ?? a.earlyW) - 1] || rows[0];
  const split = (sel.prize / a.C) * 100, fee = (sel.fee / a.C) * 100, div = ((sel.D - sel.fee) / a.C) * 100;
  return `<div class="grid2" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)">
  <div class="card"><h2>Month by month</h2><div class="sub">Click a row to see exactly where each rupee goes.</div><div class="tw"><table><thead><tr><th>Month</th><th>Winner</th><th>Discount</th><th>Fee</th><th>Dividend / ticket</th><th>Members pay</th><th>Winner gets</th></tr></thead><tbody>
  ${rows.map((r) => `<tr data-sel="${r.m}" class="${r.m === sel.m ? 'sel' : ''}"><td>${r.m}</td><td>${r.kind === 'foreman' ? '<span class="tag f">Foreman</span>' : r.kind === 'final' ? '<span class="tag l">Last ticket</span>' : 'Bid winner'}</td><td>${pct(r.pct)} · ${fmtShort(r.D)}</td><td>${fmtShort(r.fee)}</td><td>${inr(r.div)}</td><td><b>${inr(r.eff)}</b></td><td>${inr(r.prize)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card"><h2>Why month ${sel.m} works out this way</h2><div class="sub">${inr(a.C)} chit · discount ${pct(sel.pct)}</div>
    <div class="split"><i style="width:${split}%;background:var(--s1)"></i><i style="width:${fee}%;background:var(--s2)"></i><i style="width:${div}%;background:var(--s3)"></i></div>
    ${legend([{ v: 's1', t: `Winner ${inr(sel.prize)}` }, { v: 's2', t: `Foreman fee ${inr(sel.fee)}` }, { v: 's3', t: `Shared back ${inr(sel.D - sel.fee)}` }])}
    <div class="row"><span>Base instalment</span><b>${inr(c.ticket)}</b></div>
    <div class="row"><span>− Your share (${inr(sel.D - sel.fee)} ÷ ${c.months} tickets)</span><b>${inr(sel.div)}</b></div>
    <div class="row"><span>= You pay this month</span><b>${inr(sel.eff)}</b></div>
    <div class="row"><span>Exposure of prized members after this month</span><b>${fmtShort(a.mgr.exposure[sel.m - 1])}</b></div>
    ${note(sel.kind === 'foreman' ? 'Under the Act the foreman may take the first chit without discount; nothing is shared back this month.' : sel.kind === 'final' ? 'The last remaining ticket receives the pot with no competing bid; only the fee is deducted.' : 'The discount the winner accepts is split: the foreman’s fee first, the rest returns to all tickets equally.')}</div></div>`;
}

function viewMember(a) {
  const c = S.cfg, T = c.months, lo = a.firstMember;
  const need = E.clamp(S.need ?? a.earlyW, lo, T - 1 || T);
  const row = a.sim.rows[need - 1];
  return `<div class="card"><h2>When might you need the money?</h2><div class="sub">Drag to a month and the whole chit recalculates around you. These are scenarios, not promises.</div>
  <div class="grid2" style="margin:0"><div class="field"><label for="need">I want the pot in month<output id="o-need"></output></label><input type="range" id="need" min="${lo}" max="${T - 1}" step="1" value="${need}"></div>
  <div class="field"><label for="bid">My discount for that month<output id="o-bid"></output></label><input type="range" id="bid" min="${Math.ceil((row.fee / a.C) * 100)}" max="${c.maxDiscountPct}" step="0.5" value="${c.override && c.override.month === need ? c.override.pct : row.pct.toFixed(1)}"><small class="mute">Higher bids win earlier but cost more. Others’ dividends change too.</small></div></div></div>
  <div id="mOut"></div>`;
}
function paintMember(a) {
  const c = S.cfg, T = c.months;
  const need = E.clamp(S.need ?? a.earlyW, a.firstMember, T - 1 || T);
  const sim = a.sim;
  const mine = E.ticket(sim, need), mid = E.ticket(sim, E.clamp(Math.round(T * 0.5), need, T)), last = a.saver;
  $('#o-need').textContent = `${need} of ${T}`; $('#o-bid').textContent = `${pct(mine.discountPct)} · ${inr(mine.discount)}`;
  const cols = [[`Take in month ${need}`, mine, 's2'], [`Take in month ${mid.w}`, mid, 's1'], [`Wait till month ${T}`, last, 's3']];
  const chart = lines({ series: cols.map(([n, t, k]) => ({ name: n, cls: k, values: t.cumulative, label: k === 's2' ? 'You' : k === 's1' ? 'Mid' : 'Wait' })), xs: a.sim.rows.map((r) => r.m), yFmt: fmtShort,
    tip: (i) => `<b>After month ${i + 1}</b>\n${cols.map(([n, t]) => `${n}: ${inr(t.cumulative[i])}`).join('\n')}` });
  const labelFor = (t) => (t.w <= T / 2 ? 'Cost of cash p.a.' : 'Yield on savings p.a.');
  $('#mOut').innerHTML = `<div class="grid2"><div class="card"><h2>Your position over time</h2><div class="sub">Cumulative cash: received minus paid. The month you take the pot, the line jumps.</div>${chart}${legend(cols.map(([n, , k]) => ({ v: k, t: n })))}</div>
  <div class="card"><h2>Side by side</h2><div class="sub">Same chit, three decisions.</div><div class="tw"><table><thead><tr><th></th>${cols.map(([n]) => `<th>${n}</th>`).join('')}</tr></thead><tbody>
  <tr><td>Cash received</td>${cols.map(([, t]) => `<td><b>${inr(t.prize)}</b></td>`).join('')}</tr>
  <tr><td>Discount given up</td>${cols.map(([, t]) => `<td>${inr(t.discount)} (${pct(t.discountPct, 0)})</td>`).join('')}</tr>
  <tr><td>You pay in total</td>${cols.map(([, t]) => `<td>${inr(t.paid)}</td>`).join('')}</tr>
  <tr><td>Net vs ${inr(a.C)}</td>${cols.map(([, t]) => `<td class="${t.net < 0 ? 'neg' : 'pos'}">${inr(t.net)}</td>`).join('')}</tr>
  <tr><td>Still owed after taking</td>${cols.map(([, t]) => `<td>${inr(t.remaining)}</td>`).join('')}</tr>
  <tr><td>Effective rate</td>${cols.map(([, t]) => `<td>${rate(t.irr)}<br><span class="mute" style="font-size:11px">${t.irr == null ? 'mixed profile' : labelFor(t)}</span></td>`).join('')}</tr></tbody></table></div></div></div>
  ${note(`<b>Security.</b> After taking the pot in month ${need} you still owe ${inr(mine.remaining)}. The Act requires security or a guarantee against that, subject to its exceptions, so plan for it before bidding.`)}
  ${note('All outcomes depend on how others bid. They are illustrations from the auction-behaviour setting, not guaranteed returns.', 'warn')}`;
}

const mcCache = new Map();
function viewManager(a) {
  const c = S.cfg, m = a.mgr, key = JSON.stringify(c);
  if (!mcCache.has(key)) { if (mcCache.size > 20) mcCache.clear(); mcCache.set(key, E.monteCarlo(c, a)); }
  const mc = mcCache.get(key);
  const pl = [['Foreman commission', m.revenue, 's1'], ['Expected default loss', -m.expectedLoss, 's2'], ['Payment fees', -m.processing, 's2'], ['Operations', -m.ops, 's2'], ['Acquisition', -m.acquisition, 's2']];
  const scale = Math.max(m.revenue, 1);
  const plHtml = pl.map(([l, v, k]) => `<div class="hb"><span>${l}</span><div class="tr"><div class="fill" style="width:${Math.min(100, (Math.abs(v) / scale) * 100)}%;background:var(--${k})"></div></div><b>${inr(v)}</b></div>`).join('')
    + `<div class="hb"><span><b>Net margin</b></span><div class="tr"><div class="fill" style="width:${Math.max(0, Math.min(100, (m.margin / scale) * 100))}%;background:var(--ink)"></div></div><b class="${m.margin < 0 ? 'neg' : ''}">${inr(m.margin)}</b></div>`;
  const expo = bars({ data: m.exposure.map((e, i) => ({ label: i + 1, v: (e * c.coverPct) / 100, v2: (e * (100 - c.coverPct)) / 100, tip: `<b>After month ${i + 1}</b>\nPrized members still owe ${inr(e)}\nCovered by security ${inr((e * c.coverPct) / 100)}\nUncovered ${inr((e * (100 - c.coverPct)) / 100)}` })), cls: 'f3', cls2: 'f2', yFmt: fmtShort });
  const hist = histogram({ hist: mc.hist, lo: mc.lo, width: mc.width, xFmt: fmtShort, markers: [{ v: mc.p5, label: 'P5' }, { v: mc.p50, label: 'P50' }, { v: mc.p95, label: 'P95' }],
    tip: (i, n) => `<b>${fmtShort(mc.lo + mc.width * i)} to ${fmtShort(mc.lo + mc.width * (i + 1))}</b>\n${((n / mc.trials) * 100).toFixed(1)}% of ${mc.trials} runs` });
  const hp = a.healthParts, parts = [['Payment reliability', hp.payment, '30%'], ['Saver benefit', hp.saver, '25%'], ['Liquidity mix', hp.liquidity, '20%'], ['Manager margin', hp.margin, '15%'], ['Fairness', hp.fairness, '10%'], ['Ticket concentration', hp.concentration, 'info']];
  return `<div class="grid3">
  ${[['Net margin', inr(m.margin), `${pct(m.marginPct, 2)} of volume`], ['Per ₹1 Cr of chit volume', fmtShort(m.perCr), 'Compare across schemes'], ['Return on security', pct(m.roe, 0), `p.a. on ${inr(m.capital)}`]].map(([k, v, n]) => `<div class="card kpi"><div class="k">${k}</div><div class="v sm">${v}</div><div class="n">${n}</div></div>`).join('')}</div>
  <div class="grid2"><div class="card"><h2>Group P&amp;L</h2><div class="sub">Per chit group over ${c.months} months.</div><div class="bars">${plHtml}</div>
    ${note(`<b>Break-even default rate: ${m.breakEvenDefault > 100 ? 'above 100%' : pct(m.breakEvenDefault, 1)}</b> of prized members. Above this the group loses money (security cover ${c.coverPct}%).`)}</div>
  <div class="card"><h2>Group health ${a.health}<span class="mute" style="font-size:12px"> / 100</span></h2><div class="sub">Heuristic blend of payment, saver benefit, liquidity mix, margin and fairness.</div><div class="bars">
    ${parts.map(([l, v, w]) => `<div class="hb"><span>${l}<small class="mute"> ${w === 'info' ? '' : w}</small></span><div class="tr"><div class="fill" style="width:${v}%;background:var(--s1)"></div></div><b>${Math.round(v)}</b></div>`).join('')}</div></div></div>
  <div class="grid2"><div class="card"><h2>Prized-member exposure</h2><div class="sub">Dues still owed by members who already took the pot. Peak ${inr(m.peakExposure)}.</div>${expo}${legend([{ v: 's3', t: 'Covered by security' }, { v: 's2', t: 'Uncovered' }])}</div>
  <div class="card"><h2>Margin under random defaults</h2><div class="sub">${mc.trials} simulated groups, each prized member defaulting with ${c.defaultPct}% chance.</div>${hist}
    <div class="row"><span>Typical (P50)</span><b>${inr(mc.p50)}</b></div><div class="row"><span>Bad case (P5)</span><b class="${mc.p5 < 0 ? 'neg' : ''}">${inr(mc.p5)}</b></div><div class="row"><span>Chance the group loses money</span><b>${(mc.probLoss * 100).toFixed(1)}%</b></div></div></div>`;
}

function viewCompare() {
  const c = S.cfg, grid = E.sweep(c), cmpCols = SCHEMES.map((s) => ({ name: s.name, a: E.analyze({ ...E.withScheme(c, s.id), ticket: c.ticket }) }))
    .concat(S.pinned.map((p) => ({ name: p.label, pin: p.id, a: E.analyze(mergeCfg(p.cfg)) })));
  const bestHealth = Math.max(...cmpCols.map((x) => x.a.health));
  const R = [['Duration', (a) => `${a.sim.T} months`], ['Members', (a) => a.alloc.M], ['Gross chit', (a) => fmtShort(a.C)], ['Members pay', (a) => `${fmtShort(a.effMin)}–${fmtShort(a.effMax)}`],
    ['Early cost p.a.', (a) => rate(a.early.irr)], ['Saver yield p.a.', (a) => rate(a.saver.irr)], ['Foreman revenue', (a) => fmtShort(a.mgr.revenue)], ['Net margin', (a) => fmtShort(a.mgr.margin)],
    ['Margin / ₹1 Cr', (a) => fmtShort(a.mgr.perCr)], ['Return on security', (a) => pct(a.mgr.roe, 0)], ['Group health', (a) => a.health], ['Verdict', (a) => `<span class="tag">${{ good: '✓ Balanced', warn: '! Workable', bad: '✕ Off balance' }[a.winWin]}</span>`]];
  const M = { perCr: ['Manager margin per ₹1 Cr', (a) => a.mgr.perCr, fmtShort, false], roe: ['Return on foreman security p.a.', (a) => a.mgr.roe, (v) => pct(v, 0), false], saver: ['Saver yield p.a.', (a) => a.saver.irr, rate, false], early: ['Early-access cost p.a. (lower is better)', (a) => a.early.irr, rate, true], health: ['Group health', (a) => a.health, (v) => v, false] };
  const [, f, fmt, lowBetter] = M[S.metric];
  const vals = grid.flat().map((a) => f(a)).filter((v) => v != null && isFinite(v)), vmin = Math.min(...vals), vmax = Math.max(...vals);
  const cells = SCHEMES.map((s, ri) => `<div class="rh">${s.name}<small>${s.months}m</small></div>` + TICKETS.map((t, ci) => {
    const a = grid[ri][ci], v = f(a), out = t < s.min || t > s.max, cur = s.id === c.scheme && t === c.ticket;
    let k = vmax > vmin && v != null ? (v - vmin) / (vmax - vmin) : 0; if (lowBetter) k = 1 - k;
    const neg = v != null && v < 0;
    return `<div class="hc ${out ? 'out' : ''} ${neg ? 'neg' : ''} ${cur ? 'cur' : ''}" style="--a:${Math.round(8 + k * 52)}%" data-tip="${esc(`${s.name} · ${fmtShort(t)}/month\nChit ${fmtShort(a.C)}\n${M[S.metric][0]}: ${v == null ? '—' : fmt(v)}\nEarly ${rate(a.early.irr)} · Saver ${rate(a.saver.irr)}\nMargin ${fmtShort(a.mgr.margin)}${out ? '\n(outside this scheme’s usual range)' : ''}`)}">${v == null ? '—' : fmt(v)}<em class="${a.winWin}">${ICON[a.winWin]}</em></div>`;
  }).join('')).join('');
  return `<div class="card"><h2>Schemes side by side at ${inr(c.ticket)} / month</h2><div class="sub">Uses your current auction, commission and cost assumptions. Pin scenarios with the button above to add columns.</div><div class="tw"><table><thead><tr><th></th>${cmpCols.map((x) => `<th><div class="pinhead">${esc(x.name)}${x.pin ? `<button data-unpin="${x.pin}" aria-label="Remove">✕</button>` : ''}</div></th>`).join('')}</tr></thead><tbody>
    ${R.map(([l, fn]) => `<tr style="cursor:default"><td>${l}</td>${cmpCols.map((x) => `<td class="${l === 'Group health' && x.a.health === bestHealth ? 'pos' : ''}">${fn(x.a)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
  <div class="card" style="margin-top:14px"><h2>Scheme × ticket heatmap</h2><div class="sub">${M[S.metric][0]}. ✓ balanced, ! workable, ✕ off balance. Hatched cells are outside a scheme’s usual ticket range.</div>
    <div class="seg" style="margin-bottom:12px;max-width:640px;flex-wrap:wrap">${Object.entries(M).map(([k, v]) => `<button data-metric="${k}" aria-pressed="${S.metric === k}">${v[0].split(' (')[0]}</button>`).join('')}</div>
    <div class="tw"><div class="heat"><div></div>${TICKETS.map((t) => `<div class="hh">${fmtShort(t)}</div>`).join('')}${cells}</div></div></div>`;
}

// ---------- render ----------
let A;
function render() {
  A = E.analyze(S.cfg);
  renderHero(A); renderTabs();
  const v = { lab: viewLab, auctions: viewAuctions, member: viewMember, manager: viewManager, compare: viewCompare }[S.tab] || viewLab;
  $('#view').innerHTML = v(A);
  if (S.tab === 'member') paintMember(A);
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-sel],[data-metric],[data-unpin]'); if (!t) return;
  const d = t.dataset;
  if (d.tab) { S.tab = d.tab; persist(); render(); }
  else if (d.sel) { S.sel = +d.sel; render(); }
  else if (d.metric) { S.metric = d.metric; render(); }
  else if (d.unpin) { S.pinned = S.pinned.filter((p) => String(p.id) !== d.unpin); persist(); render(); }
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id !== 'need' && el.id !== 'bid') return;
  fillPct(el);
  if (el.id === 'need') { S.need = +el.value; S.cfg = { ...S.cfg, override: null }; render(); $('#need').focus(); }
  else { S.cfg = { ...S.cfg, override: { month: S.need ?? A.earlyW, pct: +el.value } }; A = E.analyze(S.cfg); renderHero(A); paintMember(A); }
});

// tooltip
const tip = $('#tip');
document.addEventListener('pointermove', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { tip.classList.remove('on'); return; }
  tip.innerHTML = t.dataset.tip.split('\n').map((l, i) => (i === 0 ? l : esc(l))).join('<br>');
  const w = tip.offsetWidth, x = Math.min(innerWidth - w - 8, e.clientX + 14);
  tip.style.left = `${Math.max(8, x)}px`; tip.style.top = `${e.clientY + 16 + tip.offsetHeight > innerHeight ? e.clientY - tip.offsetHeight - 12 : e.clientY + 16}px`;
  tip.classList.add('on');
});
document.addEventListener('pointerleave', () => tip.classList.remove('on'));

// header actions
$('#pin').onclick = () => {
  if (S.pinned.length >= 4) return toast('Up to 4 pinned scenarios. Remove one in Compare.');
  const c = S.cfg;
  S.pinned.push({ id: Date.now(), label: `${schemeName(c)} ${fmtShort(c.ticket)} ${c.heat === 'custom' ? 'custom' : HEATS[c.heat].label} ${c.commissionPct}%`, cfg: c });
  persist(); toast('Pinned. Open Compare to see it.'); if (S.tab === 'compare') render();
};
$('#share').onclick = async () => {
  const url = `${location.origin}${location.pathname}#c=${encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(S.cfg)))))}`;
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { prompt('Copy this link', url); }
};
$('#theme').onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; try { localStorage.setItem('chit-lab:theme', next); } catch {}
};
try { const th = localStorage.getItem('chit-lab:theme'); if (th) document.documentElement.dataset.theme = th; } catch {}

// boot
buildControls(); wireControls();
$('#controls').open = matchMedia('(min-width:1021px)').matches;
sync(); render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
