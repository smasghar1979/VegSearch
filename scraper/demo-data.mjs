// Generates 15 days of realistic demo Karachi Sabzi Mandi rates and sample alerts
// so the app can be previewed and tested locally before live scraping runs.
//
// Usage:
//   node scraper/demo-data.mjs          # generates demo data if no live scraped days exist
//   node scraper/demo-data.mjs --force  # overwrites existing data/days & data/news.json
import path from 'node:path';
import { pkToday, addDays } from './util.mjs';
import { ITEM_MAP } from './items.mjs';
import { SOURCE } from './sources/commissioner.mjs';
import { DATA_DIR, loadDays, saveDay, normalizeItems, buildLatest, writeOutputs, writeJSON } from './build.mjs';

const DEMO_SERIES = [
  // id, base wholesale price (PKR), daily volatility, trend over 15 days, grade
  ['potato', 85, 4, 4, 1],
  ['potato_g2', 70, 3, 2, 2],
  ['onion', 135, 6, -12, 1],
  ['tomato', 160, 12, 55, 1],
  ['tomato_g2', 125, 10, 40, 2],
  ['garlic_china', 540, 14, 25, null],
  ['garlic_local', 420, 12, 10, null],
  ['ginger_thai', 580, 15, -20, null],
  ['green_chilli', 190, 14, 35, null],
  ['lemon', 240, 15, -30, null],
  ['capsicum', 175, 10, 15, null],
  ['cabbage', 75, 5, -8, null],
  ['cauliflower', 95, 7, 10, null],
  ['brinjal', 90, 6, -5, null],
  ['okra', 165, 10, 20, null],
  ['bitter_gourd', 150, 8, 5, null],
  ['bottle_gourd', 85, 5, -10, null],
  ['peas', 210, 12, -25, null],
  ['carrot', 80, 5, -10, null],
  ['cucumber', 90, 6, 8, null],
  ['spinach', 55, 4, 0, null],
  ['coriander', 35, 3, 5, null],
  // fruits
  ['apple_kala_kulu', 290, 12, 20, 1],
  ['apple_irani', 340, 14, 15, null],
  ['banana', 160, 8, 12, 1],
  ['kinnow', 190, 10, -20, 1],
  ['guava', 155, 8, -10, null],
  ['pomegranate_kandhari', 420, 16, 30, null],
  ['dates_muzafati', 480, 10, 5, null],
];

function pseudoRand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function roundTo5(n) {
  return Math.max(10, Math.round(n / 5) * 5);
}

function makeSampleNews(today) {
  const yesterday = addDays(today, -1);
  const articles = [
    {
      title: 'Tomato prices jump in Karachi wholesale market amid Balochistan supply slowdown',
      url: 'https://www.dawn.com/',
      date: `${today}T03:30:00.000Z`,
      publisher: 'Dawn',
      lang: 'en',
    },
    {
      title: 'کراچی سبزی منڈی میں ٹماٹر اور ہری مرچ کی آمد میں کمی، قیمتوں میں اضافہ',
      url: 'https://www.jang.com.pk/',
      date: `${today}T02:15:00.000Z`,
      publisher: 'Daily Jang',
      lang: 'ur',
    },
    {
      title: 'Sindh winter peas and carrot harvest improves supply in Karachi mandi',
      url: 'https://www.thenews.com.pk/',
      date: `${yesterday}T08:00:00.000Z`,
      publisher: 'The News',
      lang: 'en',
    },
    {
      title: 'نئی فصل کی آمد سے مٹر، گاجر اور کینو کی قیمتوں میں استحکام',
      url: 'https://www.express.pk/',
      date: `${yesterday}T06:45:00.000Z`,
      publisher: 'Express News',
      lang: 'ur',
    },
  ];

  const alerts = [
    {
      level: 'high',
      items: ['tomato', 'tomato_g2', 'green_chilli'],
      title_ur: 'بلوچستان اور سندھ سے ٹماٹر اور ہری مرچ کی سپلائی میں کمی',
      title_en: 'Reduced tomato and green chilli arrivals from Balochistan & Sindh',
      summary_ur: 'منڈی میں ٹماٹر اور ہری مرچ کی گاڑیاں کم پہنچنے سے تھوک ریٹ تیزی سے بڑھے ہیں۔',
      summary_en: 'Fewer truck arrivals at Sabzi Mandi have pushed wholesale rates for tomato and green chilli sharply higher.',
      expected_effect_ur: 'اگلے 3 سے 5 دن تک ٹماٹر اور مرچ کے ریٹ مزید بڑھنے یا بلند رہنے کا امکان ہے۔',
      expected_effect_en: 'Tomato and chilli prices may stay elevated or rise further over the next 3–5 days.',
      sources: [articles[0], articles[1]],
    },
    {
      level: 'medium',
      items: ['garlic_china', 'apple_kala_kulu'],
      title_ur: 'ٹرانسپورٹ کرایوں کے باعث لہسن اور سیب پر دباؤ',
      title_en: 'Transport costs keeping pressure on garlic and apple prices',
      summary_ur: 'ایندھن اور باربرداری کے اخراجات زیادہ ہونے سے شمالی علاقوں اور درآمدی مال کے ریٹ سخت ہیں۔',
      summary_en: 'Higher freight charges from northern growing belts and ports are keeping garlic and apple rates firm.',
      expected_effect_ur: 'معمولی اتار چڑھاؤ کے ساتھ ریٹ موجودہ سطح کے قریب رہ سکتے ہیں۔',
      expected_effect_en: 'Rates are likely to remain firm near current levels with mild fluctuations.',
      sources: [articles[0]],
    },
    {
      level: 'low',
      items: ['peas', 'carrot', 'kinnow', 'onion'],
      title_ur: 'نئی فصل کی آمد سے مٹر، گاجر اور کینو سستے ہو رہے ہیں',
      title_en: 'Fresh harvest arrivals easing peas, carrot and kinnow prices',
      summary_ur: 'اندرونِ سندھ اور پنجاب سے وافر سپلائی آنے پر موسمی سبزیوں اور کینو کے ریٹ نیچے آ رہے ہیں۔',
      summary_en: 'Good arrivals from Sindh and Punjab are bringing seasonal vegetable and kinnow prices down.',
      expected_effect_ur: 'آنے والے دنوں میں قیمتوں میں مزید بہتری اور استحکام متوقع ہے۔',
      expected_effect_en: 'Prices are expected to remain stable or ease slightly in the coming days.',
      sources: [articles[2], articles[3]],
    },
  ];

  return { alerts, articles, updatedAt: new Date().toISOString(), demo: true };
}

async function main() {
  const force = process.argv.includes('--force');
  const existing = loadDays();
  const hasLive = Object.values(existing).some((d) => d.files?.some((f) => !String(f.url).startsWith('demo:')));
  if (hasLive && !force) {
    console.log('Live scraped data already exists. Pass --force to overwrite with demo data.');
    return;
  }

  const today = pkToday();
  const totalDays = 15;
  const days = {};

  for (let offset = -(totalDays - 1); offset <= 0; offset++) {
    const date = addDays(today, offset);
    const progress = (offset + totalDays - 1) / (totalDays - 1); // 0 -> 1
    const rawItems = DEMO_SERIES.map(([id, baseW, vol, trend, grade], idx) => {
      const baseId = id.replace(/_g2$/, '');
      const meta = ITEM_MAP[baseId];
      const wave = Math.sin(progress * Math.PI * 2 + idx * 0.7) * vol;
      const noise = (pseudoRand((offset + 30) * 100 + idx) - 0.5) * vol;
      const wholesale = roundTo5(baseW + trend * progress + wave + noise);
      const auction = roundTo5(wholesale / 1.06);
      const retail = roundTo5(wholesale * 1.15);
      return {
        id,
        grade,
        name_en: meta.en,
        name_ur: meta.ur,
        category: meta.cat,
        unit: meta.unit,
        auction,
        wholesale,
        retail,
      };
    });

    const day = {
      date,
      source: { ...SOURCE, date, url: SOURCE.page },
      files: [{ kind: 'demo', url: `demo:${date}`, listedDate: date, printedDate: date }],
      items: normalizeItems(rawItems),
      updatedAt: new Date().toISOString(),
    };
    saveDay(day);
    days[date] = day;
  }

  const news = makeSampleNews(today);
  writeJSON(path.join(DATA_DIR, 'news.json'), news);

  // Build snapshots chronologically so the archive dropdown works for all demo days.
  const partialDays = {};
  let latest = null;
  for (const date of Object.keys(days).sort()) {
    partialDays[date] = days[date];
    latest = await buildLatest({ days: partialDays, news, today: date, useAI: false });
    if (latest && !latest.report.points_ur?.length) {
      latest.report.points_ur = [
        'ٹماٹر اور ہری مرچ کی سپلائی کم ہونے سے منڈی ریٹ میں نمایاں اضافہ ہوا ہے۔',
        'پیاز، مٹر اور گاجر کی نئی آمد سے قیمتوں میں واضح کمی آئی ہے۔',
        'آلو، پالک اور دھنیا کے ریٹ گزشتہ ہفتے کے مقابلے میں تقریباً مستحکم ہیں۔',
      ];
      latest.report.points_en = [
        'Tomato and green chilli prices rose sharply due to tighter wholesale arrivals.',
        'Onion, green peas and carrot rates eased as fresh crop supplies improved.',
        'Potato, spinach and leafy greens remained largely steady over the past week.',
      ];
      latest.report.advice_ur = 'ٹماٹر اور ہری مرچ کی خریداری ضرورت کے مطابق کریں جبکہ پیاز اور مٹر کی وافر سپلائی سے فائدہ اٹھایا جا سکتا ہے۔';
      latest.report.advice_en = 'Buy tomato and chilli cautiously as arrivals tighten, while onion and peas offer steadier stock value.';
    }
    writeOutputs(latest);
  }
  console.log(`Generated ${totalDays} demo days through ${today} (${latest.items.length} items, ${latest.alerts.length} alerts).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
