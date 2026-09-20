import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        stone: {
          925: "#161412",
          950: "#0d0c0b",
        },
        clay: {
          50: "#faf6f1",
          100: "#f3ebe1",
          200: "#e6d5c1",
          300: "#d4b892",
          400: "#c19a68",
          500: "#ab8050",
          600: "#8f6740",
          700: "#725136",
          800: "#5c4230",
          900: "#4c3829",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "ui-serif", "Georgia", "serif"],
        sans: ["'Inter'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 2px 8px -2px rgba(20, 16, 12, 0.08), 0 8px 24px -8px rgba(20, 16, 12, 0.10)",
      },
    },
  },
  plugins: [],
} satisfies Config;
