import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The sync server (server/server.ts) runs on 4124. In dev, Vite proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4123,
    proxy: { '/api': 'http://localhost:4124' },
  },
});
