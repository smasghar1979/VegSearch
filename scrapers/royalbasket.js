import { runStandardStore, tryShopifyCollections, tryWooCommerce } from './baseScraper.js';

export const STORE_META = {
  id: 'royalbasket',
  name: 'Royal Basket',
  nameUr: 'رائل باسکٹ',
  url: 'https://royalbasket.pk',
  categories: ['Vegetables', 'Fruits'],
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    tryJson: async () => {
      const s = await tryShopifyCollections(STORE_META.url, ['vegetables', 'fruits']);
      if (s.items.length) return s;
      return tryWooCommerce(STORE_META.url, ['vegetables', 'fruits']);
    },
    playwrightConfig: {
      url: 'https://royalbasket.pk',
      categoryUrls: ['https://royalbasket.pk/collections/vegetables', 'https://royalbasket.pk/collections/fruits'],
    },
  });
}
