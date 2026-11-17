import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';

// Serves ../data at /data during local development and bundles latest.json + snapshots into dist/data on build.
const serveData = {
  name: 'serve-data',
  configureServer(server) {
    server.middlewares.use('/data', (req, res, next) => {
      const file = resolve(__dirname, 'data', decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
      if (file.startsWith(resolve(__dirname, 'data')) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        fs.createReadStream(file).pipe(res);
      } else next();
    });
  },
  closeBundle() {
    const srcLatest = resolve(__dirname, 'data/latest.json');
    const srcSnaps = resolve(__dirname, 'data/snapshots');
    const outData = resolve(__dirname, 'dist/data');
    if (fs.existsSync(srcLatest)) {
      fs.mkdirSync(outData, { recursive: true });
      fs.copyFileSync(srcLatest, resolve(outData, 'latest.json'));
    }
    if (fs.existsSync(srcSnaps)) {
      fs.cpSync(srcSnaps, resolve(outData, 'snapshots'), { recursive: true });
    }
  },
};

export default defineConfig({
  root: 'app',
  base: './',
  publicDir: resolve(__dirname, 'app/public'),
  plugins: [serveData],
  build: { outDir: resolve(__dirname, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
