module.exports = {
  darkMode: false,
  plugins: [require('@tailwindcss/forms')],
  purge: ['./components/**/*.{js,ts,jsx,tsx}', './pages/**/*.{js,ts,jsx,tsx}'],
  // or 'media' or 'class'
  theme: {
    extend: {
      minHeight: {
        0: '0',
        '1/5': '20%',
        '2/5': '40%',
        24: '6rem',
        '3/5': '60%',
        '4/5': '80%',
      },
    },
  },
  variants: {
    extend: {
      borderWidth: ['first'],
      margin: ['first'],
      opacity: ['disabled'],
    },
  },
};
