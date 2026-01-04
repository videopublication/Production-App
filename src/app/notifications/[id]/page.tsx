'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { Notification as AppNotification } from '@/types';
import { Button } from '@/components/Button';
import { format } from 'date-fns';

export default function NotificationDetailPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const notificationId = params.id as string;

    const [notification, setNotification] = useState<AppNotification | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        } else if (user && notificationId) {
            loadNotification();
        }
    }, [user, authLoading, notificationId, router]);

    const loadNotification = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const data = await storage.getNotifications(user.id);
            const found = data.find((n: AppNotification) => n.id === notificationId);

            if (found) {
                setNotification(found);
                if (!found.read) {
                    await storage.markNotificationRead(notificationId);
                }
            } else {
                setNotFound(true);
            }
        } catch (error) {
            console.error('Failed to load notification', error);
            setNotFound(true);
        } finally {
            setIsLoading(false);
        }
    };

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) return null;

    // Loading state
    if (isLoading) {
        return (
            <div className="max-w-3xl mx-auto animate-fade-in">
                <div className="animate-pulse space-y-8">
                    <div className="h-4 bg-muted rounded w-24" />
                    <div className="h-8 bg-muted rounded w-2/3" />
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-px bg-border" />
                    <div className="space-y-3">
                        <div className="h-4 bg-muted rounded w-full" />
                        <div className="h-4 bg-muted rounded w-5/6" />
                        <div className="h-4 bg-muted rounded w-4/6" />
                    </div>
                </div>
            </div>
        );
    }

    // Not found state
    if (notFound || !notification) {
        return (
            <div className="max-w-3xl mx-auto animate-fade-in text-center py-16">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2">Notification not found</h2>
                <p className="text-muted-foreground mb-8">This notification doesn't exist or has been removed.</p>
                <Link href="/notifications">
                    <Button variant="outline">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Notifications
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Back link */}
            <Link
                href="/notifications"
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Notifications
            </Link>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                {notification.title}
            </h1>

            {/* Date */}
            <p className="text-sm text-muted-foreground mb-8">
                {format(new Date(notification.createdAt), 'EEEE, MMMM d, yyyy \'at\' h:mm a')}
            </p>

            {/* Divider */}
            <div className="h-px bg-border mb-8" />

            {/* Message */}
            <div className="mb-10">
                <p className="text-base sm:text-lg leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {notification.message}
                </p>
            </div>

            {/* Action button */}
            {notification.link && notification.link !== '/' && (
                <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                        variant="primary"
                        size="lg"
                        onClick={() => router.push(notification.link!)}
                    >
                        View Details
                        <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </Button>
                </div>
            )}
        </div>
    );
}
