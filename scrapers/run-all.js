// Master runner for all 12 Karachi grocery scraper bots.
// Outputs:
//   public/data/market_comparison.json
//   public/data/price_history.json
//   public/data/bot_logs.json
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { pkToday, pkNowLabel } from './baseScraper.js';
import { updateBotLogs } from './workflowLogger.js';

import * as carrefour from './carrefour.js';
import * as metro from './metro.js';
import * as freshbasket from './freshbasket.js';
import * as diamond from './diamond.js';
import * as hydri from './hydri.js';
import * as cartpk from './cartpk.js';
import * as fruitsabzi from './fruitsabzi.js';
import * as vegevista from './vegevista.js';
import * as royalbasket from './royalbasket.js';
import * as arysahulat from './arysahulat.js';
import * as kravemart from './kravemart.js';
import * as narkh from './narkh.js';

const BOTS = [
  carrefour, metro, freshbasket, diamond, hydri, cartpk,
  fruitsabzi, vegevista, royalbasket, arysahulat, kravemart, narkh,
];

const OUT_DIR = path.resolve(process.cwd(), 'public/data');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

async function main() {
  const startedAt = Date.now();
  const todayPkt = pkToday();
  const runAtIso = new Date().toISOString();
  const runAtPktLabel = pkNowLabel();

  const compFile = path.join(OUT_DIR, 'market_comparison.json');
  const histFile = path.join(OUT_DIR, 'price_history.json');
  const logsFile = path.join(OUT_DIR, 'bot_logs.json');

  const prevComparison = readJSON(compFile, { stores: {} });
  const prevHistory = readJSON(histFile, { stores: {} });
  const prevLogs = readJSON(logsFile, { days: {} });

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  } catch (e) {
    console.warn('Playwright Chromium launch failed (JSON-only mode):', e.message);
  }

  const storesMap = {};
  const botLogs = [];

  try {
    // Run in batches of 3 to balance speed and memory on GitHub Actions
    for (let i = 0; i < BOTS.length; i += 3) {
      const batch = BOTS.slice(i, i + 3);
      const results = await Promise.all(
        batch.map(async (bot) => {
          const id = bot.STORE_META.id;
          try {
            return await bot.scrape({
              browser,
              prevStoreData: prevComparison.stores?.[id] || null,
              prevHistory: prevHistory.stores || {},
              todayPkt,
            });
          } catch (err) {
            console.error(`Unexpected crash in ${id}:`, err.message);
            return null;
          }
        })
      );
      for (const r of results) {
        if (!r) continue;
        storesMap[r.store.id] = r.store;
        botLogs.push(r.botLog);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // Update price_history.json (keep latest entry + rolling 30-day history per store item)
  const nextHistoryStores = { ...(prevHistory.stores || {}) };
  for (const [storeId, store] of Object.entries(storesMap)) {
    const storeHist = { ...(nextHistoryStores[storeId] || {}) };
    for (const [itemId, item] of Object.entries(store.items || {})) {
      if (item.price == null) continue;
      const prev = storeHist[itemId] || {};
      const log = Array.isArray(prev.log) ? prev.log.slice(-29) : [];
      if (!log.length || log[log.length - 1].d !== todayPkt) {
        log.push({ d: todayPkt, p: item.price });
      } else {
        log[log.length - 1].p = item.price;
      }
      storeHist[itemId] = {
        price: item.price,
        last_checked_date: item.last_checked_date,
        site_reported_date: item.site_reported_date,
        price_last_changed_date: item.price_last_changed_date,
        log,
      };
    }
    nextHistoryStores[storeId] = storeHist;
  }

  const totalDurationMs = Date.now() - startedAt;

  const marketComparison = {
    generated_at: runAtIso,
    date_pkt: todayPkt,
    run_at_pkt: runAtPktLabel,
    store_order: BOTS.map((b) => b.STORE_META.id),
    stores: storesMap,
  };

  const priceHistory = {
    updated_at: runAtIso,
    date_pkt: todayPkt,
    stores: nextHistoryStores,
  };

  const botLogsOut = updateBotLogs(prevLogs, {
    datePkt: todayPkt,
    runAtIso,
    runAtPktLabel,
    totalDurationMs,
    bots: botLogs,
  });

  writeJSON(compFile, marketComparison);
  writeJSON(histFile, priceHistory);
  writeJSON(logsFile, botLogsOut);

  const summary = botLogsOut.days[todayPkt].summary;
  console.log(
    `Market scrape done in ${(totalDurationMs / 1000).toFixed(1)}s: ` +
    `${summary.working} working, ${summary.partial} partial, ${summary.failed} blocked/failed, ${summary.total_items} items.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
