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
  define: {
    // React (and many React-ecosystem libs) gates dev-only checks on
    // `process.env.NODE_ENV`. Vite normally replaces this only in
    // application builds, not library builds — so a UMD lib bundle
    // ships unreplaced `process.env.NODE_ENV` references and the page
    // throws `process is not defined` the moment React boots. Force
    // the production substitution so the bundle is fully self-contained.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: [
      // Upstream lays modules under `src/modules/{graph,editor,playground}/`;
      // we flattened the vendored copy to `src/{graph,editor,playground}/`.
      // The sub-imports in upstream source still reference the full path,
      // so a prefix alias keeps the upstream files unmodified.
      // Order matters: more specific aliases first.
      { find: '@/modules/graph', replacement: path.resolve(__dirname, './src/graph') },
      { find: '@/modules/editor', replacement: path.resolve(__dirname, './src/editor') },
      { find: '@/modules/playground', replacement: path.resolve(__dirname, './src/playground') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
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
