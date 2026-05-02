import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        warm: '#F7F5F0',
        brand: { DEFAULT: '#4A7C59', light: '#EBF3EE' },
      },
    },
  },
  plugins: [],
};

export default config;
