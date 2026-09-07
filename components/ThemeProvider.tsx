"use client";

/**
 * 🌞🌙 The Light Switch!
 *
 * Imagine your app is a room. Sometimes you want bright lights (day mode ☀️).
 * Sometimes you want dim lights (night mode 🌙). This little box wraps up
 * the whole app and gives it a light switch.
 *
 * - `attribute="class"` means: put a CSS class on the <html> tag like
 *   `class="dark"` or `class="light"` so Tailwind can pick the right colors.
 * - `defaultTheme="dark"` means: when a brand-new visitor comes, show night
 *   mode (matches what the app already does today).
 * - `enableSystem={true}` means: if their phone says "I'm in dark mode",
 *   use that automatically.
 * - `disableTransitionOnChange` means: don't flash colors when switching.
 *
 * This is a "client" component (the "use client" line at top) because it
 * uses browser stuff — the light switch only works in the browser, not the
 * server.
 */
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
