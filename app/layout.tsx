import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    icon: '/icon.png',
    apple: "/icon.png",
  },
};

// This prevents iOS from zooming in on input fields when typing
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}