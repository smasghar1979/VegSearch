import { runStandardStore, tryWooCommerce, tryShopifyCollections } from './baseScraper.js';

export const STORE_META = {
  id: 'arysahulat',
  name: 'ARY Sahulat Bazar',
  nameUr: 'اے آر وائی سہولت بازار',
  url: 'https://arysahulatbazar.pk',
  categories: ['Vegetables', 'Fruits'],
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
      url: 'https://arysahulatbazar.pk',
      categoryUrls: ['https://arysahulatbazar.pk/product-category/vegetables/', 'https://arysahulatbazar.pk/product-category/fruits/'],
    },
  });
}
