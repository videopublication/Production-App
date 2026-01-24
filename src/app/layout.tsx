import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import QueryProvider from "@/lib/query-provider";
import { PreferencesProvider } from "@/lib/preferences-context";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  title: "Vpub App",
  description: "Manage equipment checkout and returns",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Vpub App',
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={inter.className} suppressHydrationWarning>
        <QueryProvider>
          <AuthProvider>
            <PreferencesProvider>
              <AppLayout>
                {children}
              </AppLayout>
            </PreferencesProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
