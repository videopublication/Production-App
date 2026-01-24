'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileHeader } from './MobileHeader';
import { BottomTabBar } from './BottomTabBar';
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context';
import { ToastProvider } from '@/lib/toast-context';
import { DialogProvider } from '@/lib/dialog-context';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import { OfflineIndicator } from './OfflineIndicator';
import { Button } from './Button';
import { RefreshCcw } from 'lucide-react';

const MainContent = ({ children, isPublicPage }: { children: React.ReactNode; isPublicPage: boolean }) => {
    const { user } = useAuth();
    const { isCollapsed } = useSidebar();

    return (
        <div className={`flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300 ${user && !isPublicPage
            ? isCollapsed
                ? 'md:pl-[72px]'
                : 'md:pl-[260px]'
            : ''
            }`}>
            {/* Desktop Header */}
            {!isPublicPage && <Header />}
            {/* Mobile Header */}
            {!isPublicPage && <MobileHeader />}

            <main className={`flex-1 px-4 py-4 sm:p-6 lg:p-8 ${user && !isPublicPage ? 'mt-[calc(44px+env(safe-area-inset-top))] md:mt-[44px] pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-6' : ''} w-full mx-auto overflow-x-hidden`}>
                {children}
            </main>

            {/* Mobile Bottom Tab Bar */}
            {!isPublicPage && <BottomTabBar />}
        </div>
    );
};


export const AppLayout = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname();
    const router = useRouter();

    // PWA Update Logic
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            const sw = navigator.serviceWorker;

            // Check for updates on every mount/navigation
            sw.getRegistration().then(registration => {
                if (registration) {
                    registration.update();
                }
            });

            // Listen for new service worker
            let refreshing = false;
            sw.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                }
            });
        }
    }, [pathname]);

    const isPublicPage = pathname === '/login' || pathname === '/' || pathname === '/inactive';

    // Wrap with SidebarProvider only for authenticated pages
    const { user, isLoading } = useAuth();

    // Loading state with safety recovery
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
                <h2 className="text-lg font-medium mb-2">Connecting to Vpub...</h2>
                <p className="text-sm text-muted-foreground max-w-[250px] mb-8">
                    This is taking longer than usual. If it persists, try refreshing.
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="gap-2"
                >
                    <RefreshCcw size={16} />
                    Refresh Page
                </Button>
            </div>
        );
    }

    if (isPublicPage || !user) {
        return (
            <ToastProvider>
                <DialogProvider>
                    <div className="min-h-screen bg-background text-foreground flex overflow-x-hidden">
                        <div className="flex-1 flex flex-col min-h-screen min-w-0">
                            <main className="flex-1 w-full mx-auto overflow-x-hidden">
                                {children}
                            </main>
                        </div>
                    </div>
                    <PWAInstallPrompt />
                    <OfflineIndicator />
                </DialogProvider>
            </ToastProvider>
        );
    }

    return (
        <ToastProvider>
            <DialogProvider>
                <SidebarProvider>
                    <div className="min-h-screen bg-background text-foreground flex overflow-x-hidden">
                        <Sidebar />
                        <MainContent isPublicPage={isPublicPage}>
                            {children}
                        </MainContent>
                    </div>
                    <PWAInstallPrompt />
                    <OfflineIndicator />
                </SidebarProvider>
            </DialogProvider>
        </ToastProvider>
    );
};
