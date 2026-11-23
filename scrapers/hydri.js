import { runStandardStore, tryWooCommerce, tryShopifyCollections } from './baseScraper.js';

export const STORE_META = {
  id: 'hydri',
  name: 'Hydri Super Market',
  nameUr: 'حیدری سپر مارکیٹ',
  url: 'https://www.hydrisupermarket.com.pk',
  categories: ['Fresh Vegetables', 'Fresh Fruits'],
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    tryJson: async () => {
      const w = await tryWooCommerce(STORE_META.url, ['vegetables', 'fruits']);
      if (w.items.length) return w;
      return tryShopifyCollections(STORE_META.url, ['vegetables', 'fruits']);
    },
    playwrightConfig: {
      url: 'https://www.hydrisupermarket.com.pk/product-category/fruits-vegetables/',
      categoryUrls: ['https://www.hydrisupermarket.com.pk/product-category/fruits-vegetables/'],
    },
  });
}
