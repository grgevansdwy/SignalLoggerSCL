/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        scl: {
          blue:  '#003DA5',
          blue2: '#1a56c4',
          green: '#6FCF97',
        },
      },
      fontFamily: {
        sans: ['"Open Sans"', 'Verdana', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
