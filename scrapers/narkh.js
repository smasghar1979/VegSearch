import * as cheerio from 'cheerio';
import { runStandardStore, fetchHTML } from './baseScraper.js';

export const STORE_META = {
  id: 'narkh',
  name: 'Narkh Karachi',
  nameUr: 'نرخ کراچی',
  url: 'https://www.narkh.pk/en/karachi',
  categories: ['Vegetables', 'Fruits'],
  cityNote: 'Karachi city market page (/en/karachi).',
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    tryJson: async () => {
      const html = await fetchHTML(STORE_META.url, 15000);
      const $ = cheerio.load(html);
      const items = [];
      $('tr, .price-card, .item-row, [class*="product"]').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        const m = text.match(/(?:Rs\.?|PKR)\s*([0-9,]+(?:\.\d{1,2})?)/i);
        if (!m) return;
        const price = parseFloat(m[1].replace(/,/g, ''));
        if (!price) return;
        const name = $(el).find('td, h2, h3, h4, .name, .title, a').first().text().replace(/\s+/g, ' ').trim() || text.split(/Rs\.?|PKR/i)[0].trim();
        if (name.length >= 2 && name.length <= 80) {
          items.push({ raw_name: name, raw_price: price, pack_text: text });
        }
      });
      return { items, endpoints: items.length ? [STORE_META.url] : [] };
    },
    playwrightConfig: {
      url: STORE_META.url,
      categoryUrls: [STORE_META.url],
    },
  });
}
