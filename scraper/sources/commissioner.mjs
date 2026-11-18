// Official source: Commissioner Karachi Division — https://commissionerkarachi.gos.pk/price-list
// The page shows the latest uploaded list per category (Vegetable, Fruit, Chicken, ...) as scanned JPG/WEBP images,
// with the date in the row name, e.g. "Vegetable 17/11/2026".
import * as cheerio from 'cheerio';
import { fetchText, findDate, absUrl } from '../util.mjs';

export const SOURCE = {
  id: 'commissioner_karachi',
  name_en: 'Commissioner Karachi Division (Bureau of Supply & Prices / Market Committee)',
  name_ur: 'کمشنر کراچی ڈویژن (بیورو آف سپلائی اینڈ پرائسز / مارکیٹ کمیٹی)',
  page: 'https://commissionerkarachi.gos.pk/price-list',
};

const WANT = [
  { kind: 'vegetables', re: /veg|sabz|سبز|ترکار/i },
  { kind: 'fruits', re: /fruit|phal|پھل|فروٹ/i },
];

export async function findLists() {
  const html = await fetchText(SOURCE.page);
  const $ = cheerio.load(html);
  const found = [];
  $('tr').each((_, tr) => {
    const nameCell = $(tr).find('td.item-name, td').first();
    const label = nameCell.text().replace(/\s+/g, ' ').trim();
    const category = $(tr).closest('.category-group').find('.category-title').first().text().trim();
    const href = $(tr).find('a[href]').first().attr('href');
    if (!href || !label) return;
    const text = `${category} ${label}`;
    const want = WANT.find((w) => w.re.test(text));
    if (!want) return;
    const url = absUrl(href, SOURCE.page);
    if (!/\.(jpe?g|png|webp|pdf)(\?|$)/i.test(url)) return;
    found.push({ kind: want.kind, label, date: findDate(label), url });
  });
  // keep newest per kind (page normally has one per kind)
  const byKind = {};
  for (const f of found) if (!byKind[f.kind] || (f.date || '') > (byKind[f.kind].date || '')) byKind[f.kind] = f;
  const lists = Object.values(byKind);
  console.log('Commissioner lists found:', lists.map((l) => `${l.kind} ${l.date} ${l.url}`).join(' | ') || 'none');
  return lists;
}
