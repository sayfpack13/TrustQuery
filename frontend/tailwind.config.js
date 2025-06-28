/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      placeholderColor: {
        muted: 'var(--color-muted)',
      },
      colors: {
        // Semantic color mapping via CSS variables
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        background: 'var(--color-background)',
        text: 'var(--color-text)',
        'button-bg': 'var(--color-button-bg)',
        'button-hover-bg': 'var(--color-button-hover-bg)',
        'link-text': 'var(--color-link-text)',
        'link-hover-text': 'var(--color-link-hover-text)',
        'header-bg-from': 'var(--color-header-bg-from)',
        'header-bg-to': 'var(--color-header-bg-to)',
        'header-text': 'var(--color-header-text)',
        'shadow': 'var(--color-shadow)',
        'border': 'var(--color-border)',
        'muted': 'var(--color-muted)',

        // Specific Tailwind shades that may be used in your project
        'red-600': 'var(--color-red-600)',
        'red-700': 'var(--color-red-700)',
        'green-600': 'var(--color-green-600)',
        'green-700': 'var(--color-green-700)',
        'gray-300': 'var(--color-gray-300)',
        'gray-400': 'var(--color-gray-400)',
        'gray-500': 'var(--color-gray-500)',
        'gray-800': 'var(--color-gray-800)',
        'gray-200': 'var(--color-gray-200)',
        'white': 'var(--color-white)',
        'blue-300': 'var(--color-blue-300)',

        // Optional extended danger/success/warning
        danger: 'var(--color-danger)',
        'danger-bg': 'var(--color-danger-bg)',
        'danger-border': 'var(--color-danger-border)',
        success: 'var(--color-success)',
        'success-bg': 'var(--color-success-bg)',
        'success-border': 'var(--color-success-border)',
        warning: 'var(--color-warning)',
      },
      keyframes: {
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
        },

        alertBackground: {
          '0%': { backgroundColor: 'rgba(255, 97, 106, 0.1)' }, // Subtle red tint on dark background
          '100%': { backgroundColor: 'rgba(255, 97, 106, 0.3)', boxShadow: '0 0 15px rgba(255, 97, 106, 0.6)' }, // Stronger red glow
        },
        alertPulse: {
          '0%': { boxShadow: '0 0 0 0 rgba(255, 97, 106, 0.7)', backgroundColor: 'rgba(255, 97, 106, 0.1)' },
          '50%': { boxShadow: '0 0 15px 8px rgba(255, 97, 106, 0.4)', backgroundColor: 'rgba(255, 97, 106, 0.2)' },
          '100%': { boxShadow: '0 0 0 0 rgba(255, 97, 106, 0.0)', backgroundColor: 'rgba(255, 97, 106, 0.1)' },
        },

      },
      animation: {
        'pop-in': 'pop-in 0.6s ease-out forwards',
        'fade-in': 'fade-in 0.5s ease-out forwards',
        'fade-in-slide-up': 'fade-in-slide-up 0.6s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'shake': 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both',
        'alert-background': 'alertBackground 1.2s ease-in-out 8 alternate',
        'alert-pulse': 'alertPulse 1.5s ease-in-out 2',
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Arial', 'sans-serif'],
      },
      transitionProperty: {
        'width': 'width',
        'height': 'height',
        'spacing': 'margin, padding',
      },
    },
  },
  plugins: [],
}