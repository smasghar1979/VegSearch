// Force Update module: triggers Commissioner Karachi + 12-store bots via GitHub Actions API
// (when a GitHub workflow token is saved in localStorage) and refreshes live data.

const REPO = 'smasghar1979/VegSearch';
const LS_GH_TOKEN = 'vegsearch_gh_token';
const LS_LAST_CHECKED = 'vegsearch_last_checked_pkt';

export const forceState = {
  open: false,
  running: false,
  statusText: '',
  lastCheckedPkt: localStorage.getItem(LS_LAST_CHECKED) || '',
};

export function nowPktLabel() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date()) + ' PKT';
}

export function markCheckedNow() {
  const label = nowPktLabel();
  forceState.lastCheckedPkt = label;
  try { localStorage.setItem(LS_LAST_CHECKED, label); } catch {}
  return label;
}

export function renderForceUpdateModal({ t, esc }) {
  if (!forceState.open) return '';
  const savedToken = localStorage.getItem(LS_GH_TOKEN) || '';
  return `
  <div class="modal-backdrop" data-fu-act="close">
    <div class="modal-card">
      <div class="modal-head">
        <b>⚡ ${t('forceTitle')}</b>
        <button type="button" class="icon-close" data-fu-act="close">✕</button>
      </div>
      <p class="small muted">${t('forceDesc')}</p>
      ${forceState.lastCheckedPkt ? `<div class="small" style="margin-bottom:8px">🕒 <b>${t('lastChecked')}:</b> ${esc(forceState.lastCheckedPkt)}</div>` : ''}
      <div class="ai-box" style="margin-bottom:10px">
        <div class="row-inline">
          <input id="ghTokenInput" type="password" placeholder="${t('ghTokenPlaceholder')}" value="${esc(savedToken)}">
          <button type="button" class="btn small-btn" data-fu-act="save-token">${t('saveKey')}</button>
        </div>
      </div>
      ${forceState.statusText ? `<div class="banner warn">${esc(forceState.statusText)}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px">
        <button type="button" class="btn scan-btn" data-fu-act="run-cloud" ${forceState.running ? 'disabled' : ''}>
          ${forceState.running ? '⏳ Running…' : t('runLiveScrape')}
        </button>
        <button type="button" class="btn link small-btn" data-fu-act="refresh-only" ${forceState.running ? 'disabled' : ''}>
          ⟳ ${t('refreshPublishedOnly')}
        </button>
      </div>
    </div>
  </div>`;
}

async function dispatchWorkflow(workflowFile, token) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflowFile}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.status);
    throw new Error(`GitHub dispatch (${workflowFile}) HTTP ${res.status}: ${String(msg).slice(0, 120)}`);
  }
}

async function pollUntilDone(startedIso, token, onStatus) {
  const maxWait = 180000; // 3 minutes
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=6`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    });
    if (!res.ok) continue;
    const json = await res.json();
    const recent = (json.workflow_runs || []).filter((r) => r.created_at >= startedIso);
    if (!recent.length) {
      onStatus('⏳ Waiting for GitHub Actions runners to start…');
      continue;
    }
    const active = recent.filter((r) => r.status !== 'completed');
    const summary = recent.map((r) => `${r.name}: ${r.status}${r.conclusion ? ` (${r.conclusion})` : ''}`).join(' | ');
    onStatus(`⏳ ${summary}`);
    if (recent.length >= 2 && active.length === 0) {
      return recent;
    }
  }
  return null;
}

export async function handleForceUpdateClick(e, { rerender, reloadAll, toast, t }) {
  const actEl = e.target.closest('[data-fu-act]');
  if (!actEl) return false;
  const act = actEl.dataset.fuAct;

  if (act === 'open') {
    forceState.open = true;
    forceState.statusText = '';
    rerender();
    return true;
  }
  if (act === 'close') {
    if (actEl.classList.contains('modal-backdrop') && e.target !== actEl) return false;
    forceState.open = false;
    rerender();
    return true;
  }
  if (act === 'save-token') {
    const val = document.getElementById('ghTokenInput')?.value.trim() || '';
    if (val) localStorage.setItem(LS_GH_TOKEN, val);
    else localStorage.removeItem(LS_GH_TOKEN);
    toast(t('saved'));
    rerender();
    return true;
  }
  if (act === 'refresh-only') {
    forceState.running = true;
    forceState.statusText = '⟳ Fetching latest published rates & bot logs…';
    rerender();
    markCheckedNow();
    await reloadAll();
    forceState.running = false;
    forceState.open = false;
    toast(`${t('saved')} ✓`);
    rerender();
    return true;
  }
  if (act === 'run-cloud') {
    const inputVal = document.getElementById('ghTokenInput')?.value.trim() || '';
    const token = inputVal || localStorage.getItem(LS_GH_TOKEN) || '';
    if (!token) {
      forceState.statusText = 'Please paste a GitHub Token (with workflow scope) above, or use "Refresh Published Data Only".';
      rerender();
      return true;
    }
    localStorage.setItem(LS_GH_TOKEN, token);
    forceState.running = true;
    forceState.statusText = '⚡ Triggering Commissioner Karachi & all 12 store bots…';
    rerender();
    try {
      const startedIso = new Date(Date.now() - 10000).toISOString();
      await Promise.all([
        dispatchWorkflow('daily-market-scrape.yml', token),
        dispatchWorkflow('daily-update.yml', token),
      ]);
      forceState.statusText = '⏳ Both scrapers triggered! Waiting for results…';
      rerender();
      await pollUntilDone(startedIso, token, (txt) => {
        forceState.statusText = txt;
        rerender();
      });
      markCheckedNow();
      await reloadAll();
      forceState.running = false;
      forceState.open = false;
      toast(`${t('saved')} ✓`);
      rerender();
    } catch (err) {
      forceState.running = false;
      forceState.statusText = `❌ ${err.message}`;
      rerender();
    }
    return true;
  }
  return false;
}
