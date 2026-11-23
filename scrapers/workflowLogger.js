// Lightweight 6-step workflow logger for Karachi grocery scraper bots.
// Outputs plain-English execution traces stored in public/data/bot_logs.json (rolling 7 days).

export const STANDARD_STEPS = [
  'Open Website',
  'Select Location / Options',
  'Navigate Categories',
  'Extract & Standardize Rates',
  'Compare Against Previous Run',
  'Save Results',
];

export function createWorkflowLogger({ storeId, storeName, storeNameUr, id, name, nameUr, url, categories = [] }) {
  const sId = storeId || id;
  const sName = storeName || name;
  const sNameUr = storeNameUr || nameUr || sName;
  const startedAt = Date.now();
  const steps = STANDARD_STEPS.map((title, i) => ({
    step_number: i + 1,
    title,
    detail: 'Not started',
    status: 'skipped',
    duration_ms: 0,
    error_reason: null,
  }));

  let activeIndex = -1;
  let stepStartedAt = 0;

  function startStep(stepNumber, customTitle) {
    activeIndex = stepNumber - 1;
    stepStartedAt = Date.now();
    if (steps[activeIndex] && customTitle) {
      steps[activeIndex].title = customTitle;
    }
  }

  function finishStep(status, detail, errorReason = null) {
    if (activeIndex < 0 || !steps[activeIndex]) return;
    steps[activeIndex].status = status;
    steps[activeIndex].detail = detail;
    steps[activeIndex].duration_ms = Math.max(1, Date.now() - stepStartedAt);
    steps[activeIndex].error_reason = errorReason || null;
  }

  return {
    startStep,
    pass: (detail) => finishStep('passed', detail, null),
    warn: (detail, errorReason = null) => finishStep('warning', detail, errorReason),
    fail: (detail, errorReason) => finishStep('failed', detail, errorReason || detail),
    skip: (detail) => finishStep('skipped', detail, null),
    finalize({
      status = 'success',
      itemsChecked = 0,
      yesterdayItems = null,
      priceChanges = 0,
      usedCache = false,
      lastCheckedDate = null,
      priceLastChangedDate = null,
    } = {}) {
      const failedStep = steps.find((s) => s.status === 'failed') || steps.find((s) => s.status === 'warning') || null;
      return {
        store_id: sId,
        store_name: sName,
        store_name_ur: sNameUr,
        url,
        categories_targeted: categories,
        status, // 'success' | 'partial' | 'blocked' | 'failed'
        items_checked: itemsChecked,
        yesterday_items: yesterdayItems,
        price_changes: priceChanges,
        duration_ms: Math.max(1, Date.now() - startedAt),
        used_cache: usedCache,
        last_checked_date: lastCheckedDate,
        price_last_changed_date: priceLastChangedDate,
        steps_passed: steps.filter((s) => s.status === 'passed').length,
        total_steps: steps.length,
        failed_step: failedStep ? { step_number: failedStep.step_number, title: failedStep.title, error_reason: failedStep.error_reason || failedStep.detail } : null,
        steps,
      };
    },
  };
}

/**
 * Merge today's bot run into rolling 7-day bot_logs.json structure.
 */
export function updateBotLogs(existingLogs, { datePkt, runAtIso, runAtPktLabel, totalDurationMs, bots }) {
  const prevDays = existingLogs?.days && typeof existingLogs.days === 'object' ? { ...existingLogs.days } : {};
  const working = bots.filter((b) => b.status === 'success').length;
  const partial = bots.filter((b) => b.status === 'partial').length;
  const failed = bots.filter((b) => b.status === 'blocked' || b.status === 'failed').length;
  const totalItems = bots.reduce((acc, b) => acc + (b.items_checked || 0), 0);
  const totalChanges = bots.reduce((acc, b) => acc + (b.price_changes || 0), 0);

  prevDays[datePkt] = {
    date: datePkt,
    run_at: runAtIso,
    run_at_pkt: runAtPktLabel,
    total_duration_ms: totalDurationMs,
    summary: {
      total_bots: bots.length,
      working,
      partial,
      failed,
      total_items: totalItems,
      total_price_changes: totalChanges,
    },
    bots,
  };

  // Keep rolling 7 days
  const keptDates = Object.keys(prevDays).sort().slice(-7);
  const days = {};
  for (const d of keptDates) days[d] = prevDays[d];

  return {
    latest_date: datePkt,
    dates: keptDates.slice().reverse(),
    days,
  };
}
