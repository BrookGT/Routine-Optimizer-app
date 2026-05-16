/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"Geist"', '"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', '"Fira Code"', "ui-monospace", "monospace"],
      },
      colors: {
        /* ── Warm stone system ── */
        surface: {
          DEFAULT: "#fafaf8",
          raised:  "#ffffff",
          overlay: "#f5f5f3",
          inset:   "#f0efed",
        },
        border: {
          DEFAULT: "#e5e4e0",
          subtle:  "#eeede9",
          strong:  "#d4d2cc",
        },
        text: {
          primary:   "#1c1917",
          secondary: "#57534e",
          tertiary:  "#a8a29e",
          inverse:   "#fafaf8",
          link:      "#1c1917",
        },
        /* ── Sidebar / canvas ── */
        canvas: {
          DEFAULT: "#111110",
          muted:   "#1a1a18",
          border:  "rgba(255,255,255,0.07)",
          text:    "rgba(255,255,255,0.55)",
          textHover: "rgba(255,255,255,0.9)",
          active:  "rgba(255,255,255,0.09)",
        },
        /* ── Action / accent: warm neutral ── */
        action: {
          DEFAULT: "#1c1917",
          hover:   "#292524",
          text:    "#ffffff",
        },
        /* ── Semantic greens (success / positive) ── */
        positive: {
          DEFAULT: "#16a34a",
          muted:   "#dcfce7",
          text:    "#15803d",
        },
        /* ── Amber (warning) ── */
        warn: {
          DEFAULT: "#d97706",
          muted:   "#fef9c3",
          text:    "#b45309",
        },
        /* ── Red (error / danger) ── */
        negative: {
          DEFAULT: "#dc2626",
          muted:   "#fee2e2",
          text:    "#b91c1c",
        },
        /* ── Bronze accent for highlights ── */
        bronze: {
          DEFAULT: "#92400e",
          muted:   "#fef3c7",
          light:   "#fbbf24",
        },
      },
      spacing: {
        "4.5": "1.125rem",
        "13":  "3.25rem",
        "15":  "3.75rem",
        "18":  "4.5rem",
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "24px",
      },
      boxShadow: {
        /* Minimal, warm-toned shadows */
        "xs":   "0 1px 2px rgba(0,0,0,0.04)",
        "sm":   "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "card": "0 0 0 1px #e5e4e0, 0 1px 3px rgba(0,0,0,0.04)",
        "card-hover": "0 0 0 1px #d4d2cc, 0 4px 12px rgba(0,0,0,0.06)",
        "md":   "0 4px 12px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04)",
        "lg":   "0 8px 24px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)",
        "overlay": "0 16px 48px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)",
      },
      animation: {
        "fade-in":    "fadeIn 0.2s ease-out both",
        "slide-up":   "slideUp 0.25s ease-out both",
        "slide-down": "slideDown 0.2s ease-out both",
        "shimmer":    "shimmer 1.6s ease-in-out infinite",
        "pulse-dot":  "pulseDot 2s ease-in-out infinite",
        "spin-s":     "spin 0.8s linear infinite",
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        slideUp:   { from: { opacity: 0, transform: "translateY(10px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        slideDown: { from: { opacity: 0, transform: "translateY(-6px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        shimmer:   {
          "0%":   { backgroundPosition: "-600px 0" },
          "100%": { backgroundPosition: "600px 0" },
        },
        pulseDot: {
          "0%, 100%": { opacity: 1 },
          "50%":      { opacity: 0.35 },
        },
      },
      backgroundImage: {
        "shimmer-gradient":
          "linear-gradient(90deg, #f0efed 0px, #e9e8e4 200px, #f0efed 400px)",
      },
      transitionTimingFunction: {
        "smooth": "cubic-bezier(0.25, 0.1, 0.25, 1.0)",
      },
    },
  },
  plugins: [],
};
