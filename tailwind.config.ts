import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1D4ED8',
          hover: '#1E40AF',
          light: '#EFF6FF',
          accent: '#2563EB',
        },
      },
    },
  },
  plugins: [],
};

export default config;
