import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deliberately dark, muted eucalyptus tones rather than near-black —
        // the brand avoids pure-black panels (see sage/champagne design system).
        stone: {
          900: "#3A473E",
          925: "#34413A",
          950: "#28332C",
        },
        // "clay" keeps its historical role as the primary accent scale (badges,
        // CTAs, active states) but now renders the sage + champagne palette:
        // 50-300 = card/sage surfaces, 400-600 = champagne accent,
        // 700-900 = deep eucalyptus / main text.
        clay: {
          50: "#FAF9F5",
          100: "#F3F6F1",
          200: "#E8EEE7",
          300: "#D9D0C2",
          400: "#D6BC8D",
          500: "#C4A873",
          600: "#A98F5E",
          700: "#718575",
          800: "#536B5D",
          900: "#303B33",
        },
        sage: {
          50: "#FAF9F5",
          100: "#F3F6F1",
          200: "#E8EEE7",
          300: "#D8DED5",
          400: "#B6C3B9",
          500: "#718575",
          600: "#5D7367",
          700: "#536B5D",
          800: "#44574B",
          900: "#303B33",
        },
        champagne: {
          100: "#F1ECE3",
          200: "#E6D9C4",
          300: "#DFC9A3",
          400: "#D6BC8D",
          500: "#C4A873",
          600: "#A98F5E",
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
