import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

// GitHub Pages はリポジトリ名の下（/six_dragon_rythm/）で配信する
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/six_dragon_rythm/' : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: page('index.html'), rhythm: page('rhythm.html') } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
