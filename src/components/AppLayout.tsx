'use client';

import { usePathname } from 'next/navigation';
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

type LockableScreenOrientation = ScreenOrientation & {
    lock?: (orientation: 'portrait' | 'landscape' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary' | 'any' | 'natural') => Promise<void>;
};

const MainContent = ({ children, isPublicPage }: { children: React.ReactNode; isPublicPage: boolean }) => {
    const { user } = useAuth();
    const { isCollapsed } = useSidebar();

    return (
        <div className={`app-content-shell flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300 ${user && !isPublicPage
            ? isCollapsed
                ? 'md:pl-[72px]'
                : 'md:pl-[260px]'
            : ''
            }`}>
            {/* Desktop Header */}
            {!isPublicPage && <Header />}
            {/* Mobile Header */}
            {!isPublicPage && <MobileHeader />}

            <main className={`app-main-scroll flex-1 px-4 py-4 sm:p-6 lg:p-8 ${user && !isPublicPage ? 'md:mt-[44px] md:pb-6' : ''} w-full mx-auto overflow-x-hidden`}>
                {children}
            </main>

            {/* Mobile Bottom Tab Bar */}
            {!isPublicPage && <BottomTabBar />}
        </div>
    );
};


export const AppLayout = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname();

    const isPublicPage = pathname === '/login' || pathname === '/' || pathname === '/inactive';

    // Wrap with SidebarProvider only for authenticated pages
    const { user, isLoading } = useAuth();

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const syncViewportHeight = () => {
            const height = window.visualViewport?.height || window.innerHeight;
            document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
        };

        syncViewportHeight();
        window.addEventListener('resize', syncViewportHeight);
        window.addEventListener('orientationchange', syncViewportHeight);
        window.visualViewport?.addEventListener('resize', syncViewportHeight);

        return () => {
            window.removeEventListener('resize', syncViewportHeight);
            window.removeEventListener('orientationchange', syncViewportHeight);
            window.visualViewport?.removeEventListener('resize', syncViewportHeight);
        };
    }, []);

    // Lock orientation to portrait
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
            orientation?.lock?.('portrait').catch(() => {
                // Silently fail if not supported or requires gesture
            });
        }
    }, []);

    // Loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
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
                    <div className="app-shell min-h-screen bg-background text-foreground flex overflow-x-hidden">
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
