/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          bg: '#0F1419',
          panel: '#1A2129',
          border: '#262E38',
        },
        accent: {
          blue: '#3B82F6',
          amber: '#F59E0B',
          green: '#10B981',
          red: '#EF4444',
        },
        ink: {
          primary: '#E8EAED',
          muted: '#8B96A5',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
