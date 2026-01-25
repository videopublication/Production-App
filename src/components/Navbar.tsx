'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import useFcmToken from '@/hooks/useFcmToken';
import { Button } from './Button';
import { storage } from '@/lib/storage';
import { Notification as AppNotification } from '@/types';

export const Navbar = () => {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const { notificationPermission } = useFcmToken();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Notification State
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    const loadNotifications = async () => {
        if (!user) return;
        try {
            console.log("Fetching notifications for user:", user.id);
            const data = await storage.getNotifications(user.id);
            console.log("Fetched notifications:", data);
            setNotifications(data);
            setUnreadCount(data.filter((n: any) => !n.read).length);
        } catch (error) {
            console.error("Error loading notifications:", error);
        }
    };

    React.useEffect(() => {
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

    const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

    const NavLinks = () => (
        <>
            {user && (
                <Link href="/inventory" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button variant={isActive('/inventory') ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start md:w-auto">
                        Inventory
                    </Button>
                </Link>
            )}
            {(user?.role === 'CREW' || user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
                <>
                    <Link href="/checkout" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant={isActive('/checkout') ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start md:w-auto">
                            Checkout
                        </Button>
                    </Link>
                    <Link href="/returns" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant={isActive('/returns') ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start md:w-auto">
                            Returns
                        </Button>
                    </Link>
                </>
            )}
            {(user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
                <>
                    <Link href="/verification" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant={isActive('/verification') ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start md:w-auto">
                            Verification
                        </Button>
                    </Link>
                    <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant={isActive('/dashboard') ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start md:w-auto">
                            Dashboard
                        </Button>
                    </Link>
                </>
            )}
        </>
    );

    return (
        <nav className="border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-50 hidden md:block">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    <div className="flex items-center">
                        <Link href="/" className="flex items-center space-x-2 group">
                            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
                                <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">VP App</span>
                        </Link>

                        <div className="hidden md:flex ml-10 space-x-2">
                            <NavLinks />
                        </div>
                    </div>

                    <div className="flex items-center space-x-4">
                        <div className="hidden md:flex items-center space-x-4">
                            {/* Notification Icon & Dropdown */}
                            {user && (
                                <div className="relative">
                                    <button
                                        className={`relative p-2 rounded-full transition-colors ${notificationPermission === 'granted' ? 'text-primary bg-primary/10' : 'text-gray-400 hover:text-gray-600'}`}
                                        onClick={() => {
                                            if (notificationPermission !== 'granted') {
                                                Notification.requestPermission();
                                            } else {
                                                setShowNotifications(!showNotifications);
                                            }
                                        }}
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                        </svg>
                                        {unreadCount > 0 && (
                                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white"></span>
                                        )}
                                    </button>

                                    {/* Notification Dropdown */}
                                    {showNotifications && (
                                        <div className="absolute right-0 mt-2 w-80 bg-white/90 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-700 backdrop-blur-3xl rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white/50 dark:bg-gray-800/50">
                                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
                                                {unreadCount > 0 && (
                                                    <button onClick={markAllRead} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 font-medium">Mark all read</button>
                                                )}
                                            </div>
                                            <div className="max-h-96 overflow-y-auto overflow-x-hidden">
                                                {notifications.length === 0 ? (
                                                    <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">No new notifications</div>
                                                ) : (
                                                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                                        {notifications.map(n => (
                                                            <div
                                                                key={n.id}
                                                                className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${n.read ? 'opacity-60 bg-transparent' : 'bg-blue-50/50 dark:bg-blue-900/10'}`}
                                                                onClick={() => handleNotificationClick(n)}
                                                            >
                                                                <div className="flex gap-3">
                                                                    <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-blue-500'}`} />
                                                                    <div>
                                                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight mb-1">{n.title}</p>
                                                                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{n.message}</p>
                                                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">{new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString()}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {user ? (
                                <div className="flex items-center space-x-4">
                                    <div className="text-sm text-right">
                                        <p className="font-medium leading-none">{user.name}</p>
                                        <p className="text-xs text-muted-foreground mt-1">{user.role}</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={logout}>
                                        Logout
                                    </Button>
                                </div>
                            ) : (
                                <Link href="/login">
                                    <Button variant="primary" size="sm">
                                        Login
                                    </Button>
                                </Link>
                            )}
                        </div>

                        {/* Mobile menu button */}
                        <div className="md:hidden">
                            <Button variant="ghost" size="sm" onClick={toggleMobileMenu}>
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    {isMobileMenuOpen ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    )}
                                </svg>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile menu */}
            {isMobileMenuOpen && (
                <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl animate-accordion-down overflow-hidden">
                    <div className="px-4 pt-2 pb-4 space-y-1 flex flex-col">
                        <NavLinks />
                        <div className="pt-4 mt-4 border-t border-border/40">
                            {user ? (
                                <div className="flex items-center justify-between px-2">
                                    <div>
                                        <p className="font-medium">{user.name}</p>
                                        <p className="text-xs text-muted-foreground">{user.role}</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => { logout(); setIsMobileMenuOpen(false); }}>
                                        Logout
                                    </Button>
                                </div>
                            ) : (
                                <div className="px-2">
                                    <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                                        <Button className="w-full">Login</Button>
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
};
