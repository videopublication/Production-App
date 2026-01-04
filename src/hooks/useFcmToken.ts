'use client';

import { useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { initFirebase } from '@/lib/firebase';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';

// Module-level flags to prevent multiple runs across all hook instances
let hasSetupToken = false;
let hasSetupListener = false;
let cachedToken: string | null = null;

export default function useFcmToken() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [token, setToken] = useState<string | null>(cachedToken);
    const [notificationPermission, setNotificationPermission] = useState('default');

    useEffect(() => {
        // Prevent running multiple times across ALL hook instances
        if (hasSetupToken) {
            if (cachedToken) {
                setToken(cachedToken);
            }
            return;
        }
        hasSetupToken = true;

        const setupToken = async () => {
            try {
                // Check if service workers are supported
                if (!('serviceWorker' in navigator)) {
                    console.log('[FCM] Service workers not supported');
                    return;
                }

                // Manually register the Firebase messaging service worker
                let swRegistration: ServiceWorkerRegistration;
                try {
                    swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                        scope: '/'
                    });
                    console.log('[FCM] Service worker registered');

                    // Wait for the service worker to be ready
                    await navigator.serviceWorker.ready;
                    console.log('[FCM] Service worker is ready');
                } catch (swError) {
                    console.error('[FCM] Service worker registration failed:', swError);
                    return;
                }

                const { messaging } = await initFirebase();
                if (!messaging) {
                    console.log('[FCM] Messaging not supported');
                    return;
                }

                const permission = await Notification.requestPermission();
                setNotificationPermission(permission);
                console.log('[FCM] Notification permission:', permission);

                if (permission === 'granted') {
                    const currentToken = await getToken(messaging, {
                        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
                        serviceWorkerRegistration: swRegistration
                    });

                    if (currentToken) {
                        console.log('[FCM] Token received:', currentToken.substring(0, 20) + '...');
                        cachedToken = currentToken;
                        setToken(currentToken);

                        // Save token to database if user is logged in
                        if (user?.id) {
                            try {
                                await storage.updateUser(user.id, { fcmToken: currentToken });
                                console.log('[FCM] Token saved to database');
                            } catch (e) {
                                console.error('[FCM] Failed to save FCM token', e);
                            }
                        }
                    } else {
                        console.log('[FCM] No registration token available');
                    }
                }
            } catch (error) {
                console.error('[FCM] Error setting up token:', error);
            }
        };

        setupToken();
    }, [user?.id]);

    // Foreground Message Handler
    useEffect(() => {
        // Prevent running multiple times across ALL hook instances
        if (hasSetupListener) return;
        hasSetupListener = true;

        const setupListener = async () => {
            const { messaging } = await initFirebase();
            if (!messaging) return;

            onMessage(messaging, (payload) => {
                console.log('[FCM] Foreground Message:', payload);
                if (payload.notification) {
                    // Show toast
                    showToast(`${payload.notification.title}: ${payload.notification.body}`, 'success');

                    // Also show browser notification for foreground messages
                    if (Notification.permission === 'granted') {
                        try {
                            const notification = new Notification(payload.notification.title || 'New Notification', {
                                body: payload.notification.body || '',
                                icon: '/icon-192.png',
                                badge: '/icon-192.png',
                            });

                            // Handle notification click
                            notification.onclick = () => {
                                window.focus();
                                if (payload.data?.link) {
                                    window.location.href = payload.data.link;
                                } else {
                                    window.location.href = '/notifications';
                                }
                                notification.close();
                            };
                        } catch (e) {
                            console.error('[FCM] Failed to create notification:', e);
                        }
                    }
                }
            });
        };

        setupListener();
    }, [showToast]);

    return { token, notificationPermission };
}
