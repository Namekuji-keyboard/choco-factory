/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages のサブパス (/<repo>/) でも動くよう相対パスでビルドする
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'node',
    // ts-client は拡張子なしの import を使うため Vite 経由で変換する
    server: { deps: { inline: ['@zmkfirmware/zmk-studio-ts-client'] } },
  },
});
