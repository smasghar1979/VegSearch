import { runStandardStore } from './baseScraper.js';

export const STORE_META = {
  id: 'kravemart',
  name: 'Krave Mart',
  nameUr: 'کریو مارٹ',
  url: 'https://kravemart.com',
  categories: ['Fresh Vegetables', 'Fresh Fruits'],
  cityNote: 'Karachi delivery zone.',
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    playwrightConfig: {
      url: 'https://kravemart.com',
      categoryUrls: ['https://kravemart.com/category/fruits-vegetables', 'https://kravemart.com'],
    },
  });
}
