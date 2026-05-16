/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #6366f1, #8b5cf6)",
        "dark-gradient":  "linear-gradient(165deg, #0f0f1a 0%, #131325 60%, #0c0c18 100%)",
      },
      boxShadow: {
        "brand-sm": "0 2px 8px rgba(99,102,241,0.20)",
        "brand":    "0 4px 20px rgba(99,102,241,0.25)",
        "brand-lg": "0 8px 40px rgba(99,102,241,0.30)",
        "card":     "0 1px 4px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      animation: {
        "fade-in":  "fadeIn 0.25s ease-out both",
        "slide-up": "slideUp 0.3s ease-out both",
        "spin-slow": "spin 1.5s linear infinite",
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        slideUp: { from: { opacity: 0, transform: "translateY(16px)" }, to: { opacity: 1, transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};
