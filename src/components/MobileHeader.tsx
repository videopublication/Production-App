'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { Notification as AppNotification } from '@/types';
import useFcmToken from '@/hooks/useFcmToken';

const pageNames: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/inventory': 'Inventory',
    '/checkout': 'Checkout',
    '/returns': 'Returns',
    '/transactions': 'Transactions',
    '/verification': 'Verification',
    '/admin/users': 'Users',
    '/admin/cleanup': 'Cleanup',
    '/profile': 'Profile',
};
// ... (pageNames object remains same, so not included in replacement)

export const MobileHeader = () => {
    const { user } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const { notificationPermission } = useFcmToken();

    // Notification State
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    const loadNotifications = async () => {
        if (!user) return;
        try {
            const data = await storage.getNotifications(user.id);
            setNotifications(data);
            setUnreadCount(data.filter((n: any) => !n.read).length);
        } catch (error) {
            console.error("Error loading notifications in MobileHeader:", error);
        }
    };

    useEffect(() => {
        if (user) {
            loadNotifications();
            const interval = setInterval(loadNotifications, 30000);
            return () => clearInterval(interval);
        }
    }, [user]);

    const handleNotificationClick = async (notif: AppNotification) => {
        if (!notif.read) {
            await storage.markNotificationRead(notif.id);
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
        setShowNotifications(false);
    };

    const markAllRead = async () => {
        await Promise.all(notifications.filter(n => !n.read).map(n => storage.markNotificationRead(n.id)));
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
    };

    if (!user) return null;

    // ... (getPageName function remains same)

    const getPageName = () => {
        if (pageNames[pathname]) return pageNames[pathname];
        for (const [path, name] of Object.entries(pageNames)) {
            if (pathname.startsWith(path + '/')) {
                if (pathname.includes('/inventory/')) return 'Item Details';
                return name;
            }
        }
        return 'Vpub';
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-40 md:hidden">
            {/* Glassmorphic background */}
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-b border-[#e5e5ea]" />

            {/* Content */}
            <div className="relative flex items-center justify-between h-11 px-4 pt-safe-top">
                {/* Left Action / Spacer */}
                <div className="w-[72px] flex items-center">
                    {pathname === '/profile' && (
                        <button
                            onClick={() => router.back()}
                            className="flex items-center text-[#0071e3] active:opacity-50 transition-opacity -ml-2"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="text-[17px] font-normal leading-none pb-[1px]">Back</span>
                        </button>
                    )}
                </div>

                {/* Centered title */}
                <h1 className="text-[17px] font-semibold text-[#1d1d1f] tracking-[-0.4px] absolute left-1/2 transform -translate-x-1/2">
                    {getPageName()}
                </h1>

                {/* Right icons */}
                <div className="flex items-center gap-1">
                    <Link href="/notifications" className="relative w-9 h-9 rounded-xl flex items-center justify-center text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors active:scale-95">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {user && unreadCount > 0 && (
                            <span className="absolute top-2 right-2 w-2 h-2 bg-[#ff3b30] rounded-full"></span>
                        )}
                    </Link>
                    <button className="w-9 h-9 rounded-xl flex items-center justify-center text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors active:scale-95">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                    {/* Profile Avatar */}
                    <Link href="/profile" className="ml-1">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5856d6] to-[#af52de] flex items-center justify-center text-white font-semibold text-sm active:scale-95 transition-transform">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                    </Link>
                </div>
            </div>
        </header>
    );
};
