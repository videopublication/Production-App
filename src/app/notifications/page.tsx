'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { Notification as AppNotification } from '@/types';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useToast } from '@/lib/toast-context';
import { formatDistanceToNow } from 'date-fns';

type FilterType = 'all' | 'unread' | 'read';

export default function NotificationsPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('all');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showActions, setShowActions] = useState(false);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        } else if (user) {
            loadNotifications();
        }
    }, [user, authLoading, router]);

    const loadNotifications = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const data = await storage.getNotifications(user.id);
            setNotifications(data);
        } catch (error) {
            console.error('Failed to load notifications', error);
        } finally {
            setIsLoading(false);
        }
    };

    const markAllRead = async () => {
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length === 0) return;
        await Promise.all(unreadIds.map(id => storage.markNotificationRead(id)));
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        showToast('All notifications marked as read', 'success');
        setShowActions(false);
    };

    const deleteNotification = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDeletingId(id);
        try {
            await storage.deleteNotification(id);
            setNotifications(prev => prev.filter(n => n.id !== id));
            showToast('Notification deleted', 'success');
        } catch (error) {
            showToast('Failed to delete notification', 'error');
        } finally {
            setDeletingId(null);
        }
    };

    const deleteAllNotifications = async () => {
        if (!user) return;
        try {
            await storage.deleteAllNotifications(user.id);
            setNotifications([]);
            setShowDeleteConfirm(false);
            showToast('All notifications cleared', 'success');
        } catch (error) {
            showToast('Failed to clear notifications', 'error');
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const readCount = notifications.filter(n => n.read).length;

    const filteredNotifications = notifications.filter(n => {
        if (filter === 'unread') return !n.read;
        if (filter === 'read') return n.read;
        return true;
    });

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            {/* Header Card with Light Gradient */}
            <div className="mb-4 p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-100/50 dark:border-blue-900/30 shadow-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-800 dark:text-gray-100 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </div>
                            Notifications
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-10">
                            {unreadCount > 0 ? (
                                <span className="font-medium text-blue-600 dark:text-blue-400">{unreadCount} new</span>
                            ) : (
                                "You're all caught up!"
                            )}
                            {notifications.length > 0 && <span> • {notifications.length} total</span>}
                        </p>
                    </div>

                    {/* Actions Menu */}
                    {notifications.length > 0 && (
                        <div className="relative">
                            <button
                                onClick={() => setShowActions(!showActions)}
                                className="p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 border border-gray-200/50 dark:border-gray-700/50 shadow-sm transition-colors"
                            >
                                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                </svg>
                            </button>

                            {showActions && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
                                    <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl z-20 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150 overflow-hidden">
                                        {unreadCount > 0 && (
                                            <button
                                                onClick={markAllRead}
                                                className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center gap-3"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span>Mark all as read</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setShowActions(false); setShowDeleteConfirm(true); }}
                                            className="w-full px-4 py-3 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-3"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </div>
                                            <span>Clear all notifications</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Filter Tabs */}
            {
                notifications.length > 0 && (
                    <div className="segmented-control mb-4">
                        {(['all', 'unread', 'read'] as FilterType[]).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`segmented-control-item ${filter === f ? 'active' : ''}`}
                            >
                                {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Read'}
                                <span className="ml-1 opacity-60">
                                    ({f === 'all' ? notifications.length : f === 'unread' ? unreadCount : readCount})
                                </span>
                            </button>
                        ))}
                    </div>
                )
            }

            {/* Notifications List */}
            {
                isLoading ? (
                    <Card>
                        <div className="divide-y divide-border">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="p-4 animate-pulse">
                                    <div className="flex gap-3">
                                        <div className="w-11 h-11 bg-muted rounded-xl shrink-0" />
                                        <div className="flex-1 space-y-2 py-1">
                                            <div className="h-4 bg-muted rounded w-1/3" />
                                            <div className="h-3 bg-muted rounded w-2/3" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                ) : filteredNotifications.length === 0 ? (
                    <Card className="p-10 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                            </svg>
                        </div>
                        <h3 className="text-base font-semibold mb-1">
                            {filter === 'all' ? 'No notifications yet' : filter === 'unread' ? 'No unread notifications' : 'No read notifications'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            {filter === 'all' ? "When you get notifications, they'll show up here" : filter === 'unread' ? 'All notifications have been read' : 'Read notifications will appear here'}
                        </p>
                    </Card>
                ) : (
                    <Card className="overflow-hidden">
                        <div className="divide-y divide-border">
                            {filteredNotifications.map((notification) => (
                                <Link
                                    key={notification.id}
                                    href={`/notifications/${notification.id}`}
                                    className="block"
                                >
                                    <div className={`
                                    p-4 transition-all hover:bg-muted/50 dark:hover:bg-gray-800/50 relative
                                    ${!notification.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}
                                `}>
                                        <div className="flex items-start gap-3">
                                            {/* Icon */}
                                            <div className="relative shrink-0">
                                                <div className={`
                                                w-11 h-11 rounded-xl flex items-center justify-center
                                                ${!notification.read
                                                        ? 'bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-600 dark:text-blue-400'
                                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                                                    }
                                            `}>
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                    </svg>
                                                </div>
                                                {!notification.read && (
                                                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white" />
                                                )}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0 py-0.5">
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <h3 className={`text-sm leading-snug ${!notification.read ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-600 dark:text-gray-400'}`}>
                                                        {notification.title}
                                                    </h3>
                                                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                                                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: false })}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                                                    {notification.message}
                                                </p>
                                            </div>

                                            {/* Always visible delete button */}
                                            <button
                                                onClick={(e) => deleteNotification(notification.id, e)}
                                                disabled={deletingId === notification.id}
                                                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-all shrink-0 self-center"
                                                title="Delete"
                                            >
                                                {deletingId === notification.id ? (
                                                    <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </Card>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <Card className="max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                            <div className="text-center">
                                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-100 flex items-center justify-center">
                                    <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold mb-2">Clear all notifications?</h3>
                                <p className="text-sm text-muted-foreground mb-6">
                                    This will permanently delete all {notifications.length} notifications.
                                </p>
                                <div className="flex gap-3 justify-center">
                                    <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={deleteAllNotifications}
                                        className="bg-red-600 hover:bg-red-700 text-white"
                                    >
                                        Clear All
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                )
            }
        </div >
    );
}
