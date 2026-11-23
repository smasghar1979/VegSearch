import { runStandardStore, fetchJSON } from './baseScraper.js';

export const STORE_META = {
  id: 'metro',
  name: 'Metro Pakistan',
  nameUr: 'میٹرو پاکستان',
  url: 'https://www.metro-online.pk',
  categories: ['Fresh Vegetables', 'Fresh Fruits'],
  cityNote: 'Karachi storeId=10 / Metro Online API.',
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    tryJson: async () => {
      // Metro Online public catalog API (Karachi store)
      const endpoints = [
        'https://admin.metro-online.pk/api/read/Products?type=Products_nd_Categories&category_id=2680&storeId=10&limit=100',
        'https://admin.metro-online.pk/api/read/Products?type=Products_nd_Categories&category_id=2681&storeId=10&limit=100',
      ];
      const items = [];
      const hit = [];
      for (const u of endpoints) {
        try {
          const json = await fetchJSON(u, 12000);
          const arr = json?.data || json?.products || [];
          if (Array.isArray(arr) && arr.length) {
            hit.push(u);
            for (const p of arr) {
              const price = parseFloat(p.sale_price || p.price || 0);
              if (!price) continue;
              items.push({
                raw_name: p.product_name || p.name || '',
                raw_price: price,
                pack_text: `${p.product_name || ''} ${p.weight || p.unit || ''}`.trim(),
              });
            }
          }
        } catch {}
      }
      return { items, endpoints: hit };
    },
    playwrightConfig: {
      url: 'https://www.metro-online.pk/store/fruits-and-vegetables',
      categoryUrls: ['https://www.metro-online.pk/store/fruits-and-vegetables'],
    },
  });
}
