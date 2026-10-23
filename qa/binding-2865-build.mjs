import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'/',build:{outDir:'output/binding-ui-2865',rollupOptions:{input:{imported:'qa/imported-art-binding.html',linked:'qa/prompt-art-binding.html'}}}});
