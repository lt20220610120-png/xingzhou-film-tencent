import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'production-content-security-policy', apply: 'build',
    transformIndexHtml() {
      return [{tag:'meta',attrs:{'http-equiv':'Content-Security-Policy',content:"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: xzmedia:; media-src 'self' data: blob: https: xzmedia:; font-src 'self' data:; connect-src 'self' https: http://127.0.0.1:* http://localhost:* blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src xzapp://canvas"},injectTo:'head-prepend'}];
    },
  }],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
