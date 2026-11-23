// Minimal Gemini REST client (no SDK). Builds a ranked list of available Flash models
// and automatically rotates to the next model if one hits 429 (quota) or 503 (overloaded).

const API = 'https://generativelanguage.googleapis.com/v1beta';
let cachedModels = null;

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
  const defaults = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];
  try {
    const res = await fetch(`${API}/models?pageSize=200&key=${key()}`);
    const json = await res.json();
    const candidates = (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-[\d.]+-flash/.test(n))
      .filter((n) => !/(image|tts|live|audio|thinking|exp|8b)/i.test(n));

    // Prefer stable models, non-lite before lite, then newer versions
    candidates.sort((a, b) => {
      const pa = /preview/.test(a) ? 1 : 0;
      const pb = /preview/.test(b) ? 1 : 0;
      if (pa !== pb) return pa - pb;
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
  console.log('Gemini model fallback chain:', cachedModels.slice(0, 5).join(' -> '));
  return cachedModels;
}

export async function pickModel() {
  const list = await pickModels();
  return list[0];
}

/**
 * Generate JSON from Gemini, rotating across available models on 429/503/404.
 * parts: array of {text} or {inline_data:{mime_type,data(base64)}}
 */
export async function geminiJSON(parts, { schema, temperature = 0.1, retries = 4 } = {}) {
  const models = await pickModels();
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      ...(schema ? { responseSchema: schema } : {}),
    },
  };

  let lastErr;
  const maxAttempts = Math.max(retries, Math.min(models.length, 6));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const model = models[attempt % models.length];
    try {
      const res = await fetch(`${API}/models/${model}:generateContent?key=${key()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`Gemini ${res.status} (${model}): ${JSON.stringify(json.error || json).slice(0, 300)}`);
      const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      return JSON.parse(stripFences(text));
    } catch (e) {
      lastErr = e;
      console.warn(`Gemini attempt ${attempt + 1} (${model}) failed: ${e.message}`);
      await new Promise((r) => setTimeout(r, /429|503|404/.test(e.message) ? 1500 : 3000));
    }
  }
  throw lastErr;
}

function stripFences(t) {
  return t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}
