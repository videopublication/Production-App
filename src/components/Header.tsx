'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSidebar } from '@/lib/sidebar-context';
import { useDepartment } from '@/lib/department-context';
import { Notification as AppNotification } from '@/types';
import { useNotifications } from '@/hooks/useNotifications';
import useFcmToken from '@/hooks/useFcmToken';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { ArrowLeft } from 'lucide-react';
import { getDepartmentLabels } from '@/lib/department-labels';

export const Header = () => {
    const { user } = useAuth();
    const { isCollapsed } = useSidebar();
    const { notificationPermission, enableNotifications } = useFcmToken();
    const { department, allDepartments, switchDepartment } = useDepartment();
    const labels = getDepartmentLabels(department);
    const router = useRouter();
    const pathname = usePathname();

    // Notification Hook
    const { notifications, unreadCount, markAsRead } = useNotifications();
    const [showNotifications, setShowNotifications] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const handleNotificationClick = async (notif: AppNotification) => {
        if (!notif.read) {
            markAsRead(notif.id);
        }
        setShowNotifications(false);
        // Navigate to the notification detail page
        router.push(`/notifications/${notif.id}`);
    };

    const markAllRead = async () => {
        const unread = notifications.filter(n => !n.read);
        await Promise.all(unread.map(n => markAsRead(n.id)));
    };

    if (!user) return null;

    return (
        // Desktop only - mobile uses MobileHeader component
        <header className={`h-[44px] fixed top-0 right-0 z-30 bg-white/80 backdrop-blur-xl border-b border-[#f5f5f7] px-4 hidden md:flex items-center justify-between transition-all duration-300 ${isCollapsed ? 'left-[72px]' : 'left-[260px]'
            } pl-6 dark:bg-[#2c2c2e]/80 dark:border-[#3a3a3c]`}>
            {/* Page title area */}
            <div className="flex-1 flex items-center">
                {pathname?.startsWith('/shoots/') && pathname !== '/shoots' ? (
                    (() => {
                        const isEditPage = pathname.endsWith('/edit');
                        const backLink = isEditPage ? pathname.replace('/edit', '') : '/shoots';
                        const backText = isEditPage ? `Back to ${labels.workSingular}` : `Back to ${labels.workPlural}`;

                        return (
                            <Link
                                href={backLink}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:opacity-80 transition-opacity"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span>{backText}</span>
                            </Link>
                        );
                    })()
                ) : (pathname?.startsWith('/transactions/') && pathname !== '/transactions') ? (
                    <Link
                        href="/transactions"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:opacity-80 transition-opacity"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back to Transactions</span>
                    </Link>
                ) : (
                    <span className="font-semibold text-[#1d1d1f] text-[15px] dark:text-gray-200">VP App</span>
                )}
            </div>

            <div className="flex items-center gap-4">
                {/* Department Switcher for Super Admin */}
                {user?.role === 'SUPER_ADMIN' && switchDepartment && (
                    <div className="hidden md:flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
                        <span className="text-xs font-medium text-gray-500 px-2">View:</span>
                        <select
                            className="bg-transparent text-sm font-medium text-gray-900 dark:text-gray-100 outline-none cursor-pointer min-w-[140px]"
                            value={department?.id || ''}
                            onChange={(e) => switchDepartment(e.target.value || null)}
                        >
                            <option value="" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Global Overview</option>
                            {allDepartments.map(dept => (
                                <option key={dept.id} value={dept.id} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">{dept.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="relative">
                    <button
                        onClick={async () => {
                            if (
                                notificationPermission !== 'granted' &&
                                typeof window !== 'undefined' &&
                                'Notification' in window &&
                                Notification.permission !== 'denied'
                            ) {
                                await enableNotifications();
                            }
                            setShowNotifications(!showNotifications);
                        }}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors relative dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {unreadCount > 0 && (
                            <span className="absolute top-2 right-2 w-2 h-2 bg-[#ff3b30] rounded-full"></span>
                        )}
                    </button>

                    {/* Notification Dropdown */}
                    {showNotifications && (
                        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50 dark:bg-[#2c2c2e] dark:border-[#3a3a3c]">
                            <div className="px-4 py-3 border-b border-gray-100 dark:border-[#3a3a3c] flex justify-between items-center">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
                                {unreadCount > 0 && (
                                    <button onClick={markAllRead} className="text-xs text-primary hover:text-primary font-medium">Mark all read</button>
                                )}
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="p-6 text-center text-gray-500 text-sm">No notifications</div>
                                ) : (
                                    <div>
                                        {notifications.slice(0, 5).map((n, i) => (
                                            <div
                                                key={n.id}
                                                className={`px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer dark:hover:bg-[#3a3a3c] ${i !== Math.min(4, notifications.length - 1) ? 'border-b border-gray-100 dark:border-[#3a3a3c]' : ''} ${!n.read ? 'bg-primary/10 dark:bg-primary/20' : ''}`}
                                                onClick={() => handleNotificationClick(n)}
                                            >
                                                <div className="flex gap-2">
                                                    <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-primary'}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-sm leading-snug truncate ${!n.read ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-300'}`}>{n.title}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.message}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-[#3a3a3c] text-center">
                                <Link href="/notifications" onClick={() => setShowNotifications(false)} className="text-sm font-medium text-primary hover:text-primary">
                                    View all
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsSettingsOpen(true);
                    }}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>

                <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            </div>
        </header>
    );
};
