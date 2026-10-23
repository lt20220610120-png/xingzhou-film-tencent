import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'/',build:{outDir:'output/ui-2868',rollupOptions:{input:'qa/release-2868.html'}}});
