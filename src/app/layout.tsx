import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "To the stars",
  description:
    "Ближайшие хакатоны, розыгрыши и способы прокачать портфолио — собраны в одном месте. Автор проекта: dorezz.",
  applicationName: "To the stars",
  manifest: "/manifest.webmanifest",
  keywords: ["хакатоны", "розыгрыши", "портфолио", "стажировки", "конкурсы", "IT"],
  icons: {
    icon: [
      { url: "/logo.svg?v=2", type: "image/svg+xml" },
      { url: "/logo-192.png?v=2", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png?v=2",
  },
  openGraph: {
    title: "To the stars",
    description: "Хакатоны, розыгрыши и рост портфолио — собраны в одном месте",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050506" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "To the stars",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-surface text-ink`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
