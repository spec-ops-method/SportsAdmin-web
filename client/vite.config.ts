import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@sportsadmin/shared': path.resolve(__dirname, '../shared/types/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://api:3000',
      '/carnivals': 'http://api:3000',
      '/health': 'http://api:3000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    alias: {
      '@sportsadmin/shared': path.resolve(__dirname, '../shared/types/index.ts'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
