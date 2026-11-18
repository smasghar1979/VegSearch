// Collects vegetable/fruit supply news (Pakistan) from Google News RSS (English + Urdu),
// then asks Gemini to turn them into shortage / price-risk alerts.
import * as cheerio from 'cheerio';
import { fetchText, sleep } from './util.mjs';
import { geminiJSON, hasGemini } from './gemini.mjs';

const QUERIES_EN = [
  'Karachi sabzi mandi prices',
  'vegetable prices Karachi',
  'tomato shortage Pakistan',
  'onion prices Pakistan',
  'potato prices Pakistan',
  'crop damage vegetables Sindh',
  'vegetable supply Afghanistan border Pakistan',
  'Iran tomato import Pakistan',
  'flood rain crops vegetables Pakistan',
  'fruit prices Karachi',
];
const QUERIES_UR = [
  'سبزی منڈی کراچی',
  'سبزیوں کی قیمتیں',
  'ٹماٹر قیمت',
  'پیاز قیمت',
  'فصل تباہ سبزی',
  'پھلوں کی قیمتیں کراچی',
];

function rssUrl(q, lang) {
  const base = 'https://news.google.com/rss/search';
  const p = lang === 'ur' ? 'hl=ur&gl=PK&ceid=PK:ur' : 'hl=en-PK&gl=PK&ceid=PK:en';
  return `${base}?q=${encodeURIComponent(q + ' when:4d')}&${p}`;
}

async function readFeed(q, lang) {
  try {
    const xml = await fetchText(rssUrl(q, lang));
    const $ = cheerio.load(xml, { xmlMode: true });
    return $('item')
      .map((_, el) => ({
        title: $(el).find('title').text().trim(),
        url: $(el).find('link').text().trim(),
        date: new Date($(el).find('pubDate').text()).toISOString(),
        publisher: $(el).find('source').text().trim(),
        lang,
      }))
      .get();
  } catch (e) {
    console.warn('News feed failed:', q, e.message);
    return [];
  }
}

export async function collectNews() {
  const all = [];
  for (const q of QUERIES_EN) { all.push(...(await readFeed(q, 'en'))); await sleep(400); }
  for (const q of QUERIES_UR) { all.push(...(await readFeed(q, 'ur'))); await sleep(400); }
  const cutoff = Date.now() - 4 * 86400000;
  const seen = new Set();
  const out = [];
  for (const a of all.sort((x, y) => y.date.localeCompare(x.date))) {
    const k = a.title.toLowerCase().replace(/\W+/g, ' ').slice(0, 80);
    if (seen.has(k) || new Date(a.date).getTime() < cutoff) continue;
    seen.add(k);
    out.push(a);
  }
  console.log(`News: ${out.length} unique articles`);
  return out.slice(0, 120);
}

const ALERT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    alerts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          level: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          items: { type: 'ARRAY', items: { type: 'STRING' } },
          title_ur: { type: 'STRING' },
          title_en: { type: 'STRING' },
          summary_ur: { type: 'STRING' },
          summary_en: { type: 'STRING' },
          expected_effect_ur: { type: 'STRING' },
          expected_effect_en: { type: 'STRING' },
          source_indexes: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['level', 'items', 'title_ur', 'title_en', 'summary_ur', 'summary_en', 'source_indexes'],
      },
    },
    relevant_indexes: { type: 'ARRAY', items: { type: 'INTEGER' } },
  },
  required: ['alerts', 'relevant_indexes'],
};

/** Turn raw news into alerts. knownIds: item ids used in price data. */
export async function analyzeNews(articles, knownIds) {
  if (!articles.length) return { alerts: [], articles: [] };
  if (!hasGemini()) {
    // Fallback: keyword filter only.
    const kw = /(shortage|damage|flood|rain|frost|hike|surge|soar|ban|border|قلت|تباہ|مہنگ|اضافہ|بارش|سیلاب)/i;
    return { alerts: [], articles: articles.filter((a) => kw.test(a.title)).slice(0, 30) };
  }
  const list = articles.map((a, i) => `[${i}] (${a.date.slice(0, 10)}, ${a.publisher}) ${a.title}`).join('\n');
  const prompt = `You are an agricultural market analyst for Karachi, Pakistan. Below are recent news headlines (English & Urdu).
Identify ONLY news that signals a coming SUPPLY or PRICE risk for vegetables or fruits in Karachi / Pakistan in the next days or weeks
(e.g. crop damage, floods/rain/frost/heat, disease, border closure with Afghanistan/Iran, import/export bans, transporter strikes,
mandi strikes, fuel price hikes affecting transport, sharp price surges, shortage warnings, seasonal end of supply).
Also include clearly positive supply news (new crop arrival, imports opening) as level "low".
Group headlines about the same issue into one alert. Ignore generic or unrelated news.

For each alert give:
- level: "high" (shortage/sharp rise likely soon), "medium" (possible pressure), "low" (minor/positive)
- items: affected item ids. Prefer these ids when applicable: ${knownIds.join(', ')}. Use "all" if it affects all vegetables.
- title_ur / summary_ur / expected_effect_ur: very simple, everyday Urdu that a shopkeeper easily understands (1-2 short sentences each)
- title_en / summary_en / expected_effect_en: simple English
- source_indexes: indexes of the headlines used
Also return relevant_indexes: indexes of all headlines related to vegetable/fruit markets (even if not risky).

Headlines:
${list}`;
  try {
    const res = await geminiJSON([{ text: prompt }], { schema: ALERT_SCHEMA });
    const alerts = (res.alerts || []).map((a) => ({
      ...a,
      sources: (a.source_indexes || []).map((i) => articles[i]).filter(Boolean),
    }));
    const order = { high: 0, medium: 1, low: 2 };
    alerts.sort((a, b) => order[a.level] - order[b.level]);
    const relevant = (res.relevant_indexes || []).map((i) => articles[i]).filter(Boolean);
    return { alerts, articles: relevant.slice(0, 40) };
  } catch (e) {
    console.warn('News analysis failed:', e.message);
    return { alerts: [], articles: articles.slice(0, 30) };
  }
}
