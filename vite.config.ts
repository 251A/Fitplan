/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths too.
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    proxy: {
      '^/symmetry-(api|proxy)': {
        target: 'https://dev-api-398208568169.europe-southwest1.run.app/api',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/symmetry-(api|proxy)/, ''),
      },
      '^/symmetry/(users|training-sessions|sync)': {
        target: 'https://dev-api-398208568169.europe-southwest1.run.app/api',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/symmetry/, ''),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
