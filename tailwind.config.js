/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 50: "#f2f5f9", 100: "#e3e9f2", 200: "#c5d1e2", 400: "#6a7f9e", 500: "#4a5f80", 600: "#34476a", 700: "#243656", 800: "#172540", 900: "#0f1b30" },
        brand: { 50: "#ecfdf3", 100: "#d1fadf", 200: "#a6f4c5", 500: "#16a34a", 600: "#15803d", 700: "#166534" },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
