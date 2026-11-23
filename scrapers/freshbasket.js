import { runStandardStore, tryShopifyCollections, tryWooCommerce } from './baseScraper.js';

export const STORE_META = {
  id: 'freshbasket',
  name: 'Fresh Basket',
  nameUr: 'فریش باسکٹ',
  url: 'https://freshbasket.com.pk',
  categories: ['Fresh Vegetables', 'Fresh Fruits'],
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    tryJson: async () => {
      const s = await tryShopifyCollections(STORE_META.url, ['vegetables', 'fresh-vegetables', 'fruits', 'fresh-fruits']);
      if (s.items.length) return s;
      return tryWooCommerce(STORE_META.url, ['vegetables', 'fruits']);
    },
    playwrightConfig: {
      url: 'https://freshbasket.com.pk/collections/vegetables',
      categoryUrls: [
        'https://freshbasket.com.pk/collections/vegetables',
        'https://freshbasket.com.pk/collections/fruits',
      ],
    },
  });
}
