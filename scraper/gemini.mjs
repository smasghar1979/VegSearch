// Minimal Gemini REST client (no SDK). Builds a ranked list of available Flash models,
// skips 404/429 models for the rest of the run, and retries transient 503/network errors.

const API = 'https://generativelanguage.googleapis.com/v1beta';
let cachedModels = null;
const skipModels = new Set(); // 404 or 429 models skipped for this run

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not set');
  return k;
}

export function hasGemini() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function versionScore(name) {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

export async function pickModels() {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
  if (cachedModels?.length) return cachedModels;
  const defaults = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.8-flash-lite',
    'gemini-3.7-flash-lite',
    'gemini-3.6-flash-lite',
    'gemini-3.5-flash-lite',
  ];
  try {
    const res = await fetch(`${API}/models?pageSize=200&key=${key()}`, { signal: AbortSignal.timeout(20000) });
    const json = await res.json();
    const candidates = (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-[\d.]+-(?:flash|pro)/.test(n))
      .filter((n) => !/(image|tts|live|audio|thinking|exp|8b)/i.test(n));

    // Prefer stable -> flash before flash-lite -> flash before pro -> newer version
    candidates.sort((a, b) => {
      const pa = /preview/.test(a) ? 1 : 0;
      const pb = /preview/.test(b) ? 1 : 0;
      if (pa !== pb) return pa - pb;
      const ra = /-pro/.test(a) ? 1 : 0;
      const rb = /-pro/.test(b) ? 1 : 0;
      if (ra !== rb) return ra - rb;
      const la = /lite/.test(a) ? 1 : 0;
      const lb = /lite/.test(b) ? 1 : 0;
      if (la !== lb) return la - lb;
      return versionScore(b) - versionScore(a) || a.length - b.length;
    });
    cachedModels = candidates.length ? [...new Set([...candidates, ...defaults])] : defaults;
  } catch (e) {
    console.warn('Model list failed, falling back:', e.message);
    cachedModels = defaults;
  }
  console.log('Gemini model chain:', cachedModels.join(' -> '));
  return cachedModels;
}

export async function pickModel() {
  const list = await pickModels();
  return list.find((m) => !skipModels.has(m)) || list[0];
}

/**
 * Generate JSON from Gemini, rotating across all available models.
 */
export async function geminiJSON(parts, { schema, temperature = 0.1 } = {}) {
  const models = (await pickModels()).filter((m) => !skipModels.has(m));
  if (!models.length) throw new Error('All Gemini models are exhausted (429/404) for this run.');

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      ...(schema ? { responseSchema: schema } : {}),
    },
  };

  let lastErr;
  for (const model of models) {
    // Allow 1 quick retry for transient 503/network errors on the same model
    for (let t = 0; t < 2; t++) {
      try {
        const res = await fetch(`${API}/models/${model}:generateContent?key=${key()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });
        const json = await res.json();
        if (!res.ok) {
          const msg = `Gemini ${res.status} (${model}): ${JSON.stringify(json.error || json).slice(0, 260)}`;
          if (res.status === 404 || res.status === 429) {
            skipModels.add(model);
            throw Object.assign(new Error(msg), { permanent: true });
          }
          throw new Error(msg);
        }
        const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        return JSON.parse(stripFences(text));
      } catch (e) {
        lastErr = e;
        console.warn(`Gemini (${model}, try ${t + 1}) failed: ${e.message}`);
        if (e.permanent) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  throw lastErr;
}

function stripFences(t) {
  return t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}
