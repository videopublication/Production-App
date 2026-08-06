'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';

interface TabItem {
    name: string;
    path: string;
    icon: React.ReactNode;
    activeIcon: React.ReactNode;
    roles: string[];
    feature?: string; // optional feature gate — hides tab if dept doesn't have this feature
}

const MAX_VISIBLE_TABS = 5;

export const BottomTabBar = () => {
    const pathname = usePathname();
    const { user } = useAuth();
    const { hasFeature, department } = useDepartment();
    const labels = getDepartmentLabels(department);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const moreMenuRef = useRef<HTMLDivElement>(null);

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
            roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER', 'DATA_MANAGER'],
            feature: 'inventory',
        },
        {
            name: labels.workPlural,
            path: '/shoots',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            ),
            roles: ['ADMIN', 'MANAGER', 'CREW', 'SUPER_ADMIN', 'FINANCE_MANAGER', 'DATA_MANAGER'],
            feature: 'shoots',
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
            roles: ['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DATA_MANAGER'],
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
            roles: ['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DATA_MANAGER'],
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
            roles: ['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DATA_MANAGER'],
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
            roles: ['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DATA_MANAGER'],
            feature: 'inventory',
        },
        {
            name: 'Data',
            path: '/data-assets',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2 1.5 3 4 3h8c2.5 0 4-1 4-3V7c0-2-1.5-3-4-3H8C5.5 4 4 5 4 7zM9 9h6M9 13h6M9 17h3" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 3h8c2.5 0 4 1 4 4v10c0 3-1.5 4-4 4H8c-2.5 0-4-1-4-4V7c0-3 1.5-4 4-4zm1 5a1 1 0 100 2h6a1 1 0 100-2H9zm0 4a1 1 0 100 2h6a1 1 0 100-2H9zm0 4a1 1 0 100 2h3a1 1 0 100-2H9z" />
                </svg>
            ),
            roles: ['ADMIN', 'SUPER_ADMIN', 'DATA_MANAGER'],
            feature: 'data_assets',
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
            roles: ['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER', 'DATA_MANAGER'],
            feature: 'calendar',
        },
        {
            name: 'Leaves',
            path: '/leaves',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M8 5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-3v1a2 2 0 01-2 2H9a2 2 0 01-2-2V5H8zm3 0a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 01-1 1h-2a1 1 0 01-1-1V5z" clipRule="evenodd" />
                </svg>
            ),
            roles: ['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER', 'DATA_MANAGER'],
            feature: 'leaves',
        },
    ];

    // Filter tabs by role AND feature gating (matches Sidebar logic)
    const allVisibleTabs = tabItems.filter(tab =>
        tab.roles.includes(user.role) &&
        (!tab.feature || hasFeature(tab.feature))
    );

    // If more than MAX_VISIBLE_TABS, show first (MAX_VISIBLE_TABS - 1) + "More" button
    const needsMore = allVisibleTabs.length > MAX_VISIBLE_TABS;
    const primaryTabs = needsMore ? allVisibleTabs.slice(0, MAX_VISIBLE_TABS - 1) : allVisibleTabs;
    const overflowTabs = needsMore ? allVisibleTabs.slice(MAX_VISIBLE_TABS - 1) : [];

    // Check if any overflow tab is currently active
    const isOverflowActive = overflowTabs.some(tab => isActive(tab.path));

    // Close more menu when clicking outside
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
                setMoreMenuOpen(false);
            }
        };
        if (moreMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [moreMenuOpen]);

    // Close more menu when path changes (user navigated)
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
        setMoreMenuOpen(false);
    }, [pathname]);

    return (
        <nav className="mobile-tab-bar fixed bottom-0 left-0 right-0 z-[100] md:hidden">
            {/* Glassmorphic background */}
            <div className="absolute inset-0 bg-gray-200 dark:bg-[#2c2c2e] backdrop-blur-xl backdrop-saturate-150 border-t border-gray-300 dark:border-[#3a3a3c]" />

            {/* More menu popup */}
            {moreMenuOpen && overflowTabs.length > 0 && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/30 z-[99] animate-in fade-in duration-150"
                        onClick={() => setMoreMenuOpen(false)}
                    />
                    {/* Menu */}
                    <div
                        ref={moreMenuRef}
                        className="absolute bottom-full right-2 mb-2 z-[100] bg-white dark:bg-[#2c2c2e] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[180px] animate-in slide-in-from-bottom-4 fade-in duration-200"
                    >
                        {overflowTabs.map((tab) => {
                            const active = isActive(tab.path);
                            return (
                                <Link
                                    key={tab.path}
                                    href={tab.path}
                                    replace
                                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${active
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                                        }`}
                                    onClick={() => setMoreMenuOpen(false)}
                                >
                                    <div className="w-6 h-6 shrink-0">
                                        {active ? tab.activeIcon : tab.icon}
                                    </div>
                                    <span className={`text-sm ${active ? 'font-semibold' : 'font-medium'}`}>
                                        {tab.name}
                                    </span>
                                    {active && (
                                        <div className="ml-auto w-2 h-2 bg-primary rounded-full" />
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Tab container */}
            <div className="relative flex h-full items-center justify-around px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2">
                {primaryTabs.map((tab) => {
                    const active = isActive(tab.path);
                    return (
                        <Link
                            key={tab.path}
                            href={tab.path}
                            replace
                            className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-all duration-200 select-none ${active ? 'text-primary' : 'text-gray-500 dark:text-zinc-400'
                                }`}
                        >
                            <div className={`relative transition-transform duration-200 ${active ? 'scale-110' : 'scale-100'}`}>
                                {active ? tab.activeIcon : tab.icon}
                                {active && (
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[var(--primary)] rounded-full" />
                                )}
                            </div>
                            <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${active ? 'font-semibold' : ''}`}>
                                {tab.name}
                            </span>
                        </Link>
                    );
                })}

                {/* More button */}
                {needsMore && (
                    <button
                        onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                        className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-all duration-200 select-none ${isOverflowActive || moreMenuOpen ? 'text-primary' : 'text-gray-500 dark:text-zinc-400'
                            }`}
                    >
                        <div className={`relative transition-transform duration-200 ${isOverflowActive ? 'scale-110' : 'scale-100'}`}>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                            </svg>
                            {isOverflowActive && (
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[var(--primary)] rounded-full" />
                            )}
                        </div>
                        <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${isOverflowActive ? 'font-semibold' : ''}`}>
                            More
                        </span>
                    </button>
                )}
            </div>
        </nav>
    );
};
