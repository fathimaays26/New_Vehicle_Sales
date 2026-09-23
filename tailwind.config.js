/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'nvs-navy': '#0B2545',   // header / deep brand blue
        'nvs-blue': '#2563EB',   // primary accent blue
        'nvs-bg': '#F5F7FA',     // main content background
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}