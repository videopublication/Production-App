'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
    const searchParams = useSearchParams();
    const returnTo = searchParams.get('returnTo');
    const safeReturnTo = returnTo?.startsWith('/') ? returnTo : null;

    // Notification Hook
    const { notifications, unreadCount, markAsRead } = useNotifications();
    const [showNotifications, setShowNotifications] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const handleNotificationClick = async (notif: AppNotification) => {
        if (!notif.read) {
            markAsRead(notif.id);
        }
        setShowNotifications(false);
        router.push(`/notifications/${notif.id}`);
    };

    const markAllRead = async () => {
        const unread = notifications.filter(n => !n.read);
        await Promise.all(unread.map(n => markAsRead(n.id)));
    };

    if (!user) return null;

    const renderNavTitle = () => {
        const customReturnLabel = searchParams.get('returnLabel');

        // Helper to render Breadcrumb navigation with optional Contextual Return
        const renderBreadcrumb = ({
            sectionLabel,
            sectionHref,
            defaultBackText,
        }: {
            sectionLabel: string;
            sectionHref: string;
            defaultBackText: string;
        }) => {
            if (safeReturnTo) {
                const backText = customReturnLabel || defaultBackText;
                return (
                    <div className="flex items-center gap-2.5">
                        <Link
                            href={safeReturnTo}
                            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-primary hover:opacity-80 transition-opacity bg-primary/10 px-2.5 py-1 rounded-lg"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[200px]">{backText}</span>
                        </Link>
                        <span className="text-muted-foreground/40 font-light">|</span>
                        <Link
                            href={sectionHref}
                            className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {sectionLabel}
                        </Link>
                    </div>
                );
            }

            return (
                <Link
                    href={sectionHref}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:opacity-80 transition-opacity"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{sectionLabel}</span>
                </Link>
            );
        };

        if (pathname?.startsWith('/shoots/') && pathname !== '/shoots') {
            const isEditPage = pathname.endsWith('/edit');
            const shootId = pathname.split('/')[2];
            
            if (isEditPage) {
                return (
                    <div className="flex items-center gap-2 text-sm">
                        <Link href="/shoots" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
                            {labels.workPlural}
                        </Link>
                        <span className="text-muted-foreground/50">/</span>
                        <Link href={`/shoots/${shootId}`} className="text-primary hover:opacity-80 transition-opacity font-semibold">
                            {labels.workSingular} Details
                        </Link>
                        <span className="text-muted-foreground/50">/</span>
                        <span className="text-muted-foreground">Edit</span>
                    </div>
                );
            }

            return renderBreadcrumb({
                sectionLabel: labels.workPlural,
                sectionHref: '/shoots',
                defaultBackText: `Back to ${labels.workPlural}`,
            });
        }

        if (pathname?.startsWith('/transactions/') && pathname !== '/transactions') {
            return renderBreadcrumb({
                sectionLabel: 'Transactions',
                sectionHref: '/transactions',
                defaultBackText: 'Back to Transactions',
            });
        }

        if (pathname?.startsWith('/inventory/') && pathname !== '/inventory' && pathname !== '/inventory/add') {
            return renderBreadcrumb({
                sectionLabel: 'Inventory',
                sectionHref: '/inventory',
                defaultBackText: 'Back to Inventory',
            });
        }

        if (pathname?.startsWith('/admin/users/') && pathname !== '/admin/users') {
            return renderBreadcrumb({
                sectionLabel: 'Users',
                sectionHref: '/admin/users',
                defaultBackText: 'Back to Users',
            });
        }

        return <span className="font-semibold text-[#1d1d1f] text-[15px] dark:text-gray-200">VP App</span>;
    };

    return (
        // Desktop only - mobile uses MobileHeader component
        <header className={`h-[44px] fixed top-0 right-0 z-30 bg-white/80 backdrop-blur-xl border-b border-[#f5f5f7] px-4 hidden md:flex items-center justify-between transition-[left] duration-200 ease-[cubic-bezier(0.2,0,0,1)] will-change-[left] ${isCollapsed ? 'left-[72px]' : 'left-[260px]'
            } pl-6 dark:bg-[#2c2c2e]/80 dark:border-[#3a3a3c]`}>
            {/* Page title / Breadcrumb navigation area */}
            <div className="flex-1 flex items-center">
                {renderNavTitle()}
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
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        )}
                    </button>

                    {/* Notifications Dropdown */}
                    {showNotifications && (
                        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200 dark:bg-[#1c1c1e] dark:border-gray-800">
                            <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between dark:border-gray-800">
                                <h3 className="font-semibold text-gray-900 text-sm dark:text-gray-100">Notifications</h3>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllRead}
                                        className="text-xs text-primary hover:underline font-medium"
                                    >
                                        Mark all as read
                                    </button>
                                )}
                            </div>
                            <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                                {notifications.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 text-sm">
                                        No notifications yet
                                    </div>
                                ) : (
                                    notifications.map((notif) => (
                                        <div
                                            key={notif.id}
                                            onClick={() => handleNotificationClick(notif)}
                                            className={`p-4 hover:bg-gray-50/80 transition-colors cursor-pointer dark:hover:bg-gray-800/50 ${!notif.read ? 'bg-primary/5 dark:bg-primary/10' : ''
                                                }`}
                                        >
                                            <div className="flex gap-3">
                                                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!notif.read ? 'bg-primary' : 'bg-transparent'
                                                    }`} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">{notif.title}</p>
                                                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5 dark:text-gray-400">{notif.message}</p>
                                                    <p className="text-[10px] text-gray-400 mt-1.5 dark:text-gray-500">
                                                        {new Date(notif.created_at).toLocaleDateString(undefined, {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Settings Trigger */}
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    title="Settings"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
            </div>

            {/* Settings Drawer Component */}
            <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </header>
    );
};
