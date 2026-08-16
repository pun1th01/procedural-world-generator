import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileIoPlugin } from './vite-file-io.js';

export default defineConfig({
  plugins: [react(), fileIoPlugin()],
});

