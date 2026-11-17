# کراچی سبزی منڈی ریٹس — Karachi Sabzi Mandi Rates

Daily official Karachi vegetable and fruit price tracker (Commissioner Karachi Division), with Urdu/English UI, 7/15/30-day charts, supply/shortage news alerts, PDF/WhatsApp image sharing, and an Android app via Capacitor.

## Quick Start (Local)

```bash
npm install
npm run demo-data   # generate 15 days of sample rates + alerts in data/
npm run dev         # open http://localhost:5173
```

## Scraper Commands

- **Daily scrape + news + build `data/latest.json`**:
  ```bash
  GEMINI_API_KEY=your_key npm run scrape
  ```
- **Import a local price-list image manually**:
  ```bash
  GEMINI_API_KEY=your_key node scraper/index.mjs --file list.jpg --date 2026-11-17 --kind vegetables
  ```
- **Rebuild `data/latest.json` from stored `data/days/*.json`**:
  ```bash
  node scraper/index.mjs --rebuild
  ```

## GitHub Actions Deployment

1. Push this repository to GitHub (default branch `main`).
2. Add **`GEMINI_API_KEY`** under **Settings → Secrets and variables → Actions**.
3. Enable **GitHub Pages** under **Settings → Pages → Source: GitHub Actions**.
4. Run **Daily Rates & GitHub Pages** (`.github/workflows/daily-update.yml`) manually once or wait for the daily schedule (`09:00 PKT` & `12:00 PKT`).

## Android APK

- **Cloud build (recommended)**: Run the **Build Android APK** workflow (`.github/workflows/android-apk.yml`) from GitHub Actions and download `karachi-sabzi-rates-debug-apk`.
- **Local build** (requires Java 21 + Android SDK):
  ```bash
  VITE_DATA_BASE="https://<user>.github.io/<repo>/" npm run build
  npm run cap:sync
  cd android && ./gradlew assembleDebug
  ```
