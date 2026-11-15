/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens used throughout the app. Light enterprise surfaces with a deep navy chrome.
        base: {
          bg: '#F3F5F9',
          sidebar: '#0B1B33',
          panel: '#FFFFFF',
          border: '#E2E8F0',
          hover: '#F1F5FB',
          subtle: '#F8FAFC',
        },
        navy: {
          950: '#07142A',
          900: '#0B1B33',
          800: '#102A4C',
          700: '#16365F',
          600: '#1E4A7F',
          300: '#9DB2D3',
          200: '#C9D6EA',
        },
        accent: {
          blue: '#2563EB',
          amber: '#D97706',
          green: '#0D9488',
          red: '#DC2626',
        },
        ink: {
          primary: '#0F172A',
          muted: '#64748B',
          faint: '#94A3B8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
};
