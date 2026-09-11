import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        border:     "var(--border)",
        muted:      "var(--muted)",
        accent:     {
          DEFAULT: "var(--accent)",
          fg:      "var(--accent-fg)",
        },
        surface: {
          DEFAULT: "var(--surface-card)",
          card:    "var(--surface-card)",
          1:       "var(--surface-1)",
          2:       "var(--surface-2)",
          3:       "var(--surface-3)",
        },
        urgent: {
          critical: "var(--urgency-critical)",
          high:     "var(--urgency-high)",
          medium:   "var(--urgency-medium)",
          low:      "var(--urgency-low)",
        },
      },
      fontFamily: {
        sans: ["Nunito", "ui-rounded", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
