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
        background: {
          DEFAULT: "var(--background)",
          alt:     "var(--background-alt)",
        },
        foreground: {
          DEFAULT: "var(--foreground)",
          soft:    "var(--foreground-soft)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong:  "var(--border-strong)",
        },
        muted:      "var(--muted)",
        accent:     {
          DEFAULT: "var(--accent)",
          soft:    "var(--accent-soft)",
          strong:  "var(--accent-strong)",
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
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
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
