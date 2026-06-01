import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — flat keys so Tailwind generates each utility directly
        // (nested DEFAULT keys are flaky to refresh in dev). Primary = deep
        // forest green; secondary = warm amber.
        'brand-green': '#15683F',
        'brand-green-hover': '#0f5230',
        'brand-green-light': '#e8f1ec',
        'brand-yellow': '#FFCD01',
        'brand-yellow-hover': '#e6b900',
        'brand-yellow-light': '#fff8d6',
      },
    },
  },
  plugins: [],
} satisfies Config;
