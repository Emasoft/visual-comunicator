// PostCSS pipeline used by Vite during bundling. Tailwind compiles all
// utility classes referenced from `src/**/*.{ts,tsx}` plus our re-themed
// token defaults from `src/global.css`; autoprefixer adds vendor prefixes
// for the CSS animation rules tailwindcss-animate emits.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
