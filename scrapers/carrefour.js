import { runStandardStore } from './baseScraper.js';

export const STORE_META = {
  id: 'carrefour',
  name: 'Carrefour Pakistan',
  nameUr: 'کیریفور پاکستان',
  url: 'https://www.carrefour.pk',
  categories: ['Fresh Vegetables', 'Fresh Fruits'],
  cityNote: 'Selected Karachi store catalog.',
};

export async function scrape(ctx) {
  return runStandardStore({
    meta: STORE_META,
    ...ctx,
    playwrightConfig: {
      url: 'https://www.carrefour.pk/mafpak/en/c/FPAK1660000',
      categoryUrls: [
        'https://www.carrefour.pk/mafpak/en/c/FPAK1660100',
        'https://www.carrefour.pk/mafpak/en/c/FPAK1660200',
      ],
    },
  });
}
