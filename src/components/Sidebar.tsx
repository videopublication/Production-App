'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSidebar } from '@/lib/sidebar-context';

export const Sidebar = () => {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const { isCollapsed, toggleCollapsed } = useSidebar();

    const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

    const navItems = [
        { name: 'Dashboard', path: '/dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z', roles: ['MANAGER', 'ADMIN'] },
        { name: 'Inventory', path: '/inventory', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', roles: ['CREW', 'MANAGER', 'ADMIN'] },
        { name: 'Checkout', path: '/checkout', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', roles: ['CREW', 'MANAGER', 'ADMIN'] },
        { name: 'Returns', path: '/returns', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', roles: ['CREW', 'MANAGER', 'ADMIN'] },
        { name: 'Transactions', path: '/transactions', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', roles: ['CREW', 'MANAGER', 'ADMIN'] },
        { name: 'Verification', path: '/verification', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', roles: ['MANAGER', 'ADMIN'] },
        { name: 'Shoots', path: '/admin/shoots', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', roles: ['ADMIN', 'MANAGER', 'CREW'] },
        { name: 'Calendar', path: '/calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', roles: ['CREW', 'MANAGER', 'ADMIN'] },
        { name: 'Users', path: '/admin/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', roles: ['ADMIN'] },
        { name: 'Activity Logs', path: '/admin/logs', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', roles: ['ADMIN'] },

    ];

    if (!user) return null;

    return (
        // Desktop only - hidden on mobile (bottom tabs used instead)
        <aside className={`
            hidden md:flex fixed top-0 left-0 h-screen bg-card dark:bg-[#2c2c2e] z-40 transition-all duration-300 ease-out flex-col border-r border-border dark:border-[#3a3a3c]
            ${isCollapsed ? 'w-[72px]' : 'w-[260px]'}
        `}>
            {/* Logo */}
            <div className={`h-16 flex items-center border-b border-border dark:border-[#3a3a3c] ${isCollapsed ? 'justify-center px-0' : 'px-5 gap-3'}`}>
                <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </div>
                {!isCollapsed && <span className="font-semibold text-[17px] text-foreground">VP App</span>}
            </div>

            {/* Navigation */}
            <nav className={`flex-1 py-5 overflow-y-auto ${isCollapsed ? 'px-3' : 'px-4'}`}>
                {navItems.map((item) => (
                    item.roles.includes(user.role) && (
                        <Link key={item.path} href={item.path} className="block mb-2" title={isCollapsed ? item.name : undefined}>
                            <div className={`flex items-center rounded-xl transition-all duration-200 ${isCollapsed
                                ? 'justify-center w-11 h-11 mx-auto'
                                : 'gap-3 px-3 py-2.5'
                                } ${isActive(item.path)
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-foreground hover:bg-muted dark:hover:bg-[#3a3a3c]'
                                }`}>
                                <svg className="w-[20px] h-[20px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                </svg>
                                {!isCollapsed && <span className="text-[15px] font-medium">{item.name}</span>}
                            </div>
                        </Link>
                    )
                ))}
            </nav>

            {/* Collapse Toggle Button */}
            <div className={`px-3 py-2 border-t border-border dark:border-[#3a3a3c] ${isCollapsed ? 'flex justify-center' : ''}`}>
                <button
                    onClick={toggleCollapsed}
                    className={`flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 ${isCollapsed ? 'w-11 h-11 mx-auto' : 'w-full gap-2 px-3 py-2.5'
                        }`}
                    title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                >
                    <svg
                        className={`w-[18px] h-[18px] transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                    {!isCollapsed && <span className="text-[13px] font-medium">Collapse</span>}
                </button>
            </div>

            {/* User Profile */}
            <div className={`p-3 border-t border-border dark:border-[#3a3a3c] ${isCollapsed ? 'flex justify-center' : ''}`}>
                {isCollapsed ? (
                    <Link
                        href="/profile"
                        className="w-11 h-11 rounded-full bg-gradient-to-br from-[#5856d6] to-[#af52de] flex items-center justify-center text-white font-semibold text-[15px] hover:opacity-90 transition-opacity"
                        title="View Profile"
                    >
                        {user.name.charAt(0).toUpperCase()}
                    </Link>
                ) : (
                    <div className="flex items-center gap-3 px-3 py-3">
                        <Link href="/profile" className="flex items-center gap-3 flex-1 min-w-0 group cursor-pointer">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5856d6] to-[#af52de] flex items-center justify-center text-white font-semibold text-[15px] flex-shrink-0 group-hover:opacity-90 transition-opacity">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-[14px] text-foreground truncate group-hover:text-primary transition-colors">{user.name}</p>
                                <p className="text-[12px] text-muted-foreground">{user.role}</p>
                            </div>
                        </Link>
                        <button
                            onClick={logout}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Sign Out"
                        >
                            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </aside>
    );
};
