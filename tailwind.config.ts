import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0a0a0f",
          1: "#111118",
          2: "#1a1a24",
          3: "#22222f",
        },
        border: "#2a2a3a",
        urgent: {
          critical: "#ef4444",
          high:     "#f97316",
          medium:   "#eab308",
          low:      "#6366f1",
        },
        muted: "#6b7280",
      },
    },
  },
  plugins: [],
};

export default config;
