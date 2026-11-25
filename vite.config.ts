import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Entwicklung: Vite (Port 5173) liefert die Oberfläche, /api geht an den Hono-Server (Port 3001).
// Produktion: `npm run build` erzeugt dist/, der Hono-Server liefert alles auf einem Port aus.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // auch im WLAN erreichbar (Handy-Test)
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: { outDir: 'dist' },
});
