import '@fontsource/noto-nastaliq-urdu/400.css';
import '@fontsource/noto-nastaliq-urdu/700.css';
import './style.css';
import { Chart, registerables } from 'chart.js';
import { STR } from './i18n.js';
import { shareAsImage, downloadPdf, shareLink } from './share.js';

Chart.register(...registerables);
Chart.defaults.animation = false;
Chart.defaults.font.family = 'system-ui, sans-serif';

// ---------------------------------------------------------------- config
const IS_WEB = !window.Capacitor?.isNativePlatform?.();
const DATA_BASE = import.meta.env.VITE_DATA_BASE || './';
const SHARE_BASE =
  import.meta.env.VITE_SHARE_BASE || (IS_WEB ? location.origin + location.pathname : DATA_BASE);

// ---------------------------------------------------------------- state
const state = {
  lang: localStorage.getItem('lang') || 'ur',
  mode: localStorage.getItem('mode') || 'auto', // 'w' mandi, 'r' retail, 'auto'
  range: 7,
  data: null,
  latestDate: null,
  offline: false,
  filter: 'all',
  query: '',
  compare: JSON.parse(localStorage.getItem('compare') || '["tomato","onion","potato"]'),
};
let charts = [];

const t = (k) => STR[state.lang][k] ?? k;
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------- data
async function loadData(date) {
  const file = date ? `data/snapshots/${date}.json` : 'data/latest.json';
  const cacheKey = 'data:' + (date || 'latest');
  try {
    const res = await fetch(`${DATA_BASE}${file}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    try { localStorage.setItem(cacheKey, JSON.stringify(json)); } catch {}
    state.offline = false;
    return json;
  } catch (e) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) { state.offline = true; return JSON.parse(cached); }
    if (DATA_BASE !== './') {
      try {
        const bundled = await fetch(`./${file}`);
        if (bundled.ok) { state.offline = true; return await bundled.json(); }
      } catch {}
    }
    if (date) return loadData(null);
    throw e;
  }
}

function effMode() {
  if (state.mode !== 'auto') return state.mode;
  const d = state.data;
  if (!d) return 'r';
  const hasW = d.items.some((i) => i.w != null);
  const hasR = d.items.some((i) => i.r != null);
  return hasW && !hasR ? 'w' : hasR ? 'r' : 'w';
}
const pv = (o, m = effMode()) => (o ? (m === 'w' ? o.w ?? o.r : o.r ?? o.w) : null);
const prevPv = (it, m = effMode()) => (m === 'w' ? it.pw ?? it.pr : it.pr ?? it.pw);

function change(it) {
  const now = pv(it), prev = prevPv(it);
  if (now == null || prev == null) return { diff: null, pct: null, dir: prev == null && now != null ? 'new' : 'none' };
  const diff = Math.round((now - prev) * 100) / 100;
  const pct = prev ? (diff / prev) * 100 : 0;
  return { diff, pct, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same' };
}

function seriesFor(it, days) {
  const s = (it.series || []).filter((p) => pv(p) != null);
  return days ? s.slice(-days) : s;
}

function change7(it) {
  const s = seriesFor(it, 8);
  if (s.length < 2) return null;
  const a = pv(s[0]), b = pv(s[s.length - 1]);
  return a ? { diff: b - a, pct: ((b - a) / a) * 100, from: s[0].d } : null;
}

const name = (it) => (state.lang === 'ur' ? it.ur || it.en : it.en || it.ur);
const altName = (it) => (state.lang === 'ur' ? it.en : it.ur);
const unit = (it) => t('perUnit')[it.unit] || it.unit || '';
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 }));
const money = (n) => (n == null ? '—' : state.lang === 'ur' ? `${num(n)} روپے` : `Rs ${num(n)}`);
const pctTxt = (p) => (p == null ? '' : `${p > 0 ? '+' : ''}${p.toFixed(1)}%`);

function fmtDate(d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return new Intl.DateTimeFormat(state.lang === 'ur' ? 'ur-PK' : 'en-GB', { ...opts, numberingSystem: 'latn' }).format(dt);
}
const shortDate = (d) => fmtDate(d, { day: 'numeric', month: 'short' });

function badge(ch) {
  if (ch.dir === 'up') return `<span class="chg up">▲ ${num(Math.abs(ch.diff))} <small>${pctTxt(ch.pct)}</small></span>`;
  if (ch.dir === 'down') return `<span class="chg down">▼ ${num(Math.abs(ch.diff))} <small>${pctTxt(ch.pct)}</small></span>`;
  if (ch.dir === 'new') return `<span class="chg new">${t('newItem')}</span>`;
  if (ch.dir === 'same') return `<span class="chg same">● ${t('noChange')}</span>`;
  return `<span class="chg same">—</span>`;
}

function sparkline(it, days = 7) {
  const s = seriesFor(it, days).map((p) => pv(p));
  if (s.length < 2) return '<svg class="spark"></svg>';
  const min = Math.min(...s), max = Math.max(...s);
  const w = 70, h = 26, span = max - min || 1;
  const pts = s.map((v, i) => `${(i / (s.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ');
  const col = s[s.length - 1] > s[0] ? '#d32f2f' : s[s.length - 1] < s[0] ? '#2e7d32' : '#888';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" dir="ltr"><polyline fill="none" stroke="${col}" stroke-width="2" points="${pts}"/></svg>`;
}

function alertsFor(id) {
  const base = id.split('_')[0];
  return (state.data?.alerts || []).filter((a) =>
    (a.items || []).some((x) => x === 'all' || x === id || x === base || x.split('_')[0] === base),
  );
}

// ---------------------------------------------------------------- shell
function shell(inner, active) {
  const d = state.data;
  return `
  <header class="top">
    <div class="brand"><span class="logo">🥬</span><div><b>${t('appName')}</b>
      <small>${d ? fmtDate(d.date) : ''}</small></div></div>
    <div class="top-actions">
      <button class="pill" data-act="lang">${t('langSwitch')}</button>
      <button class="icon" data-act="refresh" title="${t('refresh')}">⟳</button>
    </div>
  </header>
  ${state.offline ? `<div class="banner warn">${t('offline')}</div>` : ''}
  <main>${inner}</main>
  <nav class="tabs">
    ${[['report', '📋', 'tabReport'], ['prices', '🥕', 'tabPrices'], ['alerts', '⚠️', 'tabAlerts'], ['compare', '📈', 'tabCompare']]
      .map(([r, ic, k]) => `<a href="#/${r}" class="${active === r ? 'on' : ''}"><span>${ic}</span>${t(k)}${
        r === 'alerts' && d?.alerts?.filter((a) => a.level === 'high').length ? `<i class="dot"></i>` : ''}</a>`).join('')}
  </nav>`;
}

function modeToggle() {
  const m = effMode();
  const d = state.data;
  const hasW = d.items.some((i) => i.w != null), hasR = d.items.some((i) => i.r != null);
  if (!(hasW && hasR)) return '';
  return `<div class="seg no-capture">
    <button data-mode="w" class="${m === 'w' ? 'on' : ''}">${t('mandi')}</button>
    <button data-mode="r" class="${m === 'r' ? 'on' : ''}">${t('retail')}</button></div>`;
}

function sourceBadge() {
  const s = state.data.source || {};
  return `<div class="source">✅ ${t('verifiedSource')}: <b>${esc(state.lang === 'ur' ? s.name_ur || s.name_en : s.name_en || s.name_ur)}</b>
    ${s.date ? `<span>(${fmtDate(s.date)})</span>` : ''}</div>`;
}

function actionBar(kind) {
  return `<div class="actions no-capture">
    <button class="btn pdf" data-act="pdf" data-kind="${kind}">📄 ${t('pdf')}</button>
    <button class="btn wa" data-act="img" data-kind="${kind}">🟢 ${t('shareImage')}</button>
    <button class="btn link" data-act="link" data-kind="${kind}">🔗 ${t('shareLink')}</button>
  </div>`;
}

// ---------------------------------------------------------------- views
function viewReport() {
  const d = state.data;
  const items = d.items.filter((i) => pv(i) != null);
  const withCh = items.map((i) => ({ it: i, ch: change(i) }));
  const ups = withCh.filter((x) => x.ch.dir === 'up').sort((a, b) => b.ch.pct - a.ch.pct);
  const downs = withCh.filter((x) => x.ch.dir === 'down').sort((a, b) => a.ch.pct - b.ch.pct);
  const same = withCh.filter((x) => x.ch.dir === 'same');
  const r = d.report || {};
  const L = state.lang;
  const summary = r[`summary_${L}`];
  const points = r[`points_${L}`] || [];
  const advice = r[`advice_${L}`];
  const topAlerts = (d.alerts || []).filter((a) => a.level !== 'low').slice(0, 4);

  const row = ({ it, ch }) => `<a class="mini" href="#/item/${it.id}"><span>${esc(name(it))}</span>
      <span class="muted">${num(prevPv(it))} → <b>${num(pv(it))}</b></span>${badge(ch)}</a>`;

  return `
  ${modeToggle()}
  <section id="capture" class="sheet">
    <div id="capture-top">
      <div class="sheet-head">
        <div class="title">📋 ${t('morningReport')}</div>
        <div class="date">${fmtDate(d.date)}</div>
        ${sourceBadge()}
        ${d.prevDate ? `<div class="muted small">${t('comparedWith')}: ${fmtDate(d.prevDate)} ${t('with')} · ${effMode() === 'w' ? t('mandi') : t('retail')}</div>` : ''}
      </div>
      ${d.stale ? `<div class="banner warn">${t('stale')}</div>` : ''}
      <div class="stats">
        <div class="stat up"><b>${ups.length}</b><span>▲ ${t('wentUp')}</span></div>
        <div class="stat down"><b>${downs.length}</b><span>▼ ${t('wentDown')}</span></div>
        <div class="stat same"><b>${same.length}</b><span>● ${t('same')}</span></div>
      </div>
      ${summary ? `<div class="card summary"><p>${esc(summary)}</p>
        ${points.length ? `<ul>${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        ${advice ? `<p class="advice">💡 <b>${t('advice')}:</b> ${esc(advice)}</p>` : ''}</div>` : ''}
      ${ups.length ? `<div class="card"><h3 class="red">▲ ${t('topRisers')}</h3>${ups.slice(0, 6).map(row).join('')}</div>` : ''}
      ${downs.length ? `<div class="card"><h3 class="green">▼ ${t('topFallers')}</h3>${downs.slice(0, 6).map(row).join('')}</div>` : ''}
      <div class="card"><h3>⚠️ ${t('alerts')}</h3>
        ${topAlerts.length ? topAlerts.map(alertCard).join('') : `<p class="muted">${t('noAlerts')}</p>`}</div>
    </div>
    <div class="card"><h3>📊 ${t('allRates')}</h3>${ratesTable(items)}</div>
    ${sheetFoot()}
  </section>
  ${actionBar('report')}
  ${archivePicker()}`;
}

function ratesTable(items) {
  const cats = [['veg', t('veg')], ['fruit', t('fruit')]];
  const other = items.filter((i) => i.cat !== 'veg' && i.cat !== 'fruit');
  const block = (title, arr) => !arr.length ? '' : `
    <table class="rates"><thead><tr><th>${title}</th><th>${t('yesterday')}</th><th>${t('today')}</th><th>${t('change')}</th></tr></thead>
    <tbody>${arr.map((it) => { const ch = change(it); return `<tr data-href="#/item/${it.id}">
      <td>${esc(name(it))}<small> ${unit(it)}</small></td><td>${num(prevPv(it))}</td><td><b>${num(pv(it))}</b></td>
      <td class="${ch.dir}">${ch.dir === 'up' ? '▲' : ch.dir === 'down' ? '▼' : ''} ${ch.diff ? num(Math.abs(ch.diff)) : ch.dir === 'new' ? t('newItem') : '—'}</td></tr>`; }).join('')}
    </tbody></table>`;
  return cats.map(([c, title]) => block(title, items.filter((i) => i.cat === c))).join('') + block(t('item'), other);
}

function sheetFoot() {
  const s = state.data.source || {};
  return `<div class="sheet-foot">
    ${s.url ? `<div>${t('sources')}: <span dir="ltr">${esc(s.page || s.url)}</span></div>` : ''}
    <div>${t('updated')}: ${new Date(state.data.generatedAt || Date.now()).toLocaleString(state.lang === 'ur' ? 'ur-PK' : 'en-GB', { timeZone: 'Asia/Karachi', numberingSystem: 'latn' })}</div>
    <div>🥬 ${t('appName')}</div></div>`;
}

function archivePicker() {
  const dates = state.data.snapshots || [];
  if (dates.length < 2) return '';
  return `<div class="card no-capture"><label>🗓️ ${t('oldReports')}:
    <select data-act="archive">${dates.slice().reverse().map((d) => `<option value="${d}" ${d === state.data.date ? 'selected' : ''}>${fmtDate(d)}</option>`).join('')}</select></label></div>`;
}

function filteredPriceItems() {
  const d = state.data;
  const q = state.query.trim().toLowerCase();
  let items = d.items.filter((i) => pv(i) != null);
  if (state.filter === 'veg' || state.filter === 'fruit') items = items.filter((i) => i.cat === state.filter);
  if (state.filter === 'up') items = items.filter((i) => change(i).dir === 'up').sort((a, b) => change(b).pct - change(a).pct);
  if (state.filter === 'down') items = items.filter((i) => change(i).dir === 'down').sort((a, b) => change(a).pct - change(b).pct);
  if (q) items = items.filter((i) => `${i.en} ${i.ur} ${i.id}`.toLowerCase().includes(q));
  return items;
}

function priceListHtml() {
  return filteredPriceItems().map((it) => `
    <a class="row" href="#/item/${it.id}">
      <div class="nm"><b>${esc(name(it))}</b><small>${esc(altName(it))} · ${unit(it)}</small></div>
      ${sparkline(it)}
      <div class="pr"><b>${money(pv(it))}</b>${badge(change(it))}</div>
    </a>`).join('') || `<p class="muted center">—</p>`;
}

function viewPrices() {
  const chip = (k, label) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-filter="${k}">${label}</button>`;
  return `
  ${modeToggle()}
  <div class="searchbar"><input id="q" type="search" placeholder="${t('search')}" value="${esc(state.query)}"></div>
  <div class="chips">${chip('all', t('all'))}${chip('veg', '🥦 ' + t('veg'))}${chip('fruit', '🍎 ' + t('fruit'))}${chip('up', '▲ ' + t('up'))}${chip('down', '▼ ' + t('down'))}</div>
  <p class="hint">👆 ${t('tapForGraph')}</p>
  <div class="list">${priceListHtml()}</div>`;
}

function viewItem(id) {
  const d = state.data;
  const it = d.items.find((i) => i.id === id);
  if (!it) return `<p class="muted center">—</p>`;
  const ch = change(it), c7 = change7(it);
  const s = seriesFor(it, state.range);
  const vals = s.map((p) => pv(p));
  const hi = vals.length ? Math.max(...vals) : null, lo = vals.length ? Math.min(...vals) : null;
  const hiD = s.find((p) => pv(p) === hi)?.d, loD = s.find((p) => pv(p) === lo)?.d;
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const related = alertsFor(id);
  const rangeBtn = (n, k) => `<button data-range="${n}" class="${state.range === n ? 'on' : ''}">${t(k)}</button>`;
  return `
  ${modeToggle()}
  <section id="capture" class="sheet">
    <div class="sheet-head">
      <div class="title">${esc(name(it))} <small>${esc(altName(it))}</small></div>
      <div class="date">${fmtDate(d.date)} · ${unit(it)}</div>
      ${sourceBadge()}
    </div>
    <div class="bigprice">
      <div><span class="muted">${t('today')}</span><b>${money(pv(it))}</b></div>
      ${it.w != null && it.r != null ? `<div class="both"><span>${t('mandi')}: <b>${num(it.w)}</b></span><span>${t('retail')}: <b>${num(it.r)}</b></span></div>` : ''}
      <div class="chgs"><div>${t('vsYesterday')}<br>${badge(ch)}</div>
        <div>${t('in7days')}<br>${c7 ? badge({ diff: c7.diff, pct: c7.pct, dir: c7.diff > 0 ? 'up' : c7.diff < 0 ? 'down' : 'same' }) : '—'}</div></div>
    </div>
    <div class="seg no-capture">${rangeBtn(7, 'days7')}${rangeBtn(15, 'days15')}${rangeBtn(30, 'days30')}</div>
    <div class="chartbox" dir="ltr">${s.length >= 2 ? '<canvas id="itemChart"></canvas>' : `<p class="muted center">${t('noHistory')}</p>`}</div>
    <div class="stats three">
      <div class="stat up"><b>${num(hi)}</b><span>${t('highest')}<br><small>${hiD ? shortDate(hiD) : ''}</small></span></div>
      <div class="stat down"><b>${num(lo)}</b><span>${t('lowest')}<br><small>${loD ? shortDate(loD) : ''}</small></span></div>
      <div class="stat same"><b>${num(avg)}</b><span>${t('avg')}</span></div>
    </div>
    <div class="card"><h3>🗓️ ${t('dailyRates')}</h3>
      <table class="rates"><thead><tr><th>${t('date')}</th>${it.series?.some((p) => p.w != null) ? `<th>${t('mandi')}</th>` : ''}${it.series?.some((p) => p.r != null) ? `<th>${t('retail')}</th>` : ''}<th>${t('change')}</th></tr></thead>
      <tbody>${s.slice().reverse().map((p, i, arr) => {
        const prev = arr[i + 1]; const dv = prev ? pv(p) - pv(prev) : null;
        const cls = dv > 0 ? 'up' : dv < 0 ? 'down' : 'same';
        return `<tr><td>${shortDate(p.d)}</td>${it.series.some((x) => x.w != null) ? `<td>${num(p.w)}</td>` : ''}${it.series.some((x) => x.r != null) ? `<td>${num(p.r)}</td>` : ''}
          <td class="${cls}">${dv == null ? '' : dv > 0 ? `▲ ${num(dv)}` : dv < 0 ? `▼ ${num(-dv)}` : '●'}</td></tr>`; }).join('')}</tbody></table></div>
    ${related.length ? `<div class="card"><h3>⚠️ ${t('relatedAlerts')}</h3>${related.map(alertCard).join('')}</div>` : ''}
    ${sheetFoot()}
  </section>
  ${actionBar('item')}`;
}

function alertCard(a) {
  const L = state.lang;
  const items = (a.items || []).map((x) => {
    const it = state.data.items.find((i) => i.id === x);
    return it ? `<a class="tag" href="#/item/${it.id}">${esc(name(it))}</a>` : `<span class="tag">${esc(x === 'all' ? t('all') : x)}</span>`;
  }).join('');
  return `<div class="alert ${a.level}">
    <div class="lvl">${a.level === 'high' ? '🔴' : a.level === 'medium' ? '🟠' : '🟢'} ${t('level')[a.level] || a.level}</div>
    <b>${esc(a[`title_${L}`] || a.title_en)}</b>
    <p>${esc(a[`summary_${L}`] || a.summary_en)}</p>
    ${a[`expected_effect_${L}`] ? `<p class="exp">📌 ${t('expected')}: ${esc(a[`expected_effect_${L}`])}</p>` : ''}
    <div class="tags">${items}</div>
    ${(a.sources || []).length ? `<details class="no-capture"><summary>${t('sources')} (${a.sources.length})</summary>
      ${a.sources.map((s) => `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} <small>— ${esc(s.publisher)}</small></a>`).join('')}</details>` : ''}
  </div>`;
}

function viewAlerts() {
  const d = state.data;
  const news = d.news || [];
  return `
  <section id="capture" class="sheet">
    <div class="sheet-head"><div class="title">⚠️ ${t('alerts')}</div><div class="date">${fmtDate(d.date)}</div></div>
    ${(d.alerts || []).length ? d.alerts.map(alertCard).join('') : `<p class="muted center">${t('noAlerts')}</p>`}
    ${sheetFoot()}
  </section>
  ${actionBar('alerts')}
  ${news.length ? `<div class="card"><h3>📰 ${t('news')}</h3>${news.map((n) => `
    <a class="src" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}<small> — ${esc(n.publisher)}, ${shortDate(n.date.slice(0, 10))}</small></a>`).join('')}</div>` : ''}`;
}

function viewCompare() {
  const d = state.data;
  const items = d.items.filter((i) => pv(i) != null);
  const sel = state.compare.filter((id) => items.some((i) => i.id === id));
  const rangeBtn = (n, k) => `<button data-range="${n}" class="${state.range === n ? 'on' : ''}">${t(k)}</button>`;
  const hasHistory = (d.dates || []).length >= 2;
  return `
  ${modeToggle()}
  <p class="hint">${t('compareHint')}</p>
  <div class="chips wrap">${items.map((i) => `<button class="chip ${sel.includes(i.id) ? 'on' : ''}" data-cmp="${i.id}">${esc(name(i))}</button>`).join('')}</div>
  <section id="capture" class="sheet">
    <div class="sheet-head"><div class="title">📈 ${t('tabCompare')}</div><div class="date">${fmtDate(d.date)}</div></div>
    <div class="seg no-capture">${rangeBtn(7, 'days7')}${rangeBtn(15, 'days15')}${rangeBtn(30, 'days30')}</div>
    <div class="chartbox tall" dir="ltr">${hasHistory ? '<canvas id="cmpChart"></canvas>' : `<p class="muted center">${t('noHistory')}</p>`}</div>
    <table class="rates"><thead><tr><th>${t('item')}</th><th>${t('yesterday')}</th><th>${t('today')}</th><th>${t('in7days')}</th></tr></thead>
    <tbody>${sel.map((id) => { const it = items.find((i) => i.id === id); const c7 = change7(it);
      return `<tr data-href="#/item/${id}"><td>${esc(name(it))}</td><td>${num(prevPv(it))}</td><td><b>${num(pv(it))}</b></td>
      <td class="${c7?.diff > 0 ? 'up' : c7?.diff < 0 ? 'down' : ''}">${c7 ? pctTxt(c7.pct) : '—'}</td></tr>`; }).join('')}</tbody></table>
    ${sheetFoot()}
  </section>
  ${actionBar('compare')}`;
}

// ---------------------------------------------------------------- charts
const PALETTE = ['#2e7d32', '#d32f2f', '#1565c0', '#ef6c00', '#6a1b9a'];

function drawCharts(route) {
  charts.forEach((c) => c.destroy());
  charts = [];
  const rtl = state.lang === 'ur';
  if (route.name === 'item') {
    const cv = $('#itemChart');
    const it = state.data.items.find((i) => i.id === route.id);
    if (!cv || !it) return;
    const s = seriesFor(it, state.range);
    const ds = [];
    if (s.some((p) => p.w != null)) ds.push({ label: t('mandi'), data: s.map((p) => p.w), borderColor: '#ef6c00', backgroundColor: '#ef6c0022' });
    if (s.some((p) => p.r != null)) ds.push({ label: t('retail'), data: s.map((p) => p.r), borderColor: '#2e7d32', backgroundColor: '#2e7d3222' });
    ds.forEach((x) => Object.assign(x, { fill: ds.length === 1, tension: 0.25, pointRadius: 4, borderWidth: 3, spanGaps: true,
      pointBackgroundColor: x.data.map((v, i) => (i && v != null && x.data[i - 1] != null ? (v > x.data[i - 1] ? '#d32f2f' : v < x.data[i - 1] ? '#2e7d32' : '#888') : '#888')) }));
    charts.push(new Chart(cv, {
      type: 'line',
      data: { labels: s.map((p) => shortDate(p.d)), datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { rtl, display: ds.length > 1 }, tooltip: { rtl } },
        scales: { y: { beginAtZero: false, ticks: { callback: (v) => num(v) } } } },
    }));
  }
  if (route.name === 'compare') {
    const cv = $('#cmpChart');
    if (!cv) return;
    const items = state.compare.map((id) => state.data.items.find((i) => i.id === id)).filter(Boolean);
    const dates = (state.data.dates || []).slice(-state.range);
    charts.push(new Chart(cv, {
      type: 'line',
      data: { labels: dates.map(shortDate), datasets: items.map((it, k) => {
        const map = Object.fromEntries((it.series || []).map((p) => [p.d, pv(p)]));
        return { label: name(it), data: dates.map((d) => map[d] ?? null), borderColor: PALETTE[k % 5], backgroundColor: PALETTE[k % 5],
          tension: 0.25, pointRadius: 3, borderWidth: 3, spanGaps: true };
      }) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { rtl, position: 'bottom' }, tooltip: { rtl } } },
    }));
  }
}

// ---------------------------------------------------------------- router
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(qs || '');
  return { name: parts[0] || 'report', id: parts[1] ? decodeURIComponent(parts[1]) : null, date: params.get('d') };
}

async function render() {
  const app = $('#app');
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ur' ? 'rtl' : 'ltr';
  document.title = t('appName');
  const route = parseRoute();

  const wantDate = route.date || null;
  if (!state.data || (wantDate && wantDate !== state.data.date) || (!wantDate && state.latestDate && state.data.date !== state.latestDate)) {
    app.innerHTML = shell(`<div class="loading">${t('loading')}</div>`, route.name);
    try {
      state.data = await loadData(wantDate);
      if (!wantDate) state.latestDate = state.data.date;
    } catch (e) {
      app.innerHTML = shell(`<div class="card center"><p>${t('noData')}</p><button class="btn" data-act="refresh">⟳ ${t('refresh')}</button></div>`, route.name);
      return;
    }
  }
  if (!state.data?.items?.length) {
    app.innerHTML = shell(`<div class="card center"><p>${t('noData')}</p></div>`, route.name);
    return;
  }
  const views = { report: viewReport, prices: viewPrices, item: () => viewItem(route.id), alerts: viewAlerts, compare: viewCompare };
  const active = route.name === 'item' ? 'prices' : route.name;
  app.innerHTML = shell((views[route.name] || viewReport)(), active);
  drawCharts(route);
  if (route.name === 'item') window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- events
function shareMeta() {
  const route = parseRoute();
  const d = state.data;
  const date = d.date;
  let path = `#/report?d=${date}`, text = `${t('morningReport')} — ${fmtDate(date)}`, file = `sabzi-report-${date}`;
  if (route.name === 'item') {
    const it = d.items.find((i) => i.id === route.id);
    if (it) {
      path = `#/item/${route.id}?d=${date}`;
      text = `${name(it)} — ${money(pv(it))} ${unit(it)} (${fmtDate(date)})`;
      file = `${route.id}-${date}`;
    }
  } else if (route.name === 'alerts') {
    path = `#/alerts?d=${date}`; text = `${t('alerts')} — ${fmtDate(date)}`; file = `alerts-${date}`;
  } else if (route.name === 'compare') {
    path = `#/compare?d=${date}`; text = `${t('tabCompare')} — ${fmtDate(date)}`; file = `compare-${date}`;
  }
  return { url: SHARE_BASE.replace(/#.*$/, '') + path, text: `🥬 ${t('appName')}\n${text}`, fileName: file };
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

document.addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-href]');
  if (tr && !document.body.classList.contains('capturing')) { location.hash = tr.dataset.href; return; }
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.mode) { state.mode = b.dataset.mode; localStorage.setItem('mode', state.mode); return render(); }
  if (b.dataset.range) { state.range = +b.dataset.range; return render(); }
  if (b.dataset.filter) { state.filter = b.dataset.filter; return render(); }
  if (b.dataset.cmp) {
    const id = b.dataset.cmp;
    state.compare = state.compare.includes(id) ? state.compare.filter((x) => x !== id) : [...state.compare, id].slice(-5);
    localStorage.setItem('compare', JSON.stringify(state.compare));
    return render();
  }
  const act = b.dataset.act;
  if (act === 'lang') { state.lang = state.lang === 'ur' ? 'en' : 'ur'; localStorage.setItem('lang', state.lang); return render(); }
  if (act === 'refresh') { state.data = null; state.latestDate = null; return render(); }
  if (act === 'pdf' || act === 'img' || act === 'link') {
    const meta = shareMeta();
    const old = b.innerHTML;
    b.disabled = true; b.innerHTML = t('generating');
    try {
      if (act === 'pdf') { const where = await downloadPdf($('#capture'), meta); if (where) toast(`${t('saved')} ✓ ${where}`); }
      if (act === 'img') await shareAsImage($('#capture-top') || $('#capture'), meta);
      if (act === 'link') await shareLink(meta);
    } catch (err) {
      console.error(err);
      if (!/cancel/i.test(String(err?.message || err))) toast(t('shareFail'));
    } finally { b.disabled = false; b.innerHTML = old; }
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('select[data-act="archive"]')) {
    const d = e.target.value;
    location.hash = d === state.latestDate ? '#/report' : `#/report?d=${d}`;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    state.query = e.target.value;
    const list = $('.list');
    if (list) list.innerHTML = priceListHtml();
  }
});

window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => {
  // When the app is reopened next morning, fetch fresh data automatically.
  if (document.visibilityState === 'visible' && state.data && !parseRoute().date) {
    const age = Date.now() - new Date(state.data.generatedAt || 0).getTime();
    if (age > 3 * 3600 * 1000) { state.data = null; render(); }
  }
});

render();
