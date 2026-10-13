import { defineConfig } from 'vite';

// GitHub Pages は https://yunasayunasa.github.io/Six_dragon_gyakuten/ で配信する
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/Six_dragon_gyakuten/' : '/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
