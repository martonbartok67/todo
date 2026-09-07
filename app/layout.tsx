import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ThemeProvider";

/**
 * 🪟 The "headline" of every page that the browser tab shows.
 * We start including Apple-specific stickers now so we don't have to
 * come back to this file later when we do the PWA step.
 */
export const metadata: Metadata = {
  title: "Canvas Sync",
  description: "Zero-maintenance Canvas LMS task tracker",
  // 🍎 Apple stickers — they tell iPhones "treat my website like an app".
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Canvas Sync",
  },
  applicationName: "Canvas Sync",
  formatDetection: { telephone: false }, // don't auto-link phone numbers
};

/**
 * 🪟 The "viewport" tells the browser how the page should look on a phone.
 * `themeColor` is the color of the very top bar on phones (the one with
 * the time and battery). We set it twice with `media` so it switches
 * with dark/light mode automatically.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)",  color: "#0a0a0f" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // We no longer hard-code `className="dark"` here. The ThemeProvider
    // adds the right class (light or dark) automatically.
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#0a0a0f] text-white antialiased">
        {/*
         * 🤗 The hug! Everything inside this is wrapped in our light switch.
         * `suppressHydrationWarning` above silences a harmless warning that
         * happens because the server doesn't know the user's theme yet —
         * next-themes fixes it on the client side immediately.
         */}
        <ThemeProvider>
          {children}
          {/*
           * 🍞 The toast popup (the little "Saved!" messages) listens to the
           * theme, so it shows up correctly in both day and night mode.
           */}
          <Toaster theme="dark" position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
