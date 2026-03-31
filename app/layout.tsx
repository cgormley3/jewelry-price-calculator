import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "./providers";

export const metadata: Metadata = {
  title: "Jewelry Vault - by Bear Silver and Stone",
  description: "Calculate and inventory your precious metal jewelry. Made by a jeweler, for jewelers.",
  // These settings trigger the standalone "App" mode on iPhone
  appleWebApp: {
    capable: true,
    title: "The Vault",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: '/icon.png?v=5',
    apple: "/icon.png?v=5",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}