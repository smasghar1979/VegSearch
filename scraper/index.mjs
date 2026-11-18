// Daily job: fetch official Karachi price lists, extract with Gemini, collect news alerts,
// and build data/latest.json + data/snapshots/<date>.json for the app.
//
// Usage:
//   node scraper/index.mjs                     # normal run (used by GitHub Actions)
//   node scraper/index.mjs --rebuild           # only rebuild latest.json from stored days
//   node scraper/index.mjs --no-news           # skip news
//   node scraper/index.mjs --file list.jpg --date 2026-11-17 --kind vegetables   # import a local list image
import fs from 'node:fs';
import path from 'node:path';
import { pkToday, fetchBinary, guessMime } from './util.mjs';
import { hasGemini } from './gemini.mjs';
import { extractPriceList } from './extract.mjs';
import { collectNews, analyzeNews } from './news.mjs';
import { loadDays, saveDay, normalizeItems, buildLatest, writeOutputs, readJSON, writeJSON, DATA_DIR } from './build.mjs';
import * as commissioner from './sources/commissioner.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

async function ingest(days, { buf, mime, url, kind, date, listedDate }) {
  const extraIds = [...new Set(Object.values(days).flatMap((d) => d.items.map((i) => i.id)))];
  const ext = await extractPriceList({ buf, mime, hintDate: date, extraIds });
  if (!ext.is_price_list || !ext.items?.length) {
    console.warn(`Not a price list / no items: ${url}`);
    return;
  }
  if (ext.date && ext.date !== date) console.warn(`Printed date ${ext.date} differs from listed date ${date}; using ${date}`);
  const items = normalizeItems(ext.items);
  const day = days[date] || { date, source: { ...commissioner.SOURCE, date, url }, files: [], items: [] };
  const map = Object.fromEntries(day.items.map((i) => [i.id, i]));
  for (const it of items) map[it.id] = it;
  day.items = Object.values(map);
  day.files = [...(day.files || []).filter((f) => f.kind !== kind), { kind, url, listedDate: listedDate || null, printedDate: ext.date || null }];
  day.updatedAt = new Date().toISOString();
  saveDay(day);
  days[date] = day;
  console.log(`Saved ${items.length} ${kind} items for ${date}`);
}

async function main() {
  const today = pkToday();
  const days = loadDays();
  console.log(`Today (PKT): ${today}. Stored days: ${Object.keys(days).length}`);

  if (opt('--file')) {
    const file = opt('--file');
    const date = opt('--date') || today;
    await ingest(days, { buf: fs.readFileSync(file), mime: guessMime(file), url: `local:${path.basename(file)}`, kind: opt('--kind') || 'vegetables', date });
  } else if (!flag('--rebuild')) {
    if (!hasGemini()) console.warn('⚠ GEMINI_API_KEY missing — price lists cannot be read. Add it as a GitHub secret.');
    let lists = [];
    try { lists = await commissioner.findLists(); } catch (e) { console.error('Commissioner page failed:', e.message); }
    for (const l of lists) {
      const date = l.date || today;
      if (date > today) continue;
      if (days[date]?.files?.some((f) => f.url === l.url)) { console.log(`Already have ${l.kind} for ${date}`); continue; }
      if (!hasGemini()) continue;
      try {
        const { buf, mime } = await fetchBinary(l.url);
        await ingest(days, { buf, mime, url: l.url, kind: l.kind, date, listedDate: l.date });
      } catch (e) {
        console.error(`Failed ${l.kind} ${l.url}:`, e.message);
      }
    }
  }

  // News & alerts (cached in data/news.json; refreshed at most every 3 hours)
  const newsFile = path.join(DATA_DIR, 'news.json');
  let news = readJSON(newsFile, { alerts: [], articles: [], updatedAt: null });
  const newsAge = news.updatedAt ? Date.now() - new Date(news.updatedAt).getTime() : Infinity;
  if (!flag('--no-news') && !flag('--rebuild') && newsAge > 3 * 3600 * 1000) {
    try {
      const raw = await collectNews();
      const ids = [...new Set(Object.values(days).flatMap((d) => d.items.map((i) => i.id)))];
      const analysed = await analyzeNews(raw, ids);
      if (raw.length) {
        news = { ...analysed, updatedAt: new Date().toISOString() };
        writeJSON(newsFile, news);
      }
    } catch (e) {
      console.error('News failed:', e.message);
    }
  }

  const latest = await buildLatest({ days, news, today });
  if (!latest) {
    console.warn('No price data yet — nothing to publish.');
    return;
  }
  writeOutputs(latest);
  console.log(`Published latest.json for ${latest.date} (prev ${latest.prevDate}), ${latest.items.length} items, ${latest.alerts.length} alerts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
