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
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border:     "hsl(var(--border) / <alpha-value>)",
        muted:      "hsl(var(--muted) / <alpha-value>)",
        accent:     {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          fg:      "hsl(var(--accent-fg) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "hsl(var(--surface-default) / <alpha-value>)",
          1:       "hsl(var(--surface-1) / <alpha-value>)",
          2:       "hsl(var(--surface-2) / <alpha-value>)",
          3:       "hsl(var(--surface-3) / <alpha-value>)",
        },
        urgent: {
          critical: "#ef4444",
          high:     "#f97316",
          medium:   "#eab308",
          low:      "#6366f1",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
