import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appIconPwaPath } from "@/lib/app-icon";
import { IOS_PWA_STARTUP_IMAGES } from "./pwa-apple-splash";
import { AuthProvider } from "./providers";

/** BOMA pale cream — matches globals background / reduces UI flash before paint */
const PWA_THEME = "#f6f1e9";

export const metadata: Metadata = {
  title: "Jewelry Vault — Boulder Metalsmithing Association",
  description: "Calculate and inventory your precious metal jewelry. Made by a jeweler, for jewelers.",
  // These settings trigger the standalone "App" mode on iPhone
  appleWebApp: {
    capable: true,
    title: "The Vault",
    statusBarStyle: "black-translucent",
    startupImage: IOS_PWA_STARTUP_IMAGES,
  },
  icons: {
    icon: appIconPwaPath(),
    apple: appIconPwaPath(),
  },
};

/**
 * Zoom is locked to reduce frustrating input-zoom on iOS in dense numeric forms.
 * Tradeoff: users who rely on pinch-to-zoom for readability may need OS accessibility zoom instead.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: PWA_THEME,
};

function supabasePreconnectOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw || !(raw.startsWith("http://") || raw.startsWith("https://"))) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabaseOrigin = supabasePreconnectOrigin();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://accounts.google.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://challenges.cloudflare.com" crossOrigin="anonymous" />
        {supabaseOrigin ? (
          <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
        ) : null}
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}