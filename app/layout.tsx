import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Canvas Sync",
  description: "Zero-maintenance Canvas LMS task tracker",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Canvas Sync",
  },
  applicationName: "Canvas Sync",
  formatDetection: { telephone: false },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F5F2" },
    { media: "(prefers-color-scheme: dark)",  color: "#111713" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",   // enables env(safe-area-inset-*) on iOS
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Body uses theme tokens — globals.css applies bg-background text-foreground via @apply */}
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster theme="system" position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
