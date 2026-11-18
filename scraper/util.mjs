// Shared helpers for the scraper.

export const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

export async function fetchText(url, opts = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) }, redirect: 'follow', signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function fetchBinary(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let mime = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!mime || mime === 'application/octet-stream') mime = guessMime(url);
  return { buf, mime };
}

export function guessMime(url) {
  const u = url.toLowerCase().split('?')[0];
  if (u.endsWith('.pdf')) return 'application/pdf';
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

/** Today's date in Pakistan (Asia/Karachi) as YYYY-MM-DD */
export function pkToday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(d);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

/** Try to find a date inside free text / file names. Returns YYYY-MM-DD or null. */
export function findDate(text) {
  if (!text) return null;
  const t = decodeURIComponent(String(text)).toLowerCase();
  let m;
  // 2026-11-17 / 2026_11_17
  if ((m = t.match(/(20\d\d)[-_./](\d{1,2})[-_./](\d{1,2})/))) return fmt(+m[1], +m[2], +m[3]);
  // 17-11-2026 / 17.11.2026 / 17/11/2026
  if ((m = t.match(/(\d{1,2})[-_./](\d{1,2})[-_./](20\d\d)/))) return fmt(+m[3], +m[2], +m[1]);
  // 17 November 2026 / 17th Nov, 2026 / 17-Nov-2026
  if ((m = t.match(/(\d{1,2})(?:st|nd|rd|th)?[\s\-_.,]*([a-z]{3,9})[\s\-_.,]*(20\d\d)/)) && MONTHS[m[2]])
    return fmt(+m[3], MONTHS[m[2]], +m[1]);
  // November 17, 2026
  if ((m = t.match(/([a-z]{3,9})[\s\-_.]*(\d{1,2})(?:st|nd|rd|th)?[\s,\-_.]*(20\d\d)/)) && MONTHS[m[1]])
    return fmt(+m[3], MONTHS[m[1]], +m[2]);
  // 17-11-26
  if ((m = t.match(/\b(\d{1,2})[-_.](\d{1,2})[-_.](\d\d)\b/))) return fmt(2000 + +m[3], +m[2], +m[1]);
  return null;
}

function fmt(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function absUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
