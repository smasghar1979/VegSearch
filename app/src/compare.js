// Upgraded Compare tab (Market Comparative Analysis) + Screenshot/Camera Price-List Scanner.
import { createWorker } from 'tesseract.js';
import { Chart } from 'chart.js';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { MASTER_ITEMS, MASTER_MAP, matchMasterItem, normalizePackPrice } from '../../shared/normalize.js';

const LS_CUSTOM = 'vegsearch_custom_competitors';
const LS_SELECTED = 'vegsearch_compare_stores';
const LS_GEMINI_KEY = 'vegsearch_gemini_key';

const DEFAULT_STORE_ORDER = [
  'carrefour', 'metro', 'freshbasket', 'diamond', 'hydri', 'cartpk',
  'fruitsabzi', 'vegevista', 'royalbasket', 'arysahulat', 'kravemart', 'narkh',
];

export const cmpState = {
  cat: 'veg',
  query: '',
  baseline: 'w', // 'w' = mandi wholesale, 'r' = official retail
  selectedStores: null,
  customStores: loadCustomStores(),
  modalItem: null,
  scannerOpen: false,
  scannerSettingsOpen: false,
  scannerImages: [], // { dataUrl, mime, name }
  scannerRows: [],   // { raw_name, matched_master_item, detected_pack_price, pack_unit, normalized_per_kg_price }
  scannerName: '',
  scannerDate: '',
  scannerMergeId: '',
  scannerBusy: false,
  scannerError: '',
  cameraStream: null,
};

let modalChart = null;

function loadCustomStores() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_CUSTOM) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveCustomStores() {
  try { localStorage.setItem(LS_CUSTOM, JSON.stringify(cmpState.customStores)); } catch {}
}

function getSelectedStores(marketData) {
  if (cmpState.selectedStores) return cmpState.selectedStores;
  try {
    const saved = JSON.parse(localStorage.getItem(LS_SELECTED) || 'null');
    if (Array.isArray(saved) && saved.length) {
      cmpState.selectedStores = saved;
      return saved;
    }
  } catch {}
  const stores = marketData?.stores || {};
  const okIds = Object.values(stores).filter((s) => s.item_count > 0).map((s) => s.id);
  const customIds = cmpState.customStores.filter((c) => c.visible !== false).map((c) => c.id);
  const init = [...(okIds.length ? okIds : ['metro', 'freshbasket', 'royalbasket', 'carrefour']), ...customIds];
  cmpState.selectedStores = init;
  return init;
}

function setSelectedStores(ids) {
  cmpState.selectedStores = ids;
  try { localStorage.setItem(LS_SELECTED, JSON.stringify(ids)); } catch {}
}

export async function loadMarketComparison(dataBase) {
  const file = 'data/market_comparison.json';
  const cacheKey = 'data:market_comparison';
  try {
    const res = await fetch(`${dataBase}${file}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    try { localStorage.setItem(cacheKey, JSON.stringify(json)); } catch {}
    return json;
  } catch {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
    if (dataBase !== './') {
      try {
        const bundled = await fetch(`./${file}`);
        if (bundled.ok) return await bundled.json();
      } catch {}
    }
    return null;
  }
}

function allColumns(marketData) {
  const order = marketData?.store_order || DEFAULT_STORE_ORDER;
  const stores = marketData?.stores || {};
  const scraped = order.map((id) => stores[id] || { id, name: id, name_ur: id, status: 'blocked', item_count: 0, items: {} });
  const custom = cmpState.customStores.map((c) => ({ ...c, isCustom: true }));
  return { scraped, custom, all: [...scraped, ...custom] };
}

function buildRows(ctx) {
  const { data, marketData, latestInfo } = ctx;
  const { all } = allColumns(marketData);
  const selSet = new Set(getSelectedStores(marketData));
  const activeCols = all.filter((c) => selSet.has(c.id));
  const q = cmpState.query.trim().toLowerCase();

  let items = (data?.items || []).filter((i) => i.cat === cmpState.cat);
  if (q) items = items.filter((i) => `${i.en} ${i.ur} ${i.id}`.toLowerCase().includes(q));

  return {
    activeCols,
    rows: items.map((it) => {
      const mandi = it.w ?? latestInfo(it, 'w').val;
      const retail = it.r ?? latestInfo(it, 'r').val;
      const base = cmpState.baseline === 'w' ? (mandi ?? retail) : (retail ?? mandi);

      const offers = [];
      const cells = activeCols.map((col) => {
        const entry = col.items?.[it.id] || null;
        if (entry?.price != null) {
          offers.push({ colId: col.id, colName: ctx.lang === 'ur' ? (col.name_ur || col.name) : col.name, price: entry.price });
        }
        return { col, entry };
      });

      offers.sort((a, b) => a.price - b.price);
      const lowest = offers[0] || null;
      const highest = offers.length ? offers[offers.length - 1] : null;
      const avgStore = offers.length ? offers.reduce((s, o) => s + o.price, 0) / offers.length : null;
      const marginPkr = base != null && avgStore != null ? Math.round((avgStore - base) * 10) / 10 : null;
      const marginPct = base && marginPkr != null ? (marginPkr / base) * 100 : null;

      return { it, mandi, retail, base, cells, lowest, highest, marginPkr, marginPct, offers };
    }),
  };
}

function fmtShort(d, lang) {
  if (!d) return '—';
  const dt = new Date(d + 'T12:00:00');
  return new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'short', numberingSystem: 'latn' }).format(dt);
}

export function renderCompareTab(ctx) {
  const { marketData, lang, t, esc } = ctx;
  const { scraped, custom, all } = allColumns(marketData);
  const selSet = new Set(getSelectedStores(marketData));
  const { activeCols, rows } = buildRows(ctx);

  const statusDot = (s) => (s.status === 'ok' ? 'dot-ok' : s.status === 'stale' ? 'dot-warn' : 'dot-bad');

  const storePills = scraped.map((s) => `
    <div class="store-pill">
      <span class="sdot ${statusDot(s)}"></span>
      <div>
        <b>${esc(lang === 'ur' ? s.name_ur || s.name : s.name)}</b>
        <small>${s.item_count || 0} · ${t('checked')}: ${fmtShort(s.last_checked_date, lang)} · ${t('rateSince')}: ${fmtShort(s.price_last_changed_date, lang)}</small>
      </div>
    </div>`).join('');

  const customPills = custom.map((c) => `
    <div class="store-pill custom">
      <span class="sdot dot-ok"></span>
      <div>
        <b>📷 ${esc(c.name)}</b>
        <small>${Object.keys(c.items || {}).length} · ${fmtShort(c.date, lang)}</small>
      </div>
      <div class="pill-btns">
        <button type="button" data-cact="edit" data-cid="${esc(c.id)}" title="Edit">✏️</button>
        <button type="button" data-cact="del" data-cid="${esc(c.id)}" title="Delete">🗑️</button>
      </div>
    </div>`).join('');

  const checkboxes = all.map((c) => `
    <label class="chk ${selSet.has(c.id) ? 'on' : ''}">
      <input type="checkbox" data-store-chk="${esc(c.id)}" ${selSet.has(c.id) ? 'checked' : ''}>
      <span>${c.isCustom ? '📷 ' : ''}${esc(lang === 'ur' ? c.name_ur || c.name : c.name)}</span>
    </label>`).join('');

  return `
  <div class="cmp-head">
    <div>
      <h2 class="cmp-title">📊 ${t('marketCompare')}</h2>
      ${marketData?.run_at_pkt ? `<small class="muted">${t('lastRun')}: ${esc(marketData.run_at_pkt)}</small>` : ''}
    </div>
    <button class="btn scan-btn" data-cmp-act="open-scanner">${t('scanUploadBtn')}</button>
  </div>

  ${!marketData ? `<div class="banner warn">${t('noMarketData')}</div>` : ''}

  <div class="store-strip">${storePills}${customPills}</div>

  <div class="card cmp-controls">
    <div class="seg">
      <button data-cmp-cat="veg" class="${cmpState.cat === 'veg' ? 'on' : ''}">🥦 ${t('veg')}</button>
      <button data-cmp-cat="fruit" class="${cmpState.cat === 'fruit' ? 'on' : ''}">🍎 ${t('fruit')}</button>
    </div>
    <div class="seg">
      <button data-cmp-base="w" class="${cmpState.baseline === 'w' ? 'on' : ''}">${t('baselineMandi')}</button>
      <button data-cmp-base="r" class="${cmpState.baseline === 'r' ? 'on' : ''}">${t('baselineRetail')}</button>
    </div>
    <div class="searchbar"><input id="cmpSearch" type="search" placeholder="${t('search')}" value="${esc(cmpState.query)}"></div>
    <details class="store-picker">
      <summary>${t('selectStores')} (${activeCols.length}/${all.length})</summary>
      <div class="chk-grid">${checkboxes}</div>
    </details>
  </div>

  <section id="cmpCapture" class="sheet cmp-sheet">
    <div class="table-wrap">
      <table class="rates cmp-table">
        <thead>
          <tr>
            <th>${t('item')}</th>
            <th>${t('commMandiCol')}</th>
            <th>${t('commRetailCol')}</th>
            ${activeCols.map((c) => `<th>${c.isCustom ? '📷 ' : ''}${esc(lang === 'ur' ? c.name_ur || c.name : c.name)}</th>`).join('')}
            <th>${t('lowestSeller')}</th>
            <th>${t('highestSeller')}</th>
            <th>${t('profitMargin')}</th>
          </tr>
        </thead>
        <tbody id="cmpTableBody">${renderTableRows(rows, ctx)}</tbody>
      </table>
    </div>
  </section>

  <div class="actions two no-capture">
    <button class="btn pdf" data-cmp-act="pdf">📄 ${t('downloadLandscapePdf')}</button>
    <button class="btn link" data-cmp-act="csv">📥 ${t('downloadCsv')}</button>
  </div>

  ${cmpState.modalItem ? renderItemModal(cmpState.modalItem, ctx) : ''}
  ${cmpState.scannerOpen ? renderScannerModal(ctx) : ''}`;
}

function renderTableRows(rows, ctx) {
  const { lang, t, esc, num } = ctx;
  if (!rows.length) return `<tr><td colspan="20" class="muted center">${t('noResults')}</td></tr>`;
  return rows.map(({ it, mandi, retail, cells, lowest, highest, marginPkr, marginPct }) => {
    const itemName = lang === 'ur' ? (it.ur || it.en) : (it.en || it.ur);
    const cellHtml = cells.map(({ col, entry }) => {
      if (!entry || entry.price == null) return `<td class="muted">—</td>`;
      const isLow = lowest && lowest.colId === col.id && (!highest || highest.colId !== lowest.colId);
      const isHigh = highest && highest.colId === col.id && (!lowest || highest.colId !== lowest.colId);
      const cls = isLow ? 'cell-low' : isHigh ? 'cell-high' : '';
      const dateBadge = entry.status === 'updated_today'
        ? t('updatedToday')
        : entry.site_reported_date
          ? fmtShort(entry.site_reported_date, lang)
          : entry.price_last_changed_date
            ? `${t('since')} ${fmtShort(entry.price_last_changed_date, lang)}`
            : '';
      return `<td class="${cls}">
        <b>${num(entry.price)}</b>
        <div class="cell-meta">${esc(entry.original_pack_label || '')}</div>
        ${dateBadge ? `<div class="cell-date">${esc(dateBadge)}</div>` : ''}
      </td>`;
    }).join('');

    const marginHtml = marginPkr != null
      ? `<span class="chg ${marginPkr > 0 ? 'up' : 'down'}">${marginPkr > 0 ? '+' : ''}${num(marginPkr)} <small>(${marginPct.toFixed(0)}%)</small></span>`
      : '—';

    return `<tr data-cmp-item="${esc(it.id)}">
      <td><b>${esc(itemName)}</b><small> ${esc(it.unit || 'kg')}</small></td>
      <td>${num(mandi)}</td>
      <td>${num(retail)}</td>
      ${cellHtml}
      <td class="cell-low">${lowest ? `<b>${num(lowest.price)}</b><div class="cell-meta">${esc(lowest.colName)}</div>` : '—'}</td>
      <td class="cell-high">${highest ? `<b>${num(highest.price)}</b><div class="cell-meta">${esc(highest.colName)}</div>` : '—'}</td>
      <td>${marginHtml}</td>
    </tr>`;
  }).join('');
}

function renderItemModal(itemId, ctx) {
  const { data, marketData, lang, t, esc, num } = ctx;
  const rows = buildRows(ctx).rows;
  const row = rows.find((r) => r.it.id === itemId);
  if (!row) return '';
  const itemName = lang === 'ur' ? (row.it.ur || row.it.en) : (row.it.en || row.it.ur);
  return `
  <div class="modal-backdrop" data-cmp-act="close-modal">
    <div class="modal-card">
      <div class="modal-head">
        <b>${esc(itemName)} (${esc(row.it.unit || 'kg')})</b>
        <button type="button" class="icon-close" data-cmp-act="close-modal">✕</button>
      </div>
      <div class="small muted">${t('commMandiCol')}: <b>${num(row.mandi)}</b> · ${t('commRetailCol')}: <b>${num(row.retail)}</b></div>
      <div class="chartbox tall" dir="ltr"><canvas id="cmpBarChart"></canvas></div>
    </div>
  </div>`;
}

function renderScannerModal(ctx) {
  const { lang, t, esc } = ctx;
  const hasKey = Boolean(localStorage.getItem(LS_GEMINI_KEY));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  const opts = MASTER_ITEMS.map((m) => `<option value="${esc(m.id)}">${esc(lang === 'ur' ? `${m.ur} (${m.en})` : `${m.en} (${m.ur})`)}</option>`).join('');

  return `
  <div class="modal-backdrop" data-cmp-act="close-scanner">
    <div class="modal-card wide">
      <div class="modal-head">
        <b>📷 ${t('importTitle')}</b>
        <div class="modal-head-acts">
          <button type="button" class="icon-btn" data-cmp-act="toggle-ai-key" title="${t('aiVisionBoost')}">⚙️</button>
          <button type="button" class="icon-close" data-cmp-act="close-scanner">✕</button>
        </div>
      </div>

      ${cmpState.scannerSettingsOpen ? `
        <div class="card ai-box">
          <label class="small"><b>${t('aiVisionBoost')}</b></label>
          <div class="row-inline">
            <input id="aiKeyInput" type="password" placeholder="${t('aiKeyPlaceholder')}" value="${esc(localStorage.getItem(LS_GEMINI_KEY) || '')}">
            <button type="button" class="btn small-btn" data-cmp-act="save-ai-key">${t('saveKey')}</button>
          </div>
        </div>` : ''}

      <div class="scan-inputs">
        <label class="btn scan-pick">
          🖼️ ${t('uploadScreenshots')}
          <input id="scanUploadInput" type="file" accept="image/*" multiple hidden>
        </label>
        <label class="btn scan-pick cam">
          📸 ${t('takePhoto')}
          <input id="scanCameraInput" type="file" accept="image/*" capture="environment" hidden>
        </label>
        <button type="button" class="btn scan-pick webcam" data-cmp-act="open-webrtc">🎥 ${t('liveCamera')}</button>
      </div>

      <div id="webrtcBox" class="webrtc-box" style="display:none">
        <video id="webrtcVideo" autoplay playsinline></video>
        <button type="button" class="btn scan-btn" data-cmp-act="capture-webrtc">📸 ${t('captureFrame')}</button>
      </div>

      ${cmpState.scannerImages.length ? `
        <div class="thumbs">
          ${cmpState.scannerImages.map((im) => `<img src="${im.dataUrl}" alt="${esc(im.name)}">`).join('')}
        </div>` : ''}

      <div class="scan-meta">
        <label class="small">${t('competitorName')}
          <input id="scanBrand" type="text" placeholder="Imtiaz Super Market" value="${esc(cmpState.scannerName)}">
        </label>
        <div class="chips">
          ${['Imtiaz Super Market', 'Foodpanda / Pandamart', 'Local Sabzi Shop'].map((s) => `<button type="button" class="chip" data-brand-preset="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>
        <div class="row-inline">
          <label class="small" style="flex:1">${t('priceListDate')}
            <input id="scanDate" type="date" value="${esc(cmpState.scannerDate || today)}">
          </label>
          ${cmpState.customStores.length ? `
            <label class="small" style="flex:1">${t('mergeExisting')}
              <select id="scanMerge">
                <option value="">— New Column —</option>
                ${cmpState.customStores.map((c) => `<option value="${esc(c.id)}" ${cmpState.scannerMergeId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
              </select>
            </label>` : ''}
        </div>
      </div>

      ${cmpState.scannerBusy ? `<div class="banner warn">⏳ ${t('ocrRunning')} (${hasKey ? 'Gemini AI Vision' : 'Tesseract OCR'})</div>` : ''}
      ${cmpState.scannerError ? `<div class="banner warn">${esc(cmpState.scannerError)}</div>` : ''}

      ${cmpState.scannerRows.length ? `
        <div class="table-wrap">
          <table class="rates">
            <thead><tr><th>${t('editRowItem')}</th><th>${t('editRowPrice')}</th><th>${t('editRowUnit')}</th><th>${t('editRowPerKg')}</th><th></th></tr></thead>
            <tbody>
              ${cmpState.scannerRows.map((r, idx) => `
                <tr>
                  <td>
                    <select data-srow-item="${idx}">
                      <option value="">—</option>
                      ${opts.replace(`value="${r.matched_master_item}"`, `value="${r.matched_master_item}" selected`)}
                    </select>
                    <div class="cell-meta">${esc(r.raw_name)}</div>
                  </td>
                  <td><input class="mini-in" type="number" step="1" data-srow-price="${idx}" value="${r.detected_pack_price ?? ''}"></td>
                  <td><input class="mini-in" type="text" data-srow-unit="${idx}" value="${esc(r.pack_unit || '1kg')}"></td>
                  <td><b>${r.normalized_per_kg_price ?? '—'}</b></td>
                  <td><button type="button" data-srow-del="${idx}">✕</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="row-inline" style="margin-top:8px">
          <button type="button" class="chip" data-cmp-act="add-empty-row">+ Add Row</button>
          <button type="button" class="btn scan-btn" style="flex:1" data-cmp-act="save-column">✅ ${t('addColumnBtn')}</button>
        </div>
      ` : ''}
    </div>
  </div>`;
}

export function drawCompareBarChart(ctx) {
  if (modalChart) { modalChart.destroy(); modalChart = null; }
  if (!cmpState.modalItem) return;
  const cv = document.getElementById('cmpBarChart');
  if (!cv) return;
  const row = buildRows(ctx).rows.find((r) => r.it.id === cmpState.modalItem);
  if (!row) return;

  const labels = [];
  const values = [];
  const colors = [];
  if (row.mandi != null) { labels.push(ctx.t('commMandiCol')); values.push(row.mandi); colors.push('#1b5e20'); }
  if (row.retail != null) { labels.push(ctx.t('commRetailCol')); values.push(row.retail); colors.push('#2e7d32'); }
  for (const o of row.offers) {
    labels.push(o.colName);
    values.push(o.price);
    colors.push(row.lowest?.colId === o.colId ? '#43a047' : row.highest?.colId === o.colId ? '#d32f2f' : '#1565c0');
  }

  modalChart = new Chart(cv, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'PKR', data: values, backgroundColor: colors, borderRadius: 6 }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    },
  });
}

async function runOcrOnImages(images) {
  const apiKey = localStorage.getItem(LS_GEMINI_KEY);
  if (apiKey) {
    return runGeminiVision(images, apiKey);
  }
  const worker = await createWorker('eng');
  const lines = [];
  try {
    for (const img of images) {
      const { data: { text } } = await worker.recognize(img.dataUrl);
      lines.push(...text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
    }
  } finally {
    await worker.terminate();
  }
  return parseOcrLines(lines);
}

function parseOcrLines(lines) {
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const combined = /\d/.test(line) ? line : `${line} ${lines[i + 1] || ''}`;
    const priceM = combined.match(/(?:rs\.?|pkr)?\s*(\d{2,5}(?:\.\d{1,2})?)/i);
    if (!priceM) continue;
    const price = parseFloat(priceM[1]);
    if (!price || price < 5 || price > 15000) continue;
    const master = matchMasterItem(line) || matchMasterItem(combined);
    if (!master) continue;
    const norm = normalizePackPrice(price, combined, master);
    if (!norm) continue;
    rows.push({
      raw_name: line.slice(0, 60),
      matched_master_item: master.id,
      detected_pack_price: norm.raw_price,
      pack_unit: norm.pack_unit,
      normalized_per_kg_price: norm.normalized_price,
    });
  }
  return rows;
}

async function runGeminiVision(images, apiKey) {
  const parts = [
    {
      text: `Extract all vegetable and fruit prices from these grocery screenshots/photos (Karachi, PKR).
Return JSON array of objects with:
- raw_name: item name as shown
- matched_master_item: closest id from [${MASTER_ITEMS.map((m) => m.id).join(', ')}] or ""
- detected_pack_price: number in PKR
- pack_unit: e.g. "250g", "500g", "1kg", "bunch", "dozen"
- normalized_per_kg_price: price converted to per 1 kg (or per bunch for herbs)`,
    },
    ...images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.dataUrl.split(',')[1] } })),
  ];
  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        raw_name: { type: 'STRING' },
        matched_master_item: { type: 'STRING' },
        detected_pack_price: { type: 'NUMBER' },
        pack_unit: { type: 'STRING' },
        normalized_per_kg_price: { type: 'NUMBER' },
      },
      required: ['raw_name', 'matched_master_item', 'detected_pack_price', 'pack_unit', 'normalized_per_kg_price'],
    },
  };
  for (const model of ['gemini-2.5-flash', 'gemini-3.5-flash-lite']) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: schema },
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      const arr = JSON.parse(text);
      return arr.map((r) => {
        const master = MASTER_MAP[r.matched_master_item] || matchMasterItem(r.raw_name);
        const norm = normalizePackPrice(r.detected_pack_price, r.pack_unit, master);
        return {
          raw_name: r.raw_name,
          matched_master_item: master?.id || r.matched_master_item || '',
          detected_pack_price: r.detected_pack_price,
          pack_unit: norm?.pack_unit || r.pack_unit,
          normalized_per_kg_price: norm?.normalized_price || r.normalized_per_kg_price,
        };
      });
    } catch {}
  }
  throw new Error('Gemini Vision request failed — check your API key.');
}

async function readFilesAsDataUrls(fileList) {
  const out = [];
  for (const file of [...fileList]) {
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    out.push({ dataUrl, mime: file.type || 'image/jpeg', name: file.name });
  }
  return out;
}

function stopCamera() {
  if (cmpState.cameraStream) {
    cmpState.cameraStream.getTracks().forEach((tr) => tr.stop());
    cmpState.cameraStream = null;
  }
}

export async function handleCompareClick(e, ctx, rerender, toast) {
  const el = e.target;
  const catBtn = el.closest('[data-cmp-cat]');
  if (catBtn) { cmpState.cat = catBtn.dataset.cmpCat; rerender(); return true; }

  const baseBtn = el.closest('[data-cmp-base]');
  if (baseBtn) { cmpState.baseline = baseBtn.dataset.cmpBase; rerender(); return true; }

  const cact = el.closest('[data-cact]');
  if (cact) {
    const cid = cact.dataset.cid;
    if (cact.dataset.cact === 'del') {
      cmpState.customStores = cmpState.customStores.filter((c) => c.id !== cid);
      saveCustomStores();
      setSelectedStores(getSelectedStores(ctx.marketData).filter((x) => x !== cid));
      rerender();
    } else if (cact.dataset.cact === 'edit') {
      const cs = cmpState.customStores.find((c) => c.id === cid);
      if (cs) {
        const nextName = prompt('Rename competitor:', cs.name);
        if (nextName && nextName.trim()) { cs.name = nextName.trim(); saveCustomStores(); rerender(); }
      }
    }
    return true;
  }

  const rowTr = el.closest('tr[data-cmp-item]');
  if (rowTr) { cmpState.modalItem = rowTr.dataset.cmpItem; rerender(); return true; }

  const preset = el.closest('[data-brand-preset]');
  if (preset) {
    cmpState.scannerName = preset.dataset.brandPreset;
    const inp = document.getElementById('scanBrand');
    if (inp) inp.value = cmpState.scannerName;
    return true;
  }

  const sdel = el.closest('[data-srow-del]');
  if (sdel) {
    cmpState.scannerRows.splice(+sdel.dataset.srowDel, 1);
    rerender();
    return true;
  }

  const actEl = el.closest('[data-cmp-act]');
  if (!actEl) return false;
  const act = actEl.dataset.cmpAct;

  if (act === 'open-scanner') { cmpState.scannerOpen = true; cmpState.scannerError = ''; rerender(); return true; }
  if (act === 'close-scanner') {
    if (actEl.classList.contains('modal-backdrop') && e.target !== actEl) return false;
    stopCamera(); cmpState.scannerOpen = false; rerender(); return true;
  }
  if (act === 'close-modal') {
    if (actEl.classList.contains('modal-backdrop') && e.target !== actEl) return false;
    cmpState.modalItem = null; rerender(); return true;
  }
  if (act === 'toggle-ai-key') { cmpState.scannerSettingsOpen = !cmpState.scannerSettingsOpen; rerender(); return true; }
  if (act === 'save-ai-key') {
    const val = document.getElementById('aiKeyInput')?.value.trim() || '';
    if (val) localStorage.setItem(LS_GEMINI_KEY, val);
    else localStorage.removeItem(LS_GEMINI_KEY);
    toast(ctx.t('saved'));
    cmpState.scannerSettingsOpen = false;
    rerender();
    return true;
  }
  if (act === 'open-webrtc') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      cmpState.cameraStream = stream;
      const box = document.getElementById('webrtcBox');
      const vid = document.getElementById('webrtcVideo');
      if (box && vid) { box.style.display = 'block'; vid.srcObject = stream; }
    } catch (err) {
      cmpState.scannerError = `Camera unavailable: ${err.message}`;
      rerender();
    }
    return true;
  }
  if (act === 'capture-webrtc') {
    const vid = document.getElementById('webrtcVideo');
    if (vid && vid.videoWidth) {
      const cv = document.createElement('canvas');
      cv.width = vid.videoWidth; cv.height = vid.videoHeight;
      cv.getContext('2d').drawImage(vid, 0, 0);
      stopCamera();
      await processScannedImages([{ dataUrl: cv.toDataURL('image/jpeg', 0.9), mime: 'image/jpeg', name: 'camera.jpg' }], rerender);
    }
    return true;
  }
  if (act === 'add-empty-row') {
    cmpState.scannerRows.push({ raw_name: 'Manual', matched_master_item: 'potato', detected_pack_price: 0, pack_unit: '1kg', normalized_per_kg_price: 0 });
    rerender();
    return true;
  }
  if (act === 'save-column') {
    const brand = document.getElementById('scanBrand')?.value.trim() || 'Custom Store';
    const date = document.getElementById('scanDate')?.value || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
    const mergeId = document.getElementById('scanMerge')?.value || '';
    const itemsMap = {};
    for (const r of cmpState.scannerRows) {
      if (!r.matched_master_item || !r.normalized_per_kg_price) continue;
      itemsMap[r.matched_master_item] = {
        id: r.matched_master_item,
        raw_name: r.raw_name,
        price: r.normalized_per_kg_price,
        raw_price: r.detected_pack_price,
        pack_unit: r.pack_unit,
        original_pack_label: `Rs. ${r.detected_pack_price} / ${r.pack_unit}`,
        last_checked_date: date,
        price_last_changed_date: date,
        status: 'updated_today',
      };
    }
    let colId = mergeId;
    if (mergeId) {
      const target = cmpState.customStores.find((c) => c.id === mergeId);
      if (target) { target.items = { ...target.items, ...itemsMap }; target.date = date; }
    } else {
      colId = `custom_${Date.now()}`;
      cmpState.customStores.push({ id: colId, name: brand, name_ur: brand, date, visible: true, items: itemsMap });
    }
    saveCustomStores();
    const sel = new Set(getSelectedStores(ctx.marketData));
    sel.add(colId);
    setSelectedStores([...sel]);
    stopCamera();
    cmpState.scannerOpen = false;
    cmpState.scannerImages = [];
    cmpState.scannerRows = [];
    toast(ctx.t('saved'));
    rerender();
    return true;
  }
  if (act === 'csv') {
    exportCsv(ctx);
    return true;
  }
  if (act === 'pdf') {
    await exportLandscapePdf(ctx, toast);
    return true;
  }
  return false;
}

async function processScannedImages(images, rerender) {
  cmpState.scannerImages = [...cmpState.scannerImages, ...images];
  cmpState.scannerBusy = true;
  cmpState.scannerError = '';
  rerender();
  try {
    const extracted = await runOcrOnImages(cmpState.scannerImages);
    cmpState.scannerRows = extracted.length
      ? extracted
      : [{ raw_name: 'Sample', matched_master_item: 'tomato', detected_pack_price: 0, pack_unit: '1kg', normalized_per_kg_price: 0 }];
  } catch (err) {
    cmpState.scannerError = err.message;
  } finally {
    cmpState.scannerBusy = false;
    rerender();
  }
}

export function handleCompareInput(e, ctx, rerender) {
  if (e.target.id === 'cmpSearch') {
    cmpState.query = e.target.value;
    const tbody = document.getElementById('cmpTableBody');
    if (tbody) tbody.innerHTML = renderTableRows(buildRows(ctx).rows, ctx);
    return true;
  }
  if (e.target.id === 'scanBrand') { cmpState.scannerName = e.target.value; return true; }
  if (e.target.id === 'scanDate') { cmpState.scannerDate = e.target.value; return true; }
  if (e.target.dataset.srowPrice != null || e.target.dataset.srowUnit != null) {
    const idx = +(e.target.dataset.srowPrice ?? e.target.dataset.srowUnit);
    const row = cmpState.scannerRows[idx];
    if (!row) return true;
    if (e.target.dataset.srowPrice != null) row.detected_pack_price = parseFloat(e.target.value) || 0;
    if (e.target.dataset.srowUnit != null) row.pack_unit = e.target.value;
    const norm = normalizePackPrice(row.detected_pack_price, row.pack_unit, MASTER_MAP[row.matched_master_item]);
    row.normalized_per_kg_price = norm ? norm.normalized_price : 0;
    const tr = e.target.closest('tr');
    if (tr) tr.querySelector('td:nth-child(4) b').textContent = row.normalized_per_kg_price || '—';
    return true;
  }
  return false;
}

export async function handleCompareChange(e, ctx, rerender) {
  if (e.target.dataset.storeChk != null) {
    const id = e.target.dataset.storeChk;
    const set = new Set(getSelectedStores(ctx.marketData));
    if (e.target.checked) set.add(id); else set.delete(id);
    setSelectedStores([...set]);
    rerender();
    return true;
  }
  if (e.target.id === 'scanUploadInput' || e.target.id === 'scanCameraInput') {
    if (e.target.files?.length) {
      const imgs = await readFilesAsDataUrls(e.target.files);
      await processScannedImages(imgs, rerender);
    }
    return true;
  }
  if (e.target.id === 'scanMerge') { cmpState.scannerMergeId = e.target.value; return true; }
  if (e.target.dataset.srowItem != null) {
    const idx = +e.target.dataset.srowItem;
    const row = cmpState.scannerRows[idx];
    if (row) {
      row.matched_master_item = e.target.value;
      const norm = normalizePackPrice(row.detected_pack_price, row.pack_unit, MASTER_MAP[row.matched_master_item]);
      row.normalized_per_kg_price = norm ? norm.normalized_price : row.normalized_per_kg_price;
      rerender();
    }
    return true;
  }
  return false;
}

function exportCsv(ctx) {
  const { activeCols, rows } = buildRows(ctx);
  const headers = ['Item', 'Unit', 'Commissioner Mandi', 'Commissioner Retail', ...activeCols.map((c) => c.name), 'Lowest', 'Highest', 'Margin PKR', 'Margin %'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const vals = [
      `"${r.it.en.replace(/"/g, '""')}"`,
      r.it.unit || 'kg',
      r.mandi ?? '',
      r.retail ?? '',
      ...r.cells.map(({ entry }) => entry?.price ?? ''),
      r.lowest?.price ?? '',
      r.highest?.price ?? '',
      r.marginPkr ?? '',
      r.marginPct != null ? r.marginPct.toFixed(1) : '',
    ];
    lines.push(vals.join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vegsearch-comparison-${cmpState.cat}-${ctx.data.date}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function exportLandscapePdf(ctx, toast) {
  const el = document.getElementById('cmpCapture');
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
  const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, Math.min(imgH, pageH - margin * 2));
  pdf.save(`vegsearch-comparison-${ctx.data.date}.pdf`);
  toast(`${ctx.t('saved')} ✓`);
}
