// Shared unit normalization, item alias matching, and update-date tracking
// Used by both Node.js scraper bots (scrapers/) and the browser scanner/UI (app/).
import { ITEMS } from '../scraper/items.mjs';

const EXTRA_ITEMS = [
  { id: 'curry_leaves', en: 'Curry Leaves', ur: 'کڑی پتہ', cat: 'veg', unit: 'bunch' },
];

export const MASTER_ITEMS = [...ITEMS, ...EXTRA_ITEMS];
export const MASTER_MAP = Object.fromEntries(MASTER_ITEMS.map((i) => [i.id, i]));

const HERB_IDS = new Set(['coriander', 'mint', 'curry_leaves']);

// Aliases: English, Roman Urdu, Urdu -> master item id
const ALIAS_GROUPS = {
  potato: ['potato', 'potatoes', 'white potato', 'new potato', 'aloo', 'aaloo', 'alu', 'آلو', 'سفید آلو'],
  potato_red: ['red potato', 'lal aloo', 'laal aloo', 'لال آلو'],
  onion: ['onion', 'onions', 'red onion', 'pyaz', 'piyaz', 'pyaaz', 'پیاز'],
  onion_small: ['small onion', 'shallot', 'pyaz choti', 'پیاز چھوٹی'],
  green_onion: ['green onion', 'spring onion', 'hara pyaz', 'ہری پیاز'],
  tomato: ['tomato', 'tomatoes', 'tamatar', 'tamaatar', 'ٹماٹر'],
  garlic_china: ['garlic china', 'chinese garlic', 'imported garlic', 'lehsan china', 'لہسن چائنا'],
  garlic_local: ['garlic', 'garlic local', 'desi garlic', 'lehsan', 'lehson', 'lahsan', 'لہسن', 'لہسن دیسی'],
  ginger: ['ginger', 'fresh ginger', 'adrak', 'ادرك', 'ادرک'],
  ginger_china: ['ginger china', 'chinese ginger', 'adrak china', 'ادرک چائنا'],
  ginger_thai: ['ginger thai', 'ginger bangkok', 'adrak bangkok', 'ادرک بینکاک'],
  green_chilli: ['green chilli', 'green chili', 'chilli', 'hari mirch', 'sabz mirch', 'ہری مرچ', 'سبز مرچ'],
  lemon: ['lemon', 'lemons', 'lime', 'nimbu', 'leemu', 'limu', 'لیموں'],
  capsicum: ['capsicum', 'bell pepper', 'green pepper', 'shimla mirch', 'شملہ مرچ'],
  cabbage: ['cabbage', 'band gobhi', 'band gobi', 'patta gobhi', 'بند گوبھی'],
  cauliflower: ['cauliflower', 'phool gobhi', 'phool gobi', 'gobhi', 'gobi', 'پھول گوبھی'],
  brinjal: ['brinjal', 'eggplant', 'aubergine', 'baingan', 'bengan', 'بینگن'],
  brinjal_long: ['long brinjal', 'baingan lamba', 'بینگن لمبا'],
  okra: ['okra', 'lady finger', 'ladyfinger', 'bhindi', 'بھنڈی'],
  bitter_gourd: ['bitter gourd', 'karela', 'karaila', 'کریلا'],
  bottle_gourd: ['bottle gourd', 'calabash', 'lauki', 'loki', 'ghiya', 'لوکی'],
  bottle_gourd_round: ['round bottle gourd', 'lauki gol', 'لوکی گول'],
  pumpkin: ['pumpkin', 'kaddu', 'kadu', 'کدو'],
  round_gourd: ['round gourd', 'apple gourd', 'tinda', 'tinday', 'ٹینڈے', 'ٹنڈا'],
  round_gourd_china: ['tinda china', 'ٹنڈا چائنہ'],
  ridge_gourd: ['ridge gourd', 'tori', 'turai', 'توری'],
  peas: ['peas', 'green peas', 'matar', 'mattar', 'مٹر'],
  carrot: ['carrot', 'carrots', 'gajar', 'گاجر'],
  radish: ['radish', 'mooli', 'muli', 'مولی'],
  turnip: ['turnip', 'shalgam', 'shaljam', 'شلجم'],
  spinach: ['spinach', 'palak', 'paalak', 'پالک'],
  fenugreek: ['fenugreek', 'methi', 'میتھی'],
  coriander: ['coriander', 'cilantro', 'dhania', 'dhaniya', 'hara dhania', 'ہرا دھنیا', 'دھنیا'],
  mint: ['mint', 'pudina', 'podina', 'پودینہ', 'پودینا'],
  curry_leaves: ['curry leaves', 'curry leaf', 'kari patta', 'kadi patta', 'کڑی پتہ'],
  cucumber: ['cucumber', 'kheera', 'khira', 'کھیرا'],
  taro: ['taro', 'arvi', 'arbi', 'اروی'],
  beans: ['green beans', 'french beans', 'beans', 'lobia', 'phali', 'لوبیا', 'پھلی'],
  sweet_potato: ['sweet potato', 'shakarkandi', 'shakar qandi', 'شکرقندی'],
  beetroot: ['beetroot', 'beet', 'chukandar', 'چقندر'],
  zucchini: ['zucchini', 'courgette', 'زکینی'],
  mushroom: ['mushroom', 'mushrooms', 'button mushroom', 'مشروم'],
  mustard_greens: ['mustard greens', 'saag', 'sarson ka saag', 'سرسوں کا ساگ'],
  // Fruits
  apple: ['apple', 'apples', 'red apple', 'seb', 'saib', 'سیب'],
  apple_kala_kulu: ['apple kala kulu', 'kala kulu', 'kala kulu apple', 'کالا کولو'],
  apple_golden: ['golden apple', 'apple golden', 'گولڈن سیب'],
  apple_irani: ['irani apple', 'apple irani', 'ایرانی سیب'],
  apple_gala: ['gala apple', 'royal gala', 'apple gala', 'گالا سیب'],
  banana: ['banana', 'bananas', 'kela', 'kelay', 'کیلا'],
  kinnow: ['kinnow', 'kino', 'mandarin', 'کینو'],
  mosambi: ['mosambi', 'sweet lime', 'musambi', 'موسمی'],
  orange: ['orange', 'oranges', 'malta', 'مالٹا'],
  guava: ['guava', 'amrood', 'amrud', 'امرود'],
  pomegranate: ['pomegranate', 'anar', 'anaar', 'انار'],
  pomegranate_irani: ['irani pomegranate', 'anar irani', 'انار ایرانی'],
  pomegranate_kandhari: ['kandhari pomegranate', 'qandhari anar', 'انار قندھاری'],
  grapes: ['grapes', 'grape', 'angoor', 'انگور'],
  grapes_sundarkhani: ['sundarkhani grapes', 'angoor sundarkhani', 'سندرخانی'],
  mango: ['mango', 'mangoes', 'aam', 'آم'],
  mango_sindhri: ['sindhri mango', 'sindhri', 'سندھڑی'],
  mango_chaunsa: ['chaunsa mango', 'chaunsa', 'چونسا'],
  papaya: ['papaya', 'papita', 'papeeta', 'پپیتا'],
  melon: ['melon', 'muskmelon', 'kharboza', 'kharbuza', 'خربوزہ'],
  watermelon: ['watermelon', 'tarbooz', 'tarbuz', 'تربوز'],
  chikoo: ['chikoo', 'sapodilla', 'chiku', 'چیکو'],
  pear: ['pear', 'pears', 'nashpati', 'ناشپاتی'],
  peach: ['peach', 'peaches', 'aaru', 'aru', 'آڑو'],
  plum: ['plum', 'plums', 'aloo bukhara', 'آلو بخارا'],
  apricot: ['apricot', 'apricots', 'khubani', 'خوبانی'],
  persimmon: ['persimmon', 'japani phal', 'جاپانی پھل'],
  strawberry: ['strawberry', 'strawberries', 'اسٹرابیری'],
  dates: ['dates', 'khajoor', 'khajur', 'کھجور'],
  dates_muzafati: ['muzafati dates', 'irani dates', 'مضافاتی'],
  coconut: ['coconut', 'nariyal', 'ناریل'],
  pineapple: ['pineapple', 'ananas', 'انناس'],
  kiwi: ['kiwi', 'کیوی'],
  grapefruit: ['grapefruit', 'گریپ فروٹ'],
  cherry: ['cherry', 'cherries', 'چیری'],
};

const ALIAS_INDEX = new Map();
for (const [id, list] of Object.entries(ALIAS_GROUPS)) {
  for (const a of list) ALIAS_INDEX.set(cleanText(a), id);
}
for (const it of MASTER_ITEMS) {
  const enClean = cleanText(it.en);
  const urClean = cleanText(it.ur);
  if (enClean && !ALIAS_INDEX.has(enClean)) ALIAS_INDEX.set(enClean, it.id);
  if (urClean && !ALIAS_INDEX.has(urClean)) ALIAS_INDEX.set(urClean, it.id);
}

const SORTED_ALIASES = [...ALIAS_INDEX.entries()].sort((a, b) => b[0].length - a[0].length);

export function cleanText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b(\d+(?:\.\d+)?\s*(?:kg|kgs|g|gm|gms|gram|grams|ml|l|pc|pcs|piece|pieces|dozen|doz|bunch|bunches|pack))\b/gi, ' ')
    .replace(/\b(fresh|organic|local|imported|farm|premium|grade\s*[12]|approx|per|pack|rs\.?|pkr)\b/gi, ' ')
    .replace(/[()[\]{},.\-_/\\|:+*!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchMasterItem(rawName, hintCat = null) {
  if (!rawName) return null;
  const cleaned = cleanText(rawName);
  if (!cleaned) return null;

  // 1. Exact alias match
  if (ALIAS_INDEX.has(cleaned)) {
    const id = ALIAS_INDEX.get(cleaned);
    return MASTER_MAP[id] || null;
  }

  // 2. Substring / phrase match (longest alias first)
  let best = null;
  for (const [alias, id] of SORTED_ALIASES) {
    if (alias.length < 3) continue;
    const re = new RegExp(`(?:^|\\s)${escapeRe(alias)}(?:\\s|$)`);
    if (re.test(cleaned)) {
      const item = MASTER_MAP[id];
      if (!item) continue;
      if (!hintCat || item.cat === hintCat) return item;
      if (!best) best = item;
    }
  }
  return best;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a pack / weight / unit string into normalized unit info.
 */
export function parsePackUnit(text, defaultUnit = 'kg') {
  const s = String(text || '').toLowerCase();
  let m;
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilo|کلو)/i))) {
    const amt = parseFloat(m[1]);
    return { unitType: 'kg', amount: amt || 1, label: `${amt}kg` };
  }
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:g|gm|gms|gram|grams|گرام)/i))) {
    const g = parseFloat(m[1]);
    return { unitType: 'kg', amount: g / 1000, label: `${g}g` };
  }
  if (/پاؤ|pao/.test(s)) return { unitType: 'kg', amount: 0.25, label: '250g' };
  if (/آدھا\s*کلو|half\s*kg/.test(s)) return { unitType: 'kg', amount: 0.5, label: '500g' };
  if (/bunch|bundle|گڈی|gaddi/i.test(s)) return { unitType: 'bunch', amount: 1, label: 'bunch' };
  if (/dozen|doz|درجن|12\s*pcs?/i.test(s)) return { unitType: 'dozen', amount: 1, label: 'dozen' };
  if ((m = s.match(/(\d+)\s*(?:pc|pcs|piece|pieces|دانہ)/i))) {
    const n = parseInt(m[1], 10) || 1;
    if (n === 12) return { unitType: 'dozen', amount: 1, label: '12 pcs' };
    return { unitType: 'piece', amount: n, label: `${n} pc` };
  }
  if (defaultUnit === 'bunch') return { unitType: 'bunch', amount: 1, label: 'bunch' };
  if (defaultUnit === 'dozen') return { unitType: 'dozen', amount: 1, label: 'dozen' };
  if (defaultUnit === 'piece') return { unitType: 'piece', amount: 1, label: '1 pc' };
  return { unitType: 'kg', amount: 1, label: '1kg' };
}

/**
 * Standardize a scraped or scanned price into PKR per 1 kg (or per bunch/dozen/piece).
 */
export function normalizePackPrice(rawPrice, packText = '', masterItem = null) {
  const price = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(price) || price <= 0) return null;

  const isHerb = masterItem && (HERB_IDS.has(masterItem.id) || masterItem.unit === 'bunch');
  const parsed = parsePackUnit(packText, masterItem?.unit || 'kg');

  // Herb bundles stay standardized as per bunch
  if (isHerb || parsed.unitType === 'bunch') {
    return {
      raw_price: round2(price),
      pack_unit: parsed.label || 'bunch',
      original_pack_label: `Rs. ${round2(price)} / ${parsed.label || 'bunch'}`,
      normalized_price: round2(price),
      normalized_unit: 'bunch',
    };
  }

  let factor = 1;
  let normUnit = masterItem?.unit || parsed.unitType;
  if (parsed.unitType === 'kg' && parsed.amount > 0) {
    factor = 1 / parsed.amount; // e.g. 250g (0.25) -> x4, 5kg -> /5
    normUnit = 'kg';
  } else if (parsed.unitType === 'piece' && parsed.amount > 1) {
    factor = 1 / parsed.amount;
    normUnit = 'piece';
  }

  return {
    raw_price: round2(price),
    pack_unit: parsed.label,
    original_pack_label: `Rs. ${round2(price)} / ${parsed.label}`,
    normalized_price: round2(price * factor),
    normalized_unit: normUnit,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute update-date metadata for a store item against previous price_history entry.
 */
export function computeDateMeta({ price, prevEntry, siteReportedDate = null, todayPkt }) {
  if (price == null) {
    if (prevEntry?.price != null) {
      return {
        last_checked_date: todayPkt,
        site_reported_date: siteReportedDate || prevEntry.site_reported_date || null,
        price_last_changed_date: prevEntry.price_last_changed_date || prevEntry.last_checked_date || todayPkt,
        status: 'cached_fallback',
      };
    }
    return {
      last_checked_date: todayPkt,
      site_reported_date: siteReportedDate || null,
      price_last_changed_date: null,
      status: 'unavailable',
    };
  }

  const unchanged = prevEntry && prevEntry.price === price;
  return {
    last_checked_date: todayPkt,
    site_reported_date: siteReportedDate || null,
    price_last_changed_date: unchanged
      ? prevEntry.price_last_changed_date || todayPkt
      : todayPkt,
    status: unchanged ? 'unchanged' : 'updated_today',
  };
}
