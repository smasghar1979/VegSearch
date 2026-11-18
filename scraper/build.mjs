// Builds latest.json (today vs yesterday, 30-day series per item), the morning report and snapshots.
import fs from 'node:fs';
import path from 'node:path';
import { ITEM_MAP } from './items.mjs';
import { geminiJSON, hasGemini } from './gemini.mjs';

export const DATA_DIR = path.resolve(process.cwd(), 'data');
const DAYS_DIR = path.join(DATA_DIR, 'days');
const SNAP_DIR = path.join(DATA_DIR, 'snapshots');
const SERIES_DAYS = 30;

export function readJSON(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
export function writeJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 1));
}

export function loadDays() {
  if (!fs.existsSync(DAYS_DIR)) return {};
  const out = {};
  for (const f of fs.readdirSync(DAYS_DIR).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f))) {
    const d = readJSON(path.join(DAYS_DIR, f));
    if (d?.items?.length) out[d.date] = d;
  }
  return out;
}

export function saveDay(day) {
  writeJSON(path.join(DAYS_DIR, `${day.date}.json`), day);
}

/** Normalize Gemini output items into stored day items. */
export function normalizeItems(items) {
  const byId = {};
  for (const r of items) {
    const id = String(r.id).toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
    if (!id) continue;
    const isG2 = id.endsWith('_g2') || r.grade === 2;
    const baseId = id.replace(/_g2$/, '');
    const known = ITEM_MAP[baseId];
    const g = isG2 ? 2 : r.grade === 1 ? 1 : null;
    const gUr = g === 2 ? ' (درجہ دوئم)' : g === 1 ? ' (درجہ اول)' : '';
    const gEn = g === 2 ? ' (Grade 2)' : g === 1 ? ' (Grade 1)' : '';
    const it = {
      id,
      en: known ? known.en + gEn : r.name_en,
      ur: known ? known.ur + gUr : r.name_ur,
      cat: known?.cat || r.category || 'veg',
      unit: r.unit || known?.unit || 'kg',
      a: numOrNull(r.auction),
      w: numOrNull(r.wholesale),
      r: numOrNull(r.retail),
    };
    if (!byId[id]) byId[id] = it; // keep first occurrence
  }
  return Object.values(byId);
}
const numOrNull = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.]/g, '')) : v;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

export async function buildLatest({ days, news, today, useAI = true }) {
  const dates = Object.keys(days).sort();
  if (!dates.length) return null;
  const date = dates[dates.length - 1];
  const prevDate = dates.length > 1 ? dates[dates.length - 2] : null;
  const window = dates.slice(-SERIES_DAYS);
  const cur = days[date];
  const prev = prevDate ? days[prevDate] : null;

  // union of items in the window, but only those present in the latest list or in the last 3 lists
  const recent = new Set(window.slice(-3).flatMap((d) => days[d].items.map((i) => i.id)));
  const meta = {};
  for (const d of window) for (const i of days[d].items) meta[i.id] = { ...meta[i.id], ...i };

  const items = [...recent].map((id) => {
    const m = meta[id];
    const t = cur.items.find((i) => i.id === id);
    const p = prev?.items.find((i) => i.id === id);
    const series = window
      .map((d) => { const x = days[d].items.find((i) => i.id === id); return x ? { d, a: x.a ?? null, w: x.w, r: x.r } : null; })
      .filter(Boolean);
    return {
      id, en: m.en, ur: m.ur, cat: m.cat, unit: m.unit,
      a: t?.a ?? null, w: t?.w ?? null, r: t?.r ?? null,
      pa: p?.a ?? null, pw: p?.w ?? null, pr: p?.r ?? null,
      series,
    };
  });
  // vegetables first, then fruits; keep canonical order where possible (grade 1 before grade 2)
  const order = Object.keys(ITEM_MAP);
  const rank = (id) => idx(order, id.replace(/_g2$/, ''));
  items.sort((a, b) => (a.cat === b.cat ? 0 : a.cat === 'veg' ? -1 : 1) || rank(a.id) - rank(b.id) || (a.id.endsWith('_g2') ? 1 : 0) - (b.id.endsWith('_g2') ? 1 : 0));

  const latest = {
    date,
    prevDate,
    today,
    stale: date < today,
    generatedAt: new Date().toISOString(),
    source: cur.source,
    dates: window,
    items,
    alerts: news?.alerts || [],
    news: news?.articles || [],
  };
  latest.report = await makeReport(latest, useAI);
  return latest;
}
const idx = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? 999 : i; };

function priceOf(o, mode) { return mode === 'w' ? o.w ?? o.r : o.r ?? o.w; }

function changeTable(latest) {
  const mode = latest.items.some((i) => i.w != null) ? 'w' : 'r';
  return latest.items.map((it) => {
    const now = priceOf(it, mode), before = mode === 'w' ? it.pw ?? it.pr : it.pr ?? it.pw;
    const s = it.series.map((p) => priceOf(p, mode)).filter((v) => v != null);
    const wk = s.length > 1 ? s[Math.max(0, s.length - 8)] : null;
    return {
      id: it.id, en: it.en, ur: it.ur, unit: it.unit, now, before,
      diff: now != null && before != null ? now - before : null,
      pct: now != null && before ? +(((now - before) / before) * 100).toFixed(1) : null,
      week_pct: now != null && wk ? +(((now - wk) / wk) * 100).toFixed(1) : null,
    };
  });
}

async function makeReport(latest, useAI = true) {
  const rows = changeTable(latest);
  const ups = rows.filter((r) => r.diff > 0).sort((a, b) => b.pct - a.pct);
  const downs = rows.filter((r) => r.diff < 0).sort((a, b) => a.pct - b.pct);
  const fallback = {
    summary_ur: `آج ${ups.length} اشیاء مہنگی، ${downs.length} سستی ہوئیں اور ${rows.length - ups.length - downs.length} کے ریٹ برقرار رہے۔` +
      (ups[0] ? ` سب سے زیادہ اضافہ ${ups[0].ur} میں ہوا (${ups[0].pct}%).` : '') +
      (downs[0] ? ` سب سے زیادہ کمی ${downs[0].ur} میں آئی (${downs[0].pct}%).` : ''),
    summary_en: `Today ${ups.length} items went up, ${downs.length} went down and ${rows.length - ups.length - downs.length} stayed the same.` +
      (ups[0] ? ` Biggest rise: ${ups[0].en} (${ups[0].pct}%).` : '') +
      (downs[0] ? ` Biggest drop: ${downs[0].en} (${downs[0].pct}%).` : ''),
    points_ur: [], points_en: [], advice_ur: '', advice_en: '',
  };
  if (!useAI || !hasGemini() || !latest.prevDate) return fallback;
  const prompt = `You write a short, very easy morning market report for a vegetable/fruit trader in Karachi.
Today: ${latest.date}. Compared with: ${latest.prevDate}. Prices in PKR = official Sabzi Mandi (wholesale) rate per unit; grade-2 items end with "_g2".
Price changes (now = today, before = previous list, week_pct = change over ~7 days):
${JSON.stringify(rows.filter((r) => r.now != null))}
Risk alerts from news: ${JSON.stringify((latest.alerts || []).map((a) => ({ level: a.level, items: a.items, title: a.title_en, effect: a.expected_effect_en })))}

Return JSON with:
- summary_ur: 2-3 short sentences in very simple everyday Urdu (Urdu script) summarizing the market today
- summary_en: same in simple English
- points_ur / points_en: 3-5 bullet points (each one short sentence) — key movers with numbers, 7-day trend, and any coming risk
- advice_ur / advice_en: one practical sentence (e.g. which items to stock up / wait on). No guarantees, keep it cautious.
Use Latin digits for numbers.`;
  try {
    const r = await geminiJSON([{ text: prompt }], {
      schema: {
        type: 'OBJECT',
        properties: {
          summary_ur: { type: 'STRING' }, summary_en: { type: 'STRING' },
          points_ur: { type: 'ARRAY', items: { type: 'STRING' } }, points_en: { type: 'ARRAY', items: { type: 'STRING' } },
          advice_ur: { type: 'STRING' }, advice_en: { type: 'STRING' },
        },
        required: ['summary_ur', 'summary_en', 'points_ur', 'points_en'],
      },
      temperature: 0.3,
    });
    return { ...fallback, ...r };
  } catch (e) {
    console.warn('Report generation failed:', e.message);
    return fallback;
  }
}

export function writeOutputs(latest) {
  writeJSON(path.join(SNAP_DIR, `${latest.date}.json`), latest);
  const snaps = fs.readdirSync(SNAP_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, 10)).sort();
  latest.snapshots = snaps.slice(-90);
  writeJSON(path.join(SNAP_DIR, `${latest.date}.json`), latest);
  writeJSON(path.join(DATA_DIR, 'latest.json'), latest);
}
