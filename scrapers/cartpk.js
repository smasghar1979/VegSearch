import { runStandardStore, tryShopifyCollections, tryWooCommerce } from './baseScraper.js';

export const STORE_META = {
  id: 'cartpk',
  name: 'CartPK',
  nameUr: 'کارٹ پی کے',
  url: 'https://www.cartpk.com',
  categories: ['Vegetables', 'Fruits', 'Herbs'],
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    tryJson: async () => {
      const s = await tryShopifyCollections(STORE_META.url, ['vegetables', 'fruits', 'fresh-vegetables']);
      if (s.items.length) return s;
      return tryWooCommerce(STORE_META.url, ['vegetables', 'fruits']);
    },
    playwrightConfig: {
      url: 'https://www.cartpk.com/collections/vegetables',
      categoryUrls: [
        'https://www.cartpk.com/collections/vegetables',
        'https://www.cartpk.com/collections/fruits',
      ],
    },
  });
}
