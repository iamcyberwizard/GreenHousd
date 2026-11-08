import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// The Cloudflare plugin runs worker/index.ts (API + D1) inside the dev server, same as production.
export default defineConfig({
  plugins: [react(), cloudflare()],
  server: { host: true },
})
