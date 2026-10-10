import type { Metadata, Viewport } from "next";
import { Geist, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { LAUNCH_SCREENS } from "./launch-screens";
import { Providers } from "@/components/providers";
import { DataSourceProvider } from "@/components/market/data-source";
import { servesGeneratedData } from "@/lib/market/providers";
import { AnnouncementBarScript } from "@/components/shell/announcement-bar-script";
import { AppShell } from "@/components/shell/app-shell";
import { RegisterServiceWorker } from "@/components/shell/register-service-worker";

/**
 * Geist — the interface face, chosen 2026-09-29 over Inter and Satoshi.
 *
 * Served through `next/font/google`, which downloads at build time and
 * self-hosts from our own origin — no request to Google at runtime. Its tuning
 * is the `--face-*` block in `globals.css`; Satoshi's values and the loader to
 * restore it are in docs/design-system.md → "The interface face", and its file
 * is still in `app/fonts/`.
 *
 * `display: "block"`: `swap` would flash a system fallback across every number
 * on the screen.
 */
const ui = Geist({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "block",
});

/** Ticker symbols and timestamps only. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ember — know what to do, and when",
    template: "%s · ember",
  },
  description:
    "ember watches stocks, forex and crypto, tracks what you own, and tells you what to act on and the window to act in.",
  applicationName: "ember",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ember", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Stops iOS zooming into a field on focus: phone inputs are 14px, under
  // its 16px threshold. iOS ignores this cap for pinch-zoom, so the reader
  // can still zoom.
  maximumScale: 1,
  // Lets the bottom nav sit against the home indicator with a safe-area pad
  // rather than being letterboxed above it.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0B0D" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // next-themes writes the class before paint; without this React warns
      // about the attribute it didn't render.
      suppressHydrationWarning
      className={`${ui.variable} ${plexMono.variable} h-full antialiased`}
    >
      {/* iOS launch screens.
          Android composes one from the manifest's `background_color` and
          icon; Safari will not, and shows a white flash instead unless it is
          handed a bitmap matching the device exactly. React hoists these into
          `<head>`, and the list is generated alongside the images by
          `scripts/generate-icons.mjs` so it can't drift from what's on disk. */}
      {LAUNCH_SCREENS.map((screen) => (
        <link
          key={screen.href}
          rel="apple-touch-startup-image"
          media={screen.media}
          href={screen.href}
        />
      ))}

      <body className="min-h-full">
        <AnnouncementBarScript />
        <a
          href="#main"
          className="sr-only rounded-lg bg-ink px-4 py-2 text-caption font-medium text-ground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <Providers>
          <DataSourceProvider synthetic={servesGeneratedData()}>
            <AppShell>{children}</AppShell>
          </DataSourceProvider>
          <RegisterServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
