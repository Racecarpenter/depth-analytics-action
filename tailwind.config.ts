import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0b0c",
          raised: "#111315",
          card: "#141618",
          overlay: "#1a1d20",
        },
        border: {
          DEFAULT: "#22262a",
          subtle: "#1a1d20",
          strong: "#2e3338",
        },
        ink: {
          DEFAULT: "#e7eaec",
          muted: "#9aa2a8",
          faint: "#5f676d",
        },
        accent: {
          DEFAULT: "#2fe58a",
          dim: "#1fa666",
          bright: "#5bffb0",
          wash: "rgba(47, 229, 138, 0.08)",
        },
        warn: "#e5b92f",
        danger: "#e5573f",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "JetBrains Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        subtle: "0 1px 0 0 rgba(255,255,255,0.03) inset",
        glow: "0 0 0 1px rgba(47,229,138,0.15), 0 0 24px -8px rgba(47,229,138,0.35)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out both",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
