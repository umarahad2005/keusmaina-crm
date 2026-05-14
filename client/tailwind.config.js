/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#e8eaf6',
          100: '#c5cae9',
          200: '#9fa8da',
          300: '#7986cb',
          400: '#5c6bc0',
          500: '#3f51b5',
          600: '#303f9f',
          700: '#283593',
          800: '#1B2A6B',  // Primary brand color
          900: '#0d1642',
        },
        gold: {
          50: '#fef9e7',
          100: '#fdf0c4',
          200: '#fce49d',
          300: '#fad876',
          400: '#f0c94e',
          500: '#D4A017', // Primary accent
          600: '#b8860b',
          700: '#9a7209',
          800: '#7c5d07',
          900: '#5e4605',
        },
        green: {
          50: '#e8f5e9',
          100: '#c8e6c9',
          200: '#a5d6a7',
          300: '#81c784',
          400: '#66bb6a',
          500: '#4caf50',
          600: '#43a047',
          700: '#388e3c',
          800: '#2E7D32', // Madinah accent
          900: '#1b5e20',
        },
        dark: '#1A1A2E',
        light: '#F5F5F5',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Playfair Display', 'Georgia', 'serif'],
        urdu: ['Noto Nastaliq Urdu', 'serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'pulse-gold': 'pulseGold 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212, 160, 23, 0.4)' },
          '50%': { boxShadow: '0 0 0 10px rgba(212, 160, 23, 0)' },
        },
      },
      boxShadow: {
        'card': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 14px 28px rgba(0,0,0,0.15), 0 10px 10px rgba(0,0,0,0.10)',
        'sidebar': '4px 0 15px -3px rgba(0, 0, 0, 0.1)',
        'gold': '0 4px 15px rgba(212, 160, 23, 0.3)',
      },
    },
  },
  plugins: [],
}
