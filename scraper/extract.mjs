// Turns an official price-list document (image / PDF / text) into structured JSON using Gemini.
// The Commissioner Karachi lists have 3 prices per item:
//   نیلامی بھاؤ (auction)  |  منڈی / بچت بازار بھاؤ (mandi / wholesale)  |  بازار بھاؤ (retail)
// and many items in two grades: درجہ اول (grade 1) / درجہ دوئم (grade 2).
import { geminiJSON } from './gemini.mjs';
import { ITEMS } from './items.mjs';

const ITEM_PROPS = {
  id: { type: 'STRING' },
  grade: { type: 'INTEGER', nullable: true },
  name_en: { type: 'STRING' },
  name_ur: { type: 'STRING' },
  category: { type: 'STRING', enum: ['veg', 'fruit'] },
  unit: { type: 'STRING', enum: ['kg', 'dozen', 'bunch', 'piece'] },
  auction: { type: 'NUMBER', nullable: true },
  wholesale: { type: 'NUMBER', nullable: true },
  retail: { type: 'NUMBER', nullable: true },
};
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_price_list: { type: 'BOOLEAN' },
    date: { type: 'STRING' },
    list_type: { type: 'STRING', enum: ['vegetables', 'fruits', 'mixed', 'other'] },
    items: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: ITEM_PROPS, required: ['id', 'name_en', 'name_ur', 'category', 'unit'] },
    },
  },
  required: ['is_price_list', 'date', 'items'],
};

function rules(extraIds) {
  const known = [...ITEMS.map((i) => `${i.id} = ${i.en} / ${i.ur}`), ...extraIds.map((x) => `${x} (used on previous days)`)];
  return `LAYOUT: The page usually has TWO tables side by side (right half and left half; Urdu reads right-to-left).
Each half has the columns (from right to left): نام اشیاء (item name) | نیلامی بھاؤ (auction) | منڈی/بچت بازار بھاؤ فی کلو (mandi/wholesale) | بازار بھاؤ فی کلو (retail).
Read EACH half row by row and keep the three numbers with the correct item on the same row. "-" or blank = null.

Extract ONLY vegetables and fruits. For every item row return:
- id: reuse a KNOWN id below when it is the same item & variety (match by meaning). For a "درجہ دوئم" (grade 2) row use the
  base id + "_g2" (e.g. potato_g2, tomato_g2). For grade 1 / no grade use the base id. Unknown items: new lowercase snake_case
  English id (e.g. "apple_amri"). Different varieties (e.g. لوکی گول vs لوکی لمبی, ٹنڈا دیسی vs چائنہ) get different ids.
- grade: 1, 2 or null.
- name_en, name_ur: names as printed (Urdu script for name_ur), including the grade words.
- category: veg or fruit. unit: kg by default; "فی درجن" = dozen; "فی دانہ" = piece; "گڈی" = bunch.
- auction, wholesale, retail: numbers in PKR exactly as printed. Never invent or guess numbers. Never read a vertical table border line as the digit "1" (for example, "84|" is 84, NOT 841).
- IMPORTANT: Extract EVERY row from BOTH the right-hand table AND the left-hand table (typically 15 to 45 items per page). Do NOT stop after the first row.
Note: normally wholesale ≈ auction × 1.06 and retail ≈ wholesale × 1.15, and ALWAYS auction <= wholesale <= retail — use this to catch misread digits.

KNOWN ids:
${known.join('\n')}`;
}

export async function extractPriceList({ buf, mime, text, hintDate, extraIds = [] }) {
  const prompt = `This is an official daily price list for Karachi, Pakistan, issued by the Commissioner Karachi Division /
Bureau of Supply & Prices / Market Committee (Sabzi Mandi). It is a scanned image in Urdu.
${hintDate ? `The website says this list is dated ${hintDate}.` : ''}
date: the date printed on the list (بتاریخ), as YYYY-MM-DD, or "" if none.
Set is_price_list=false if the document is not a vegetable/fruit price list.

${rules(extraIds)}`;

  const media = buf ? { inline_data: { mime_type: mime, data: buf.toString('base64') } } : { text: `DOCUMENT TEXT:\n${text.slice(0, 60000)}` };
  const first = await geminiJSON([{ text: prompt }, media], { schema: SCHEMA });
  if (!first.is_price_list || !first.items?.length) return first;
  // Save 50% of daily Gemini quota when first pass already extracted a full, sane list
  if (first.items.length >= 12 && !hasSuspiciousRows(first)) return clean(first);

  // Second pass: verification against the image (catches mis-aligned rows / misread digits).
  try {
    const verifyPrompt = `You previously extracted the JSON below from this price list image. Carefully re-check EVERY row against the
image: item names, which half/row the numbers belong to, and every digit. Fix mistakes, add missing items, remove items that are
not on the list. Return the complete corrected JSON in the same format.

${rules(extraIds)}

PREVIOUS JSON:
${JSON.stringify(first)}`;
    const second = await geminiJSON([{ text: verifyPrompt }, media], { schema: SCHEMA });
    if (second?.items?.length >= first.items.length * 0.7) {
      second.date = second.date || first.date;
      second.is_price_list = true;
      return clean(second);
    }
  } catch (e) {
    console.warn('Verification pass failed, using first pass:', e.message);
  }
  return clean(first);
}

function hasSuspiciousRows(out) {
  const items = out?.items || [];
  if (items.length < 12) return true;
  return items.some((i) => (i.wholesale && i.retail && i.wholesale > i.retail * 1.1) || (i.auction && i.wholesale && i.auction > i.wholesale * 1.1));
}

function clean(out) {
  out.items = (out.items || [])
    .filter((i) => i && i.id && (i.auction != null || i.wholesale != null || i.retail != null))
    .map((i) => {
      // Drop clearly corrupted OCR digit (e.g. 841 vs retail 97) rather than publishing wrong rate
      if (i.wholesale && i.retail && i.wholesale > i.retail * 1.25) {
        return { ...i, wholesale: Math.round(i.retail / 1.15) };
      }
      return i;
    });
  return out;
}
