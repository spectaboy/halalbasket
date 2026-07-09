/** @type {import('tailwindcss').Config} */
module.exports = {
  // darkMode: 'class', // Uncomment if you use a toggle, otherwise relies on OS setting
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./App.tsx", // Include App.tsx if using className there
  ],
  theme: {
    extend: {
      colors: {
        // URide Brand Palette (adjust hex codes as needed)
        "uride-green": '#00C853',       // Example vibrant green from screenshots
        "uride-bg-dark": '#121212',    // Main dark background
        "uride-bg-card": '#1E1E1E',    // Slightly lighter card background
        "uride-border": '#333333',    // Borders for inputs/cards
        "uride-input-bg": '#2C2C2C',  // Dark input field background
        "uride-text-primary": '#FFFFFF',  // Primary text (white)
        "uride-text-secondary": '#A0A0A0', // Secondary text (light gray)
        "uride-text-placeholder": '#757575', // Placeholder text
        "uride-text-green": '#00C853',    // Green text (e.g., price)
      },
      // Add custom font families if needed
      // fontFamily: {
      //   sans: ['YourFont-Regular', 'sans-serif'],
      //   bold: ['YourFont-Bold', 'sans-serif'],
      // },
    },
  },
  plugins: [],
}; 