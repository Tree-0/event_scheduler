import { defineConfig } from 'vite';
export default defineConfig({ build: { emptyOutDir: false, target: 'es2022', lib: { entry: 'src/content.ts', name: 'WindowScheduler', formats: ['iife'], fileName: () => 'content.js' } } });
