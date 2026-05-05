import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Builds a single UMD bundle that ve-runtime.js can lazy-load on pages
// containing `.ve-regex[data-regex]`. Output name is `VeRegex` so the
// runtime can call `window.VeRegex.render(el, options)` without
// touching React/ReactDOM globals on the host page.
//
// React + ReactDOM are bundled in (NOT externalized) because the host
// page is a single-file HTML document with no module system; we can't
// rely on a CDN React being present.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, './src/ve-regex-entry.tsx'),
      name: 'VeRegex',
      formats: ['umd'],
      fileName: () => 've-regex.umd.js',
    },
    rollupOptions: {
      output: {
        // Single CSS file beside the JS so ve-runtime can load both.
        assetFileNames: (info) =>
          info.name?.endsWith('.css') ? 've-regex.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
})
