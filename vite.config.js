import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // relative asset paths so the desktop app can load dist/ from disk
  plugins: [react()],
  test: { environment: 'node' },
});
