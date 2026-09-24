import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 20 10 / 0.08), 0 1px 8px -2px rgb(0 20 10 / 0.12)',
      },
      colors: {
        // Semantic tokens backed by CSS variables in src/style.css — each var
        // holds a different value under :root (light) vs .dark, so these
        // classes need no dark: pairing; the variable itself flips.
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          secondary: 'rgb(var(--color-accent-secondary) / <alpha-value>)',
          on: 'rgb(var(--color-accent-on) / <alpha-value>)',
        },
        link: 'rgb(var(--color-link) / <alpha-value>)',
      },
    },
  },
  plugins: [],
} satisfies Config
