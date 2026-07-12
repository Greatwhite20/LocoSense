import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/LocoSense/',
  server: {
    port: 3000,
    // Proxy API calls to Flask during development
    // This means you can also use /api/fleet instead of http://localhost:5001/api/fleet
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      }
    }
  }
})
