// New "Bots" (Bot Performance & Workflow Monitor) tab.

export const botsState = {
  dayMode: 'today', // 'today' | 'yesterday' | 'history'
  selectedHistoryDate: null,
  filter: 'all', // 'all' | 'working' | 'attention'
  expanded: new Set(),
};

const GH_ACTIONS_URL = 'https://github.com/smasghar1979/VegSearch/actions';

export async function loadBotLogs(dataBase) {
  const file = 'data/bot_logs.json';
  const cacheKey = 'data:bot_logs';
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

function fmtDur(ms) {
  if (!ms) return '0.0s';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function renderBotsTab({ botLogs, lang, t, esc }) {
  if (!botLogs || !botLogs.dates?.length) {
    return `
    <div class="bots-head">
      <h2>🤖 ${t('botsTitle')}</h2>
      <a class="btn link small-btn" href="${GH_ACTIONS_URL}" target="_blank" rel="noopener">↗ ${t('viewGhActions')}</a>
    </div>
    <div class="card center"><p class="muted">${t('noBotLogs')}</p></div>`;
  }

  const dates = botLogs.dates; // newest first
  const todayDate = dates[0];
  const yesterdayDate = dates[1] || null;
  const activeDate =
    botsState.dayMode === 'yesterday' && yesterdayDate
      ? yesterdayDate
      : botsState.dayMode === 'history' && botsState.selectedHistoryDate && botLogs.days[botsState.selectedHistoryDate]
        ? botsState.selectedHistoryDate
        : todayDate;

  const run = botLogs.days[activeDate];
  const prevRun = yesterdayDate && activeDate === todayDate ? botLogs.days[yesterdayDate] : null;
  const prevBotsMap = Object.fromEntries((prevRun?.bots || []).map((b) => [b.store_id, b]));
  const sum = run.summary || {};

  let bots = run.bots || [];
  if (botsState.filter === 'working') bots = bots.filter((b) => b.status === 'success');
  if (botsState.filter === 'attention') bots = bots.filter((b) => b.status !== 'success');

  const dayBtn = (mode, label, disabled = false) =>
    `<button data-bot-day="${mode}" class="${botsState.dayMode === mode ? 'on' : ''}" ${disabled ? 'disabled' : ''}>${label}</button>`;

  const filterChip = (k, label) =>
    `<button class="chip ${botsState.filter === k ? 'on' : ''}" data-bot-filter="${k}">${label}</button>`;

  return `
  <div class="bots-head">
    <div>
      <h2>🤖 ${t('botsTitle')}</h2>
      <small class="muted">${t('lastRun')}: ${esc(run.run_at_pkt || run.date)}</small>
    </div>
    <a class="btn link small-btn" href="${GH_ACTIONS_URL}" target="_blank" rel="noopener">↗ ${t('viewGhActions')}</a>
  </div>

  <div class="seg">
    ${dayBtn('today', t('botsToday'))}
    ${dayBtn('yesterday', t('botsYesterday'), !yesterdayDate)}
    ${dayBtn('history', t('botsHistory7'))}
  </div>

  ${botsState.dayMode === 'history' ? `
    <div class="chips" style="margin-bottom:8px">
      ${dates.map((d) => `<button class="chip ${d === activeDate ? 'on' : ''}" data-bot-hdate="${d}">${d}</button>`).join('')}
    </div>` : ''}

  <div class="stats">
    <div class="stat down"><b>${sum.working ?? 0}</b><span>✅ ${t('botsWorking')}</span></div>
    <div class="stat warn-box"><b>${sum.partial ?? 0}</b><span>⚠️ ${t('botsPartial')}</span></div>
    <div class="stat up"><b>${sum.failed ?? 0}</b><span>❌ ${t('botsFailed')}</span></div>
  </div>

  <div class="card summary-strip">
    <span><b>${sum.working ?? 0}</b>/${sum.total_bots ?? 12} ${t('botsWorking')}</span> ·
    <span><b>${sum.total_items ?? 0}</b> ${t('itemsChecked')}</span> ·
    <span><b>${sum.total_price_changes ?? 0}</b> ${t('priceChanges')}</span> ·
    <span>${t('runTime')}: <b>${fmtDur(run.total_duration_ms)}</b></span>
  </div>

  <div class="chips" style="margin-bottom:8px">
    ${filterChip('all', t('botsAll'))}
    ${filterChip('working', `✅ ${t('botsWorking')}`)}
    ${filterChip('attention', `⚠️ ${t('botsNeedsAttn')}`)}
  </div>

  <div class="bot-list">
    ${bots.map((b) => renderBotCard(b, prevBotsMap[b.store_id], lang, t, esc)).join('') || `<p class="muted center">—</p>`}
  </div>`;
}

function renderBotCard(b, prevBot, lang, t, esc) {
  const isExp = botsState.expanded.has(b.store_id);
  const badgeCls = b.status === 'success' ? 'down' : b.status === 'partial' ? 'warn' : 'up';
  const statusMap = lang === 'ur'
    ? { success: 'کامیاب', partial: 'جزوی', blocked: 'بلاک', failed: 'ناکام' }
    : { success: 'Success', partial: 'Partial', blocked: 'Blocked', failed: 'Failed' };
  const statusLabel = statusMap[b.status] || b.status;
  const yItems = prevBot?.items_checked ?? b.yesterday_items;
  let vsYest = '';
  if (yItems != null) {
    const diff = (b.items_checked || 0) - yItems;
    vsYest = diff > 0 ? ` (↑${diff} vs yesterday)` : diff < 0 ? ` (↓${Math.abs(diff)} vs yesterday)` : ' (= vs yesterday)';
  }
  const pct = Math.round(((b.steps_passed || 0) / (b.total_steps || 6)) * 100);

  return `
  <div class="card bot-card">
    <div class="bot-top" data-bot-toggle="${esc(b.store_id)}">
      <div class="bot-title">
        <b>${esc(lang === 'ur' ? b.store_name_ur || b.store_name : b.store_name)}</b>
        <span class="chg ${badgeCls}">${statusLabel}</span>
      </div>
      <div class="bot-metrics">
        <span>📦 <b>${b.items_checked || 0}</b> ${t('itemsChecked')}${esc(vsYest)}</span>
        <span>🔄 <b>${b.price_changes || 0}</b> ${t('priceChanges')}</span>
        <span>⏱️ <b>${fmtDur(b.duration_ms)}</b></span>
      </div>
      <div class="step-bar-row">
        <div class="step-bar"><div class="step-fill ${badgeCls}" style="width:${pct}%"></div></div>
        <small class="muted">${b.steps_passed || 0}/${b.total_steps || 6} ${t('stepsLabel')} ${isExp ? '▲' : '▼'}</small>
      </div>
    </div>

    ${isExp ? `
      <div class="bot-flow">
        <div class="what-checks">
          <small><b>${t('whatBotChecks')}:</b></small>
          <div class="tags">
            <span class="tag" dir="ltr">${esc(b.url)}</span>
            ${(b.categories_targeted || []).map((c) => `<span class="tag">${esc(c)}</span>`).join('')}
          </div>
        </div>

        <div class="flow-steps">
          ${(b.steps || []).map((s) => {
            const ic = s.status === 'passed' ? '✅' : s.status === 'warning' ? '⚠️' : s.status === 'failed' ? '❌' : '⏭️';
            return `
            <div class="flow-step st-${s.status}">
              <div class="flow-ic">${ic}</div>
              <div class="flow-body">
                <div class="flow-head"><b>${s.step_number}. ${esc(s.title)}</b><small class="muted">${fmtDur(s.duration_ms)}</small></div>
                <p>${esc(s.detail)}</p>
              </div>
            </div>`;
          }).join('')}
        </div>

        ${b.failed_step ? `
          <div class="error-callout">
            <b>❌ Step ${b.failed_step.step_number} (${esc(b.failed_step.title)})</b>
            <p>${esc(b.failed_step.error_reason)}</p>
            <button type="button" class="btn small-btn pdf" data-bot-debug="${esc(b.store_id)}">📋 ${t('copyDebug')}</button>
          </div>` : ''}
      </div>` : ''}
  </div>`;
}

export function handleBotsClick(e, botLogs, rerender, toast, t) {
  const dayBtn = e.target.closest('[data-bot-day]');
  if (dayBtn) { botsState.dayMode = dayBtn.dataset.botDay; rerender(); return true; }

  const hBtn = e.target.closest('[data-bot-hdate]');
  if (hBtn) { botsState.selectedHistoryDate = hBtn.dataset.botHdate; rerender(); return true; }

  const fBtn = e.target.closest('[data-bot-filter]');
  if (fBtn) { botsState.filter = fBtn.dataset.botFilter; rerender(); return true; }

  const tog = e.target.closest('[data-bot-toggle]');
  if (tog) {
    const id = tog.dataset.botToggle;
    if (botsState.expanded.has(id)) botsState.expanded.delete(id);
    else botsState.expanded.add(id);
    rerender();
    return true;
  }

  const dbg = e.target.closest('[data-bot-debug]');
  if (dbg) {
    const id = dbg.dataset.botDebug;
    const activeDate = botsState.dayMode === 'yesterday' && botLogs?.dates?.[1]
      ? botLogs.dates[1]
      : botsState.dayMode === 'history' && botsState.selectedHistoryDate
        ? botsState.selectedHistoryDate
        : botLogs?.latest_date;
    const bot = botLogs?.days?.[activeDate]?.bots?.find((b) => b.store_id === id);
    if (bot) {
      const summary = [
        `VegSearch Bot Debug Summary`,
        `Store: ${bot.store_name} (${bot.store_id})`,
        `Date: ${activeDate}`,
        `URL: ${bot.url}`,
        `Status: ${bot.status}`,
        `Failed Step: Step ${bot.failed_step?.step_number} - ${bot.failed_step?.title}`,
        `Error: ${bot.failed_step?.error_reason}`,
      ].join('\n');
      navigator.clipboard?.writeText(summary).then(() => toast(t('copiedDebug'))).catch(() => toast(t('copiedDebug')));
    }
    return true;
  }

  return false;
}
