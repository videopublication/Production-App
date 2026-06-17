import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import QueryProvider from "@/lib/query-provider";
import { DepartmentProvider } from "@/lib/department-context";
import { PreferencesProvider } from "@/lib/preferences-context";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  title: "VP App",
  description: "Manage equipment checkout and returns",
  manifest: "/manifest.json",
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'VP App',
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
    <html lang="en" className="dark" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={inter.className} suppressHydrationWarning>
        <QueryProvider>
          <AuthProvider>
            <DepartmentProvider>
              <PreferencesProvider>
                <AppLayout>
                  {children}
                </AppLayout>
              </PreferencesProvider>
            </DepartmentProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
