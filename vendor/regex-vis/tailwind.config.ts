// Tailwind config for the vendored regex-vis bundle.
//
// The upstream tailwind.config.ts maps utility classes to a shadcn/ui-style
// HSL-token palette (`--background`, `--foreground`, `--primary`, `--accent`,
// etc.). We keep that exact token API so we don't have to touch a single
// upstream JSX file — but in `src/global.css` we *redefine* the tokens to
// hand out our own plugin palette (cream/gold editorial in light, deep navy
// + gold in dark).
//
// The upstream's three direct-colour tokens (`--graph`, `--graph-group`,
// `--graph-bg`) become the regex graph's stroke / group-stroke / background
// — those are the visible bones of the SVG, so they get the strongest map
// to our --text / --text-dim / --bg.
//
// `darkMode: 'media'` so the bundle follows `prefers-color-scheme` like the
// rest of the visual-explainer plugin, instead of the upstream's class-driven
// `darkMode: ['class']`.
import type { Config } from 'tailwindcss'
import tailwindcssAnimatePlugin from 'tailwindcss-animate'

export default {
  darkMode: 'media',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'border':     'hsl(var(--border))',
        'input':      'hsl(var(--input))',
        'ring':       'hsl(var(--ring))',
        'background': 'hsl(var(--background))',
        'foreground': 'hsl(var(--foreground))',
        'primary':    { DEFAULT: 'hsl(var(--primary))',     foreground: 'hsl(var(--primary-foreground))' },
        'secondary':  { DEFAULT: 'hsl(var(--secondary))',   foreground: 'hsl(var(--secondary-foreground))' },
        'destructive':{ DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        'muted':      { DEFAULT: 'hsl(var(--muted))',       foreground: 'hsl(var(--muted-foreground))' },
        'accent':     { DEFAULT: 'hsl(var(--accent))',      foreground: 'hsl(var(--accent-foreground))' },
        'popover':    { DEFAULT: 'hsl(var(--popover))',     foreground: 'hsl(var(--popover-foreground))' },
        'card':       { DEFAULT: 'hsl(var(--card))',        foreground: 'hsl(var(--card-foreground))' },
        'graph':      'var(--graph)',
        'graph-group':'var(--graph-group)',
        'graph-bg':   'var(--graph-bg)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        // Body text inside the editor panel uses our editorial serif so it
        // matches the surrounding visual-explainer page; regex tokens inside
        // the graph stay monospace.
        sans: ['"Crimson Pro"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up':   { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up   0.2s ease-out',
      },
      transitionProperty: { width: 'width' },
    },
  },
  plugins: [tailwindcssAnimatePlugin],
} satisfies Config
