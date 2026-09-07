"use client";

/**
 * 🔘 Theme Toggle Button
 *
 * A small floating button that flips between light and dark mode.
 *
 * How it works:
 *  - `useTheme()` is a hook from `next-themes` that gives us the current
 *    theme ("light" | "dark" | "system") and a `setTheme()` function.
 *  - We render a placeholder (a faded dot) on the server and during the
 *    very first client render to avoid a "flash" of the wrong icon. Once
 *    `mounted` becomes true, we know the browser has loaded the saved
 *    theme from localStorage and we can show the real icon.
 *  - On click: if currently dark → switch to light, else → switch to dark.
 */
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // Runs once on the client after first render.
  useEffect(() => setMounted(true), []);

  // Pre-hydration placeholder so the layout doesn't shift.
  if (!mounted) {
    return (
      <button
        aria-label="Toggle theme"
        className="w-9 h-9 rounded-lg border border-border bg-surface-1 flex items-center justify-center text-muted opacity-50"
      >
        <span className="block w-4 h-4 rounded-full bg-current" />
      </button>
    );
  }

  const isDark = theme === "dark";
  const next = isDark ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
      className="w-9 h-9 rounded-lg border border-border bg-surface-1 hover:bg-surface-2 transition-colors flex items-center justify-center text-foreground"
    >
      {/* Sun when in dark mode (click to brighten), moon when in light mode (click to dim). */}
      {isDark ? (
        // ☀️
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // 🌙
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
