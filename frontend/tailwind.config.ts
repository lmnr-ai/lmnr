/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
