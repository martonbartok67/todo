import type { Config } from "tailwindcss";

/**
 * 🎨 THE COLOR RULE BOOK
 *
 * Tailwind reads this file whenever the app asks "what color is X?".
 *
 * We are setting up **two paint sets** now:
 *   ☀️  `light`  — bright backgrounds, dark text  (for day mode)
 *   🌙  `dark`   — dark backgrounds, light text   (for night mode)
 *
 * The little `colors:` block below uses **CSS variables** — those are
 * placeholders that change value depending on which mode is active.
 * When the user clicks the light switch (☀️ ↔ 🌙), the variables flip
 * from the light values to the dark values (or vice-versa), and every
 * part of the app that uses them changes color automatically. Magic! ✨
 *
 * Right now we are only swapping the *background* and *foreground* colors
 * so you can see the light switch working. We will swap more colors in
 * a later step.
 *
 * The `urgent.*` colors are kept as plain hex codes because red is red
 * is red in both modes. We don't want critical homework warnings to
 * suddenly turn pastel.
 */
const config: Config = {
  // 👀 Tell Tailwind where to LOOK for class names in our code.
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  // 🌙 Tell Tailwind: "the `dark:` class prefix means 'dark mode'".
  // (We already had this from the budgetingnl.nl plan, just making it explicit.)
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ☀️🌙 These paint the whole page.
        // When `dark` class is on <html>, they pick the dark values.
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border:     "hsl(var(--border) / <alpha-value>)",
        muted:      "hsl(var(--muted) / <alpha-value>)",

        // 🆕 Tinted surface cards (the rounded boxes our app uses).
        // All four resolve to CSS variables defined in globals.css so
        // they pick the right shade per theme — near-white in light
        // mode, near-black in dark mode.
        surface: {
          DEFAULT: "hsl(var(--surface-default) / <alpha-value>)",
          1:       "hsl(var(--surface-1) / <alpha-value>)",
          2:       "hsl(var(--surface-2) / <alpha-value>)",
          3:       "hsl(var(--surface-3) / <alpha-value>)",
        },

        // 🚨 Urgency colors stay constant — a red is a red.
        urgent: {
          critical: "#ef4444",
          high:     "#f97316",
          medium:   "#eab308",
          low:      "#6366f1",
        },
      },
      // 🅰️ Default font family fallback chain — system fonts feel snappy.
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      // 🔢 Tabular numerals — used for dates, points, counters.
      // Without this, "10" and "1" have different widths and lists
      // wobble. `tabular-nums` enables fixed-width digits.
      fontVariantNumeric: {
        "tabular-nums": "lining-nums tabular-nums",
      },
    },
  },
  plugins: [],
};

export default config;
