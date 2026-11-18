// Minimal Gemini REST client (no SDK). Picks the newest available "flash" model automatically
// unless GEMINI_MODEL is set.

const API = 'https://generativelanguage.googleapis.com/v1beta';
let cachedModel = null;

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not set');
  return k;
}

export function hasGemini() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function versionScore(name) {
  // "models/gemini-3.6-flash" -> 3.6
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

export async function pickModel() {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (cachedModel) return cachedModel;
  try {
    const res = await fetch(`${API}/models?pageSize=200&key=${key()}`);
    const json = await res.json();
    const candidates = (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-[\d.]+-flash/.test(n))
      .filter((n) => !/(lite|image|tts|live|audio|thinking|exp|8b)/i.test(n));
    // Prefer stable (no "preview") and highest version.
    candidates.sort((a, b) => {
      const pa = /preview/.test(a) ? 1 : 0;
      const pb = /preview/.test(b) ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return versionScore(b) - versionScore(a) || a.length - b.length;
    });
    cachedModel = candidates[0] || 'gemini-2.5-flash';
  } catch (e) {
    console.warn('Model list failed, falling back:', e.message);
    cachedModel = 'gemini-2.5-flash';
  }
  console.log('Using Gemini model:', cachedModel);
  return cachedModel;
}

/**
 * Generate JSON from Gemini.
 * parts: array of {text} or {inline_data:{mime_type,data(base64)}}
 */
export async function geminiJSON(parts, { schema, temperature = 0.1, retries = 3 } = {}) {
  const model = await pickModel();
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      ...(schema ? { responseSchema: schema } : {}),
    },
  };
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API}/models/${model}:generateContent?key=${key()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json.error || json).slice(0, 400)}`);
      const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      return JSON.parse(stripFences(text));
    } catch (e) {
      lastErr = e;
      console.warn(`Gemini attempt ${attempt} failed: ${e.message}`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }
  throw lastErr;
}

function stripFences(t) {
  return t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}
