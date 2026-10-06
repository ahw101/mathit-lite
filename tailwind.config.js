/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
  darkMode: ['selector', '.dark'],
  content: ['./*.html', './js/*.js'],
  safelist: ['is-correct', 'is-incorrect', 'is-revealed'],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        raise: token('raise'),
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        strong: token('strong'),
        body: token('body'),
        soft: token('soft'),
        faint: token('faint'),
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          fg: token('accent-fg'),
          soft: token('accent-soft'),
          'soft-fg': token('accent-soft-fg'),
        },
        warn: { soft: token('warn-soft'), 'soft-fg': token('warn-soft-fg') },
        bad: { DEFAULT: token('bad'), soft: token('bad-soft'), 'soft-fg': token('bad-soft-fg') },
        invert: { DEFAULT: token('invert-bg'), fg: token('invert-fg'), soft: token('invert-soft') },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      maxWidth: { page: '64rem' },
    },
  },
  plugins: [],
};
