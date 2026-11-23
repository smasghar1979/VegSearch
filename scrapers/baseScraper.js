// Shared execution engine for all 12 Karachi grocery store scraper bots.
import { createWorkflowLogger } from './workflowLogger.js';
import { matchMasterItem, normalizePackPrice, computeDateMeta } from '../shared/normalize.js';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function pkToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}

export function pkNowLabel() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date()) + ' PKT';
}

export async function fetchJSON(url, timeoutMs = 15000) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-PK,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function fetchHTML(url, timeoutMs = 15000) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,*/*',
      'Accept-Language': 'en-PK,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/**
 * Fast JSON fetcher for Shopify-backed stores.
 */
export async function tryShopifyCollections(baseUrl, handles = []) {
  const urls = [
    ...handles.map((h) => `${baseUrl.replace(/\/$/, '')}/collections/${h}/products.json?limit=250`),
    `${baseUrl.replace(/\/$/, '')}/products.json?limit=250`,
  ];
  const raw = [];
  const hitUrls = [];
  for (const u of urls) {
    try {
      const json = await fetchJSON(u, 12000);
      if (Array.isArray(json?.products) && json.products.length) {
        hitUrls.push(u);
        for (const p of json.products) {
          const variant = p.variants?.[0] || {};
          const price = parseFloat(variant.price || p.price || 0);
          if (!price) continue;
          const packText = [variant.title !== 'Default Title' ? variant.title : '', p.title].filter(Boolean).join(' ');
          raw.push({
            raw_name: p.title,
            raw_price: price,
            pack_text: packText,
            hint_cat: /fruit|apple|banana|mango|orange|kinnow|guava|grape|melon|dates/i.test(`${p.product_type} ${p.title}`) ? 'fruit' : 'veg',
          });
        }
        if (handles.length && hitUrls.length >= handles.length) break;
      }
    } catch {
      // try next endpoint
    }
  }
  return { items: raw, endpoints: hitUrls };
}

/**
 * Fast JSON fetcher for WooCommerce-backed stores.
 */
export async function tryWooCommerce(baseUrl, categorySlugs = []) {
  const root = baseUrl.replace(/\/$/, '');
  const urls = [
    `${root}/wp-json/wc/store/v1/products?per_page=100`,
    ...categorySlugs.map((s) => `${root}/wp-json/wc/store/v1/products?per_page=100&category=${encodeURIComponent(s)}`),
  ];
  const raw = [];
  const hitUrls = [];
  for (const u of urls) {
    try {
      const list = await fetchJSON(u, 12000);
      if (Array.isArray(list) && list.length) {
        hitUrls.push(u);
        for (const p of list) {
          const minor = p.prices?.currency_minor_unit ?? 0;
          const rawVal = parseFloat(p.prices?.price || p.prices?.sale_price || p.prices?.regular_price || 0);
          const price = minor > 0 ? rawVal / Math.pow(10, minor) : rawVal;
          if (!price) continue;
          raw.push({
            raw_name: p.name,
            raw_price: price,
            pack_text: p.name,
            hint_cat: /fruit|apple|banana|mango|orange|kinnow|guava|grape|melon|dates/i.test(p.name) ? 'fruit' : null,
          });
        }
        if (raw.length >= 25) break;
      }
    } catch {
      // try next
    }
  }
  return { items: raw, endpoints: hitUrls };
}

/**
 * Generic Playwright product card extractor (runs inside browser context).
 */
export async function genericPlaywrightExtract(page) {
  return page.evaluate(() => {
    const out = [];
    const cards = document.querySelectorAll(
      '[class*="product"], [class*="item-card"], [data-testid*="product"], .product-card, .card, article, li.product, tr'
    );
    for (const el of cards) {
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 260) continue;
      const priceMatch = text.match(/(?:Rs\.?|PKR)\s*([0-9,]+(?:\.\d{1,2})?)/i);
      if (!priceMatch) continue;
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (!Number.isFinite(price) || price <= 0 || price > 25000) continue;
      const heading = el.querySelector('h1,h2,h3,h4,h5,.title,.name,[class*="title"],[class*="name"],a,td');
      const rawName = (heading?.innerText || text.split(/Rs\.?|PKR/i)[0] || '').replace(/\s+/g, ' ').trim();
      if (rawName.length < 2 || rawName.length > 90) continue;
      out.push({ raw_name: rawName, raw_price: price, pack_text: text });
    }
    return out;
  });
}

/**
 * Run a standard 6-step store scrape with 45s timeout and cached fallback.
 */
export async function runStandardStore({
  meta,
  browser,
  prevStoreData,
  prevHistory = {},
  todayPkt,
  tryJson = null,
  playwrightConfig = null,
}) {
  const logger = createWorkflowLogger(meta);
  const storePrevItems = prevStoreData?.items || {};
  const yesterdayItems = Object.keys(storePrevItems).length || null;

  let rawItems = [];
  let siteReportedDate = null;
  let method = 'JSON';
  let usedPlaywright = false;
  let openFailed = false;
  let openError = null;

  const deadline = Date.now() + 45000;

  // Step 1: Open Website
  logger.startStep(1, 'Open Website');
  try {
    if (tryJson) {
      const res = await Promise.race([
        tryJson(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('JSON fetch timeout (20s)')), 20000)),
      ]);
      if (res?.items?.length) {
        rawItems = res.items;
        siteReportedDate = res.siteReportedDate || null;
        logger.pass(`Fetched ${res.endpoints?.length || 1} JSON endpoint(s) at ${meta.url} (${rawItems.length} raw entries).`);
      }
    }

    if (!rawItems.length) {
      if (!browser) {
        throw new Error('JSON endpoints returned no items and Playwright browser is unavailable in this environment.');
      }
      method = 'Browser';
      usedPlaywright = true;
      const ctx = await browser.newContext({
        userAgent: USER_AGENT,
        locale: 'en-PK',
        viewport: { width: 1280, height: 800 },
      });
      const page = await ctx.newPage();
      try {
        const targetUrl = playwrightConfig?.url || meta.url;
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 22000 });
        await page.waitForTimeout(1500);
        logger.pass(`Opened ${targetUrl} in headless Chromium.`);

        // Step 2: Select Location / Options
        logger.startStep(2, 'Select Location / Options');
        try {
          if (playwrightConfig?.selectKarachi) {
            const msg = await playwrightConfig.selectKarachi(page);
            logger.pass(msg || 'Selected Karachi location.');
          } else {
            const cityBtn = page.locator('button:has-text("Karachi"), a:has-text("Karachi"), [data-city="Karachi"]').first();
            if (await cityBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
              await cityBtn.click({ timeout: 2000 }).catch(() => {});
              await page.waitForTimeout(800);
              logger.pass('Selected "Karachi" in city selector.');
            } else {
              logger.pass('Default Karachi / nationwide store view active (no city popup).');
            }
          }
        } catch (e) {
          logger.warn('Could not confirm city selector; continuing with default view.', e.message);
        }

        // Step 3: Navigate Categories
        logger.startStep(3, 'Navigate Categories');
        const catUrls = playwrightConfig?.categoryUrls || [targetUrl];
        const visited = [];
        for (const cu of catUrls) {
          if (Date.now() > deadline - 5000) break;
          try {
            if (cu !== page.url()) {
              await page.goto(cu, { waitUntil: 'domcontentloaded', timeout: 15000 });
              await page.waitForTimeout(1200);
            }
            const extracted = playwrightConfig?.extract
              ? await playwrightConfig.extract(page)
              : await genericPlaywrightExtract(page);
            if (extracted?.length) rawItems.push(...extracted);
            visited.push(cu);
          } catch {
            // continue other category URLs
          }
        }
        if (visited.length) {
          logger.pass(`Checked ${visited.length} category page(s): ${meta.categories.join(', ')}.`);
        } else {
          logger.fail(`Failed to load category pages for ${meta.name}.`, 'Navigation timeout or blocked');
        }
      } finally {
        await ctx.close().catch(() => {});
      }
    } else {
      // JSON path: mark Steps 2 & 3 cleanly
      logger.startStep(2, 'Select Location / Options');
      logger.pass(meta.cityNote || 'Karachi catalog endpoint targeted directly via JSON.');
      logger.startStep(3, 'Navigate Categories');
      logger.pass(`Scanned ${meta.categories.join(', ')} via ${method} API.`);
    }
  } catch (e) {
    openFailed = true;
    openError = e.message;
    logger.fail(`Failed to open ${meta.url}: ${e.message}`, e.message);
    if (!usedPlaywright) {
      logger.startStep(2, 'Select Location / Options');
      logger.skip('Skipped because website could not be opened.');
      logger.startStep(3, 'Navigate Categories');
      logger.skip('Skipped because website could not be opened.');
    }
  }

  // Step 4: Extract & Standardize Rates
  logger.startStep(4, 'Extract & Standardize Rates');
  const normalizedMap = {};
  let matchedCount = 0;
  for (const r of rawItems) {
    const master = matchMasterItem(r.raw_name, r.hint_cat);
    if (!master) continue;
    const norm = normalizePackPrice(r.raw_price, r.pack_text || r.raw_name, master);
    if (!norm) continue;
    matchedCount++;
    // Keep the first or lowest valid per-kg offer for the same master item
    if (!normalizedMap[master.id] || norm.normalized_price < normalizedMap[master.id].price) {
      normalizedMap[master.id] = {
        id: master.id,
        raw_name: r.raw_name,
        price: norm.normalized_price,
        unit: norm.normalized_unit,
        raw_price: norm.raw_price,
        pack_unit: norm.pack_unit,
        original_pack_label: norm.original_pack_label,
      };
    }
  }
  const normalizedItems = Object.values(normalizedMap);
  if (normalizedItems.length > 0) {
    logger.pass(`Found ${rawItems.length} raw entries; matched & standardized ${normalizedItems.length} unique vegetables/fruits.`);
  } else if (openFailed) {
    logger.skip('Skipped rate extraction because site load failed.');
  } else {
    logger.warn(`Loaded ${rawItems.length} raw entries but 0 matched master vegetable/fruit items.`, 'No matching produce items extracted');
  }

  // Step 5: Compare Against Previous Run
  logger.startStep(5, 'Compare Against Previous Run');
  let priceChanges = 0;
  let unchanged = 0;
  const finalItems = {};
  let latestChangeDate = prevStoreData?.price_last_changed_date || null;

  if (normalizedItems.length > 0) {
    for (const it of normalizedItems) {
      const prevEntry = prevHistory?.[meta.id]?.[it.id] || storePrevItems[it.id] || null;
      const dateMeta = computeDateMeta({
        price: it.price,
        prevEntry,
        siteReportedDate,
        todayPkt,
      });
      if (dateMeta.status === 'updated_today') priceChanges++;
      else unchanged++;
      if (dateMeta.price_last_changed_date && (!latestChangeDate || dateMeta.price_last_changed_date > latestChangeDate)) {
        latestChangeDate = dateMeta.price_last_changed_date;
      }
      finalItems[it.id] = { ...it, ...dateMeta };
    }
    logger.pass(`${priceChanges} price(s) changed, ${unchanged} unchanged vs previous run.`);
  } else if (Object.keys(storePrevItems).length > 0) {
    for (const [id, prevIt] of Object.entries(storePrevItems)) {
      finalItems[id] = {
        ...prevIt,
        last_checked_date: prevIt.last_checked_date || todayPkt,
        status: 'cached_fallback',
      };
    }
    logger.warn(`Kept ${Object.keys(finalItems).length} cached items from previous successful run.`);
  } else {
    logger.skip('No previous cached prices available to compare.');
  }

  // Step 6: Save Results
  logger.startStep(6, 'Save Results');
  const count = Object.keys(finalItems).length;
  let finalStatus = 'success';
  let usedCache = false;

  if (normalizedItems.length > 0) {
    logger.pass(`Saved ${count} standardized rates for ${meta.name}.`);
  } else if (count > 0) {
    usedCache = true;
    finalStatus = openFailed ? 'blocked' : 'partial';
    logger.warn(`Fallback: kept ${count} cached rates (status: ${finalStatus}).`, openError);
  } else {
    finalStatus = openFailed ? 'blocked' : 'failed';
    logger.fail(`No rates saved for ${meta.name}.`, openError || '0 items extracted and no cache');
  }

  const botLog = logger.finalize({
    status: finalStatus,
    itemsChecked: count,
    yesterdayItems,
    priceChanges,
    usedCache,
    lastCheckedDate: normalizedItems.length > 0 ? todayPkt : prevStoreData?.last_checked_date || todayPkt,
    priceLastChangedDate: latestChangeDate,
  });

  return {
    store: {
      id: meta.id,
      name: meta.name,
      name_ur: meta.nameUr,
      url: meta.url,
      status: normalizedItems.length > 0 ? 'ok' : count > 0 ? 'stale' : 'blocked',
      item_count: count,
      last_checked_date: botLog.last_checked_date,
      site_reported_date: siteReportedDate,
      price_last_changed_date: latestChangeDate,
      items: finalItems,
    },
    botLog,
  };
}
