import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// server/index.mjs serves this build (npm start) and the API on one loopback origin.
export default defineConfig({
  plugins: [react()],
  // Scan only the app (19 Oct: the scan tripped on tools/logic-sim's template, skipped pre-bundling, and rebuilt react-dom
  // piecemeal with mismatched versions: a blank page).
  optimizeDeps: { entries: ['index.html'], include: ['react', 'react-dom', 'react-dom/client', 'katex', '@elevenlabs/client'] },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
