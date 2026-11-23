import { runStandardStore, tryShopifyCollections, tryWooCommerce } from './baseScraper.js';

export const STORE_META = {
  id: 'vegevista',
  name: 'VegeVista',
  nameUr: 'ویجی وسٹا',
  url: 'https://vegevista.pk',
  categories: ['Fresh Vegetables', 'Fresh Fruits', 'Herbs'],
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    tryJson: async () => {
      const s = await tryShopifyCollections(STORE_META.url, ['vegetables', 'fruits', 'all']);
      if (s.items.length) return s;
      return tryWooCommerce(STORE_META.url, ['vegetables', 'fruits']);
    },
    playwrightConfig: {
      url: 'https://vegevista.pk',
      categoryUrls: ['https://vegevista.pk/collections/vegetables', 'https://vegevista.pk/collections/fruits'],
    },
  });
}
