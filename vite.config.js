import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';

// Serves ../data and ../public/data at /data during dev and bundles both into dist/data on build.
const serveData = {
  name: 'serve-data',
  configureServer(server) {
    server.middlewares.use('/data', (req, res, next) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
      for (const dir of ['data', 'public/data']) {
        const root = resolve(__dirname, dir);
        const file = resolve(root, rel);
        if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          fs.createReadStream(file).pipe(res);
          return;
        }
      }
      next();
    });
  },
  closeBundle() {
    const outData = resolve(__dirname, 'dist/data');
    const srcLatest = resolve(__dirname, 'data/latest.json');
    const srcSnaps = resolve(__dirname, 'data/snapshots');
    if (fs.existsSync(srcLatest)) {
      fs.mkdirSync(outData, { recursive: true });
      fs.copyFileSync(srcLatest, resolve(outData, 'latest.json'));
    }
    if (fs.existsSync(srcSnaps)) {
      fs.cpSync(srcSnaps, resolve(outData, 'snapshots'), { recursive: true });
    }
    const pubData = resolve(__dirname, 'public/data');
    if (fs.existsSync(pubData)) {
      fs.mkdirSync(outData, { recursive: true });
      fs.cpSync(pubData, outData, { recursive: true });
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
