'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';

interface TabItem {
    name: string;
    path: string;
    icon: React.ReactNode;
    activeIcon: React.ReactNode;
    roles: string[];
    feature?: string; // optional feature gate — hides tab if dept doesn't have this feature
}

export const BottomTabBar = () => {
    const pathname = usePathname();
    const { user } = useAuth();
    const { hasFeature } = useDepartment();

    if (!user) return null;

    const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

    const tabItems: TabItem[] = [
        {
            name: 'Dashboard',
            path: '/dashboard',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
            ),
            roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'],
            feature: 'inventory',
        },
        {
            name: 'Checkout',
            path: '/checkout',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            roles: ['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'],
            feature: 'inventory',
        },
        {
            name: 'Transactions',
            path: '/transactions',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            roles: ['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'],
            feature: 'inventory',
        },
        {
            name: 'Returns',
            path: '/returns',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            ),
            roles: ['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'],
            feature: 'inventory',
        },
        {
            name: 'Inventory',
            path: '/inventory',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
            ),
            roles: ['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'],
            feature: 'inventory',
        },
        {
            name: 'Calendar',
            path: '/calendar',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
            ),
            roles: ['CREW', 'MANAGER', 'ADMIN'],
            feature: 'calendar',
        },
    ];

    // Filter tabs by role AND feature gating (matches Sidebar logic)
    const visibleTabs = tabItems.filter(tab =>
        tab.roles.includes(user.role) &&
        (!tab.feature || hasFeature(tab.feature))
    );

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-[100] md:hidden">
            {/* Glassmorphic background */}
            <div className="absolute inset-0 bg-gray-200 dark:bg-[#2c2c2e] backdrop-blur-xl backdrop-saturate-150 border-t border-gray-300 dark:border-[#3a3a3c]" />

            {/* Tab container */}
            <div className="relative flex items-center justify-around px-2 pb-safe-bottom pt-2">
                {visibleTabs.map((tab) => {
                    const active = isActive(tab.path);
                    return (
                        <Link
                            key={tab.path}
                            href={tab.path}
                            replace
                            className={`flex flex-col items-center justify-center min-w-[64px] py-1 px-3 transition-all duration-200 ${active ? 'text-primary' : 'text-gray-500 dark:text-zinc-400'
                                }`}
                        >
                            <div className={`relative transition-transform duration-200 ${active ? 'scale-110' : 'scale-100'}`}>
                                {active ? tab.activeIcon : tab.icon}
                                {active && (
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[var(--primary)] rounded-full" />
                                )}
                            </div>
                            <span className={`text-[10px] mt-1 font-medium ${active ? 'font-semibold' : ''}`}>
                                {tab.name}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
};
