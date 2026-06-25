/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        pulse: {
          deepest: "#0B0D15",
          surface: "#12141D",
          elevated: "#1A1D28",
          hover: "#222638",
          border: "#2E3348",
          accent: "#F0B429",
          "accent-soft": "#F6D055",
          "accent-dim": "#C4941F",
          indigo: "#6366F1",
          blue: "#60A5FA",
          teal: "#2DD4BF",
          rose: "#FB7185",
          emerald: "#34D399",
          amber: "#FBBF24",
          sky: "#38BDF8",
          purple: "#A78BFA",
          text: {
            primary: "#E8EAF0",
            secondary: "#9499B3",
            muted: "#656A82",
          },
        },
        method: {
          get: "#2DD4BF",
          post: "#60A5FA",
          put: "#F0B429",
          patch: "#A78BFA",
          "delete": "#FB7185",
          head: "#34D399",
          options: "#94A3B8",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "code-sm": ["0.75rem", { lineHeight: "1rem" }],
        code: ["0.8125rem", { lineHeight: "1.25rem" }],
        "code-lg": ["0.9375rem", { lineHeight: "1.5rem" }],
      },
      animation: {
        "pulse-soft": "pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
