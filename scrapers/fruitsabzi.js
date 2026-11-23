import { runStandardStore, tryShopifyCollections, tryWooCommerce } from './baseScraper.js';

export const STORE_META = {
  id: 'fruitsabzi',
  name: 'Fruit Sabzi',
  nameUr: 'فروٹ سبزی',
  url: 'https://fruitsabzi.pk',
  categories: ['Vegetables', 'Fruits', 'Herbs'],
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    tryJson: async () => {
      const s = await tryShopifyCollections(STORE_META.url, ['vegetables', 'fruits', 'fresh-vegetables', 'fresh-fruits']);
      if (s.items.length) return s;
      return tryWooCommerce(STORE_META.url, ['vegetables', 'fruits']);
    },
    playwrightConfig: {
      url: 'https://fruitsabzi.pk',
      categoryUrls: ['https://fruitsabzi.pk/collections/vegetables', 'https://fruitsabzi.pk/collections/fruits'],
    },
  });
}
