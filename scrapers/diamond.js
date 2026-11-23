import { runStandardStore, tryShopifyCollections, tryWooCommerce } from './baseScraper.js';

export const STORE_META = {
  id: 'diamond',
  name: 'Diamond Super Market',
  nameUr: 'ڈائمنڈ سپر مارکیٹ',
  url: 'https://www.dsmonline.pk',
  categories: ['Fresh Vegetables', 'Fresh Fruits'],
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    tryJson: async () => {
      const s = await tryShopifyCollections(STORE_META.url, ['vegetables', 'fruits', 'fresh-produce']);
      if (s.items.length) return s;
      return tryWooCommerce(STORE_META.url, ['vegetables', 'fruits']);
    },
    playwrightConfig: {
      url: 'https://www.dsmonline.pk/collections/vegetables',
      categoryUrls: [
        'https://www.dsmonline.pk/collections/vegetables',
        'https://www.dsmonline.pk/collections/fruits',
      ],
    },
  });
}
